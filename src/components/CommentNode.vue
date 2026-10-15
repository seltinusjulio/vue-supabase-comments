<template>
  <div
    :id="`comment-node-${comment.id}`"
    :class="
      level === 0
        ? 'border-b border-(--comment-border) py-4 last:border-b-0'
        : 'pt-4'
    "
  >
    <p
      v-if="comment.isRemoved"
      :id="`comment-removed-${comment.id}`"
      class="py-1 text-sm text-(--comment-text-muted) italic"
    >
      {{ msg.node.removed }}
    </p>
    <template v-else>
      <div
        :id="`comment-header-${comment.id}`"
        class="flex items-start justify-between gap-2"
        :class="{ 'opacity-60': isHidden }"
      >
        <div
          :id="`comment-author-info-${comment.id}`"
          class="flex min-w-0 items-center"
        >
          <div
            :id="`comment-avatar-container-${comment.id}`"
            class="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-(--comment-surface)"
          >
            <img
              v-if="avatarSrc && !avatarFailed"
              :id="`comment-avatar-${comment.id}`"
              :src="avatarSrc"
              :alt="msg.node.avatarAlt"
              class="h-full w-full object-cover"
              loading="lazy"
              width="32"
              height="32"
              @error="onAvatarError"
            />
            <CommentAvatarFallback
              v-else
              :id="`comment-avatar-fallback-${comment.id}`"
              :name="knownName"
            />
          </div>
          <div
            :id="`comment-meta-${comment.id}`"
            class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
          >
            <span
              :id="`comment-author-name-${comment.id}`"
              class="truncate font-semibold text-(--comment-heading)"
              >{{ authorName }}</span
            >
            <SlotOutlet
              v-if="ctx.slots['author-badge'] && comment.author"
              :render="ctx.slots['author-badge']"
              :slot-props="{ author: comment.author, comment }"
            />
            <time
              :id="`comment-date-${comment.id}`"
              :datetime="comment.created_at ?? undefined"
              :title="absoluteDate"
              class="text-xs text-(--comment-text-muted)"
              >{{ relativeDate }}</time
            >
            <span
              v-if="
                comment.updated_at && comment.updated_at !== comment.created_at
              "
              :id="`comment-edited-${comment.id}`"
              class="text-xs text-(--comment-text-muted) italic"
              >{{ msg.node.edited }}</span
            >
            <span
              v-if="features.pinning && comment.is_pinned"
              :id="`comment-pinned-badge-${comment.id}`"
              class="cmt-badge cmt-badge--primary"
              >{{ msg.node.pinned }}</span
            >
            <span
              v-if="isPending"
              :id="`comment-pending-badge-${comment.id}`"
              class="cmt-badge cmt-badge--warning"
              >{{ msg.node.pending }}</span
            >
            <span
              v-if="isHidden"
              :id="`comment-hidden-badge-${comment.id}`"
              class="cmt-badge cmt-badge--danger"
              >{{ msg.node.deletedForPublic }}</span
            >
          </div>
        </div>

        <!-- Owner actions -->
        <div
          v-if="isOwner && !isEditing"
          :id="`comment-owner-actions-${comment.id}`"
          class="-mt-1 -mr-2 flex shrink-0 items-center"
        >
          <button
            v-if="canEdit"
            :id="`comment-edit-button-${comment.id}`"
            type="button"
            class="cmt-action"
            :aria-label="msg.node.editLabel"
            :title="msg.node.edit"
            @click="startEdit"
          >
            <CommentIcon name="pencil" class="h-4 w-4" />
          </button>
          <button
            v-if="canDelete"
            :id="`comment-delete-button-${comment.id}`"
            type="button"
            class="cmt-action cmt-action--danger"
            :aria-label="msg.node.deleteLabel"
            :title="msg.common.delete"
            @click="showDeleteConfirm = true"
          >
            <CommentIcon name="trash" class="h-4 w-4" />
          </button>
        </div>

        <CommentDialog
          v-if="canDelete"
          :id="`comment-delete-modal-${comment.id}`"
          :open="showDeleteConfirm"
          :labelledby="`comment-delete-modal-title-${comment.id}`"
          @close="closeDeleteConfirm"
        >
          <div class="border-b border-(--comment-border) p-4">
            <h2
              :id="`comment-delete-modal-title-${comment.id}`"
              class="text-lg font-bold text-(--comment-heading)"
            >
              {{ msg.node.deleteTitle }}
            </h2>
          </div>
          <div class="p-6">
            <p>{{ msg.node.deleteConfirm }}</p>
          </div>
          <div
            class="flex justify-end gap-3 border-t border-(--comment-border) p-4"
          >
            <button
              :id="`comment-delete-cancel-button-${comment.id}`"
              type="button"
              class="cmt-btn cmt-btn--secondary"
              :disabled="isDeleting"
              @click="closeDeleteConfirm"
            >
              {{ msg.common.cancel }}
            </button>
            <button
              :id="`comment-delete-confirm-button-${comment.id}`"
              type="button"
              class="cmt-btn cmt-btn--danger"
              :disabled="isDeleting"
              @click="handleDelete"
            >
              {{ isDeleting ? msg.node.deleting : msg.common.delete }}
            </button>
          </div>
        </CommentDialog>
      </div>

      <!-- Edit mode -->
      <div
        v-if="isEditing"
        :id="`comment-edit-container-${comment.id}`"
        class="mt-2"
      >
        <textarea
          :id="`comment-edit-textarea-${comment.id}`"
          v-model="editContent"
          :aria-label="msg.node.editLabel"
          :maxlength="features.maxLength ?? undefined"
          rows="3"
          class="cmt-input"
        ></textarea>
        <div :id="`comment-edit-buttons-${comment.id}`" class="mt-2 flex gap-2">
          <button
            :id="`comment-save-edit-${comment.id}`"
            type="button"
            class="cmt-btn cmt-btn--primary"
            :disabled="!editContent.trim() || isSaving"
            @click="handleSave"
          >
            {{ isSaving ? msg.node.saving : msg.node.save }}
          </button>
          <button
            :id="`comment-cancel-edit-${comment.id}`"
            type="button"
            class="cmt-btn cmt-btn--secondary"
            @click="cancelEdit"
          >
            {{ msg.common.cancel }}
          </button>
        </div>
      </div>

      <div
        v-else
        :id="`comment-content-container-${comment.id}`"
        class="mt-2 text-(--comment-text)"
        :class="{ 'opacity-60': isHidden }"
      >
        <!-- Plain text interpolation only (never v-html), so no sanitizer is needed. -->
        <p
          :id="`comment-text-${comment.id}`"
          class="leading-relaxed break-words whitespace-pre-line"
        >
          {{ comment.content }}
        </p>
        <div
          v-if="comment.image_upload_url && !attachmentFailed"
          :id="`comment-image-container-${comment.id}`"
          class="mt-2 aspect-square w-full max-w-64 overflow-hidden rounded-lg bg-(--comment-surface)"
          :class="{
            'animate-pulse motion-reduce:animate-none': !attachmentLoaded,
          }"
        >
          <button
            :id="`comment-image-open-button-${comment.id}`"
            type="button"
            class="cmt-focus block h-full w-full cursor-zoom-in"
            :aria-label="msg.node.enlargeAttachment"
            @click="openViewer"
          >
            <img
              :id="`comment-image-attachment-${comment.id}`"
              :src="attachmentSrc"
              :alt="msg.node.attachmentAlt"
              class="h-full w-full object-cover transition-opacity duration-300"
              :class="attachmentLoaded ? 'opacity-100' : 'opacity-0'"
              loading="lazy"
              @load="attachmentLoaded = true"
              @error="onAttachmentError"
            />
          </button>
        </div>
        <a
          v-if="comment.file_upload_url"
          :id="`comment-file-attachment-${comment.id}`"
          :href="comment.file_upload_url"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 inline-flex items-center gap-1.5 text-sm text-(--comment-primary) hover:underline"
        >
          <CommentIcon name="paperclip" class="h-4 w-4 shrink-0" />
          <span>{{ msg.node.downloadAttachment }}</span>
        </a>
      </div>

      <template v-if="comment.image_upload_url && viewerMounted">
        <SlotOutlet
          v-if="ctx.slots['image-viewer']"
          :render="ctx.slots['image-viewer']"
          :slot-props="{
            src: comment.image_upload_url,
            alt: msg.node.attachmentAlt,
            open: showViewer,
            close: closeViewer,
          }"
        />
        <CommentImageViewer
          v-else
          :id="`comment-image-lightbox-${comment.id}`"
          :open="showViewer"
          :src="comment.image_upload_url"
          :alt="msg.node.attachmentAlt"
          :close-label="msg.node.closeImage"
          @close="closeViewer"
        />
      </template>

      <div
        :id="`comment-footer-${comment.id}`"
        class="mt-1 -ml-2 flex items-center gap-1"
        :class="{ 'opacity-60': isHidden }"
      >
        <button
          :id="`comment-reply-button-${comment.id}`"
          type="button"
          class="cmt-action"
          :aria-expanded="isReplying"
          @click="isReplying = !isReplying"
        >
          <CommentIcon name="message" class="h-4 w-4" />
          <span>{{ msg.common.reply }}</span>
        </button>

        <template v-if="features.voting">
          <button
            :id="`comment-upvote-button-${comment.id}`"
            type="button"
            class="cmt-action"
            :class="{ 'cmt-action--active': myVote === 'up' }"
            :disabled="isVoting"
            :aria-pressed="myVote === 'up'"
            :aria-label="msg.node.like"
            :title="canVote ? msg.node.like : msg.node.loginToVote"
            @click="handleVote('up')"
          >
            <CommentIcon name="arrow-up" class="h-4 w-4" />
            <span
              v-if="comment.upvote_count > 0"
              :id="`comment-upvote-count-${comment.id}`"
              >{{ comment.upvote_count }}</span
            >
          </button>
          <button
            :id="`comment-downvote-button-${comment.id}`"
            type="button"
            class="cmt-action"
            :class="{ 'cmt-action--active-danger': myVote === 'down' }"
            :disabled="isVoting"
            :aria-pressed="myVote === 'down'"
            :aria-label="msg.node.dislike"
            :title="canVote ? msg.node.dislike : msg.node.loginToVote"
            @click="handleVote('down')"
          >
            <CommentIcon name="arrow-down" class="h-4 w-4" />
            <span
              v-if="comment.downvote_count > 0"
              :id="`comment-downvote-count-${comment.id}`"
              >{{ comment.downvote_count }}</span
            >
          </button>
        </template>

        <SlotOutlet
          v-if="ctx.slots['comment-actions']"
          :render="ctx.slots['comment-actions']"
          :slot-props="{ comment }"
        />
      </div>

      <div
        v-if="isReplying"
        :id="`comment-reply-form-container-${comment.id}`"
        class="mt-3"
      >
        <CommentForm
          :parent-comment-id="comment.id"
          :reply-to-name="authorName"
          @cancel="isReplying = false"
          @success="onReplySuccess"
        />
      </div>
    </template>

    <!-- Long threads start collapsed behind a toggle -->
    <button
      v-if="isLongThread"
      :id="`comment-replies-toggle-${comment.id}`"
      type="button"
      class="cmt-action mt-1 -ml-2"
      :aria-expanded="repliesExpanded"
      :aria-controls="
        repliesExpanded ? `comment-children-container-${comment.id}` : undefined
      "
      @click="repliesExpanded = !repliesExpanded"
    >
      <CommentIcon
        name="chevron-up"
        class="h-4 w-4 transition-transform"
        :class="{ 'rotate-180': !repliesExpanded }"
      />
      <span>{{
        repliesExpanded
          ? msg.node.hideReplies
          : msg.node.showReplies(replyCount)
      }}</span>
    </button>

    <!-- Replies hang off a thread line under the avatar. Past maxDepth
         levels they stay flat so text keeps a usable width. -->
    <div
      v-if="showReplies"
      :id="`comment-children-container-${comment.id}`"
      :class="
        level < features.maxDepth
          ? 'mt-1 ml-4 border-l-2 border-(--comment-border) pl-3 sm:pl-4'
          : ''
      "
    >
      <CommentNodeSelf
        v-for="child in comment.children"
        :key="child.id"
        :comment="child"
        :level="level + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import type { CommentTreeNode, VoteType } from "../types";

import { formatDateTime, formatRelativeTime } from "../utils/time";
import CommentAvatarFallback from "./CommentAvatarFallback.vue";
import CommentDialog from "./CommentDialog.vue";
import CommentForm from "./CommentForm.vue";
import CommentIcon from "./CommentIcon.vue";
import CommentImageViewer from "./CommentImageViewer.vue";
// Explicit self-import for the reply recursion: an implicit <CommentNode>
// would resolve to a host's globally registered component of the same name.
import CommentNodeSelf from "./CommentNode.vue";
import { useCommentSectionContext } from "./context";
import SlotOutlet from "./SlotOutlet";

defineOptions({ name: "CommentNode" });

const props = withDefaults(
  defineProps<{
    comment: CommentTreeNode;
    level?: number;
  }>(),
  { level: 0 },
);

// Threads with more replies than this start collapsed.
const COLLAPSE_REPLY_THRESHOLD = 3;
const AVATAR_WIDTH = 64;
const ATTACHMENT_WIDTH = 512;

const ctx = useCommentSectionContext();
const msg = computed(() => ctx.messages.value);
const features = computed(() => ctx.features.value);
const viewer = computed(() => ctx.tree.viewer.value);

const isReplying = ref(false);
const repliesExpanded = ref(false);
// Not reset via a watcher: nodes are keyed by comment id, so an instance never
// switches to another comment, and editing only changes `content`.
const avatarUseOriginal = ref(false);
const avatarFailed = ref(false);
const attachmentUseOriginal = ref(false);
const attachmentFailed = ref(false);
const attachmentLoaded = ref(false);
const showViewer = ref(false);
// The viewer is created on first use and then kept.
const viewerMounted = ref(false);
const isEditing = ref(false);
const editContent = ref("");
const isSaving = ref(false);
const isVoting = ref(false);
const showDeleteConfirm = ref(false);
const isDeleting = ref(false);

const countReplies = (nodes: CommentTreeNode[]): number =>
  nodes.reduce(
    (sum, child) =>
      sum + (child.isRemoved ? 0 : 1) + countReplies(child.children ?? []),
    0,
  );

const replyCount = computed(() => countReplies(props.comment.children ?? []));
const isLongThread = computed(
  () => replyCount.value > COLLAPSE_REPLY_THRESHOLD,
);
const showReplies = computed(
  () =>
    (props.comment.children?.length ?? 0) > 0 &&
    (!isLongThread.value || repliesExpanded.value),
);

// A reply posted into a collapsed thread would otherwise stay out of sight.
const onReplySuccess = () => {
  isReplying.value = false;
  repliesExpanded.value = true;
};

const isOwner = computed(
  () => !!viewer.value?.userId && viewer.value.userId === props.comment.user_id,
);
const isHidden = computed(() => props.comment.status === "hidden");
const isPending = computed(() => props.comment.status === "pending_review");

const withinEditWindow = computed(() => {
  const minutes = features.value.editWindowMinutes;
  if (minutes === null) return true;
  const created = props.comment.created_at
    ? Date.parse(props.comment.created_at)
    : Number.NaN;
  if (Number.isNaN(created)) return false;
  return ctx.now.value.getTime() - created < minutes * 60_000;
});
// The backend only allows editing published comments.
const canEdit = computed(
  () =>
    isOwner.value &&
    props.comment.status === "published" &&
    withinEditWindow.value,
);
const canDelete = computed(() => isOwner.value && !isHidden.value);

// Guests (anonymous sessions) cannot vote.
const canVote = computed(
  () => !!viewer.value?.userId && !viewer.value.isAnonymous,
);
const myVote = computed<VoteType | undefined>(() =>
  canVote.value ? ctx.tree.userVotes.value[props.comment.id] : undefined,
);

// Shows a transformed (e.g. resized) image first and retries with the
// original URL when the transformed one fails.
const imageSource = (
  url: string | null | undefined,
  width: number,
  useOriginal: boolean,
) => {
  if (!url) return undefined;
  return useOriginal ? url : ctx.transformImageUrl(url, { width });
};

const avatarSrc = computed(() =>
  imageSource(
    props.comment.author?.avatar_url,
    AVATAR_WIDTH,
    avatarUseOriginal.value,
  ),
);
const attachmentSrc = computed(() =>
  imageSource(
    props.comment.image_upload_url,
    ATTACHMENT_WIDTH,
    attachmentUseOriginal.value,
  ),
);

const canRetryOriginal = (url: string | null | undefined, width: number) =>
  !!url && ctx.transformImageUrl(url, { width }) !== url;

const onAvatarError = () => {
  if (
    !avatarUseOriginal.value &&
    canRetryOriginal(props.comment.author?.avatar_url, AVATAR_WIDTH)
  ) {
    avatarUseOriginal.value = true;
  } else {
    avatarFailed.value = true;
  }
};

const onAttachmentError = () => {
  if (
    !attachmentUseOriginal.value &&
    canRetryOriginal(props.comment.image_upload_url, ATTACHMENT_WIDTH)
  ) {
    attachmentUseOriginal.value = true;
  } else {
    attachmentFailed.value = true;
  }
};

const knownName = computed(
  () => props.comment.author?.name || props.comment.guest_name || "",
);
const authorName = computed(
  () => knownName.value || msg.value.common.anonymous,
);

const relativeDate = computed(() =>
  formatRelativeTime(
    props.comment.created_at,
    ctx.now.value,
    msg.value.time,
    ctx.dateOptions.value,
  ),
);
const absoluteDate = computed(() =>
  formatDateTime(props.comment.created_at, ctx.dateOptions.value),
);

const openViewer = () => {
  viewerMounted.value = true;
  showViewer.value = true;
};
const closeViewer = () => {
  showViewer.value = false;
};

const startEdit = () => {
  editContent.value = props.comment.content;
  isEditing.value = true;
};

const cancelEdit = () => {
  isEditing.value = false;
  editContent.value = "";
};

const notifyError = (fallback: string) => {
  ctx.notify({ level: "error", message: ctx.tree.error.value ?? fallback });
};

const handleSave = async () => {
  if (!editContent.value.trim()) return;
  isSaving.value = true;
  try {
    const success = await ctx.tree.updateComment(
      props.comment.id,
      editContent.value.trim(),
    );
    if (success) isEditing.value = false;
    else notifyError(msg.value.node.updateFailed);
  } finally {
    isSaving.value = false;
  }
};

const closeDeleteConfirm = () => {
  if (!isDeleting.value) showDeleteConfirm.value = false;
};

const handleDelete = async () => {
  if (isDeleting.value) return;
  isDeleting.value = true;
  try {
    const success = await ctx.tree.deleteComment(props.comment.id);
    if (!success) notifyError(msg.value.node.deleteFailed);
  } finally {
    isDeleting.value = false;
    showDeleteConfirm.value = false;
  }
};

const handleVote = async (voteType: VoteType) => {
  if (!canVote.value) {
    ctx.notify({ level: "error", message: msg.value.node.loginToVote });
    return;
  }
  if (isVoting.value) return;
  isVoting.value = true;
  try {
    const success = await ctx.tree.voteComment(props.comment.id, voteType);
    if (!success) notifyError(msg.value.node.voteFailed);
  } finally {
    isVoting.value = false;
  }
};
</script>
