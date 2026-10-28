<template>
  <div id="comment-section-container" class="comments-root space-y-6">
    <CommentForm />
    <div
      v-if="error && comments.length === 0"
      id="comment-section-error"
      class="text-(--comment-danger-strong)"
    >
      <p id="comment-section-error-text">
        {{ msg.section.loadError(error) }}
      </p>
    </div>
    <div
      v-else-if="comments.length === 0"
      id="comment-section-empty"
      class="py-6 text-center"
    >
      <CommentIcon
        name="message"
        class="mx-auto mb-2 h-8 w-8 text-(--comment-text-muted) opacity-60"
      />
      <p
        id="comment-section-empty-title"
        class="font-medium text-(--comment-text)"
      >
        {{ msg.section.emptyTitle }}
      </p>
      <p
        id="comment-section-empty-hint"
        class="mt-1 text-sm text-(--comment-text-muted)"
      >
        {{ msg.section.emptyHint }}
      </p>
    </div>
    <div v-else id="comment-section-list">
      <div
        v-if="comments.length > 1"
        id="comment-section-sort"
        role="group"
        :aria-label="msg.section.sortGroupLabel"
        class="mb-2 flex flex-wrap items-center justify-end gap-1"
      >
        <span
          id="comment-section-sort-label"
          class="mr-1 text-sm text-(--comment-text-muted)"
          >{{ msg.section.sortLabel }}</span
        >
        <button
          v-for="order in sortOptions"
          :id="`comment-section-sort-${order}`"
          :key="order"
          type="button"
          class="cmt-action"
          :class="{ 'cmt-action--active': sortOrder === order }"
          :aria-pressed="sortOrder === order"
          @click="tree.setSortOrder(order)"
        >
          {{ msg.section.sort[order] }}
        </button>
      </div>
      <CommentNode
        v-for="comment in visibleComments"
        :key="comment.id"
        :comment="comment"
      />
      <div
        v-if="hasMore"
        id="comment-section-load-more-container"
        class="mt-4 flex justify-center"
      >
        <button
          id="comment-section-load-more-button"
          type="button"
          class="cmt-focus rounded-sm text-sm font-medium text-(--comment-primary) hover:underline"
          @click="tree.loadMore()"
        >
          {{ msg.section.loadMore(comments.length - visibleComments.length) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A complete comment thread: form, sorted and paginated list, nested replies.
 *
 * Either pass a `tree` the host already manages (e.g. to show a count before
 * loading), or pass `adapter`, `targetId`, `targetType` and `viewer` and the
 * section creates and loads its own thread on mount.
 *
 * Slots (forwarded to every nested comment):
 * - author-badge `{ author, comment }`: badge next to the author name.
 * - comment-actions `{ comment }`: extra actions in a comment's footer.
 * - auth-prompt `{ parentCommentId }`: replaces the form when the viewer
 *   must sign in (no session, or a guest while guests are not allowed).
 * - image-viewer `{ src, alt, open, close }`: replaces the built-in viewer
 *   for image attachments.
 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  useSlots,
} from "vue";

import type {
  CommentBackendAdapter,
  CommentLocale,
  CommentMessagesOverride,
  CommentSortOrder,
  CommentTarget,
  CommentViewer,
} from "../types";

import {
  type CommentTree,
  useCommentTree,
} from "../composables/useCommentTree";
import { resolveCommentMessages } from "../locales";
import CommentForm from "./CommentForm.vue";
import CommentIcon from "./CommentIcon.vue";
import CommentNode from "./CommentNode.vue";
import {
  COMMENT_SECTION_CONTEXT,
  type CommentNotification,
  type TransformImageUrl,
} from "./context";

/** How often relative dates ("3 menit lalu") move on. */
const CLOCK_INTERVAL_MS = 30_000;

const DATE_LOCALES: Record<CommentLocale, string> = {
  en: "en-US",
  id: "id-ID",
};

const props = withDefaults(
  defineProps<{
    /** A thread managed by the host; when set, adapter/target/viewer are ignored. */
    tree?: CommentTree;
    adapter?: CommentBackendAdapter;
    targetId?: string;
    targetType?: string;
    viewer?: CommentViewer | null;
    locale?: CommentLocale;
    messages?: CommentMessagesOverride;
    enableVoting?: boolean;
    enableAttachments?: boolean;
    allowGuests?: boolean;
    enablePinning?: boolean;
    /** Reply levels that get their own indentation; deeper replies render flat. */
    maxDepth?: number;
    maxLength?: number | null;
    /** Minutes after posting during which the author may edit; null = always. */
    editWindowMinutes?: number | null;
    transformImageUrl?: TransformImageUrl;
    /** Locale for dates; defaults to the one matching `locale`. */
    dateLocale?: string;
    timeZone?: string;
    pageSize?: number;
    /** Logs handled errors; a returned string replaces the error message. */
    errorHandler?: (context: string, error: unknown) => string | void;
  }>(),
  {
    tree: undefined,
    adapter: undefined,
    targetId: undefined,
    targetType: undefined,
    viewer: null,
    locale: "id",
    messages: () => ({}),
    enableVoting: true,
    enableAttachments: true,
    allowGuests: true,
    enablePinning: false,
    maxDepth: 3,
    maxLength: null,
    editWindowMinutes: null,
    transformImageUrl: (url: string) => url,
    dateLocale: undefined,
    timeZone: undefined,
    pageSize: undefined,
    errorHandler: undefined,
  },
);

const emit = defineEmits<{
  (e: "notify", notification: CommentNotification): void;
}>();

const messages = computed(() =>
  resolveCommentMessages(props.locale, props.messages),
);

const ownTarget = computed<CommentTarget | null>(() =>
  props.targetId && props.targetType
    ? { targetId: props.targetId, targetType: props.targetType }
    : null,
);

function createOwnTree(): CommentTree {
  if (!props.adapter) {
    throw new Error("CommentSection needs either a `tree` or an `adapter`.");
  }
  return useCommentTree(props.adapter, {
    target: ownTarget,
    viewer: () => props.viewer,
    messages,
    pageSize: props.pageSize,
    enablePinning: () => props.enablePinning,
    onError: (context, error) => props.errorHandler?.(context, error),
  });
}

// Chosen once: switching between an external and an own thread is not supported.
const tree = props.tree ?? createOwnTree();
const { comments, visibleComments, hasMore, error, sortOrder } = tree;

const sortOptions: readonly CommentSortOrder[] = [
  "newest",
  "oldest",
  "popular",
];

const msg = messages;

const now = ref(new Date());
let clock: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  clock = setInterval(() => {
    now.value = new Date();
  }, CLOCK_INTERVAL_MS);
  if (!props.tree) void tree.load();
});

onBeforeUnmount(() => clearInterval(clock));

provide(COMMENT_SECTION_CONTEXT, {
  tree,
  nodeComponent: CommentNode,
  messages,
  features: computed(() => ({
    voting: props.enableVoting,
    attachments: props.enableAttachments,
    allowGuests: props.allowGuests,
    pinning: props.enablePinning,
    maxDepth: props.maxDepth,
    maxLength: props.maxLength,
    editWindowMinutes: props.editWindowMinutes,
  })),
  dateOptions: computed(() => ({
    locale: props.dateLocale ?? DATE_LOCALES[props.locale],
    timeZone: props.timeZone,
  })),
  transformImageUrl: (url, options) => props.transformImageUrl(url, options),
  now,
  slots: useSlots(),
  notify: (notification) => emit("notify", notification),
});
</script>
