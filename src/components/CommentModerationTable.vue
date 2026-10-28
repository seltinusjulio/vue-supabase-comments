<template>
  <div id="comment-moderation-root" class="comments-root space-y-6">
    <!-- Header Controls: Tabs & Search -->
    <div
      id="comment-moderation-controls"
      class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <!-- Filter Tabs -->
      <div
        id="admin-moderation-filter-tabs"
        class="flex flex-wrap gap-2"
        role="tablist"
        :aria-label="msg.moderation.title"
      >
        <button
          v-for="tab in filterTabs"
          :id="`admin-moderation-tab-${tab.value}`"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="activeFilter === tab.value"
          class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--comment-focus-ring)"
          :class="
            activeFilter === tab.value
              ? 'bg-(--comment-primary) text-white'
              : 'bg-(--comment-surface) text-(--comment-text-muted) hover:bg-(--comment-surface-hover) hover:text-(--comment-text)'
          "
          @click="setFilter(tab.value)"
        >
          {{ tab.label }}
          <span
            :id="`admin-moderation-tab-count-${tab.value}`"
            class="ml-1 opacity-70"
            >{{ tab.count }}</span
          >
        </button>
      </div>

      <!-- Search Box -->
      <div
        id="admin-moderation-search-container"
        class="relative w-full sm:w-64"
      >
        <CommentIcon
          name="search"
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--comment-text-muted)"
        />
        <input
          id="admin-moderation-search-input"
          v-model="searchQuery"
          type="text"
          class="cmt-input pl-9"
          :placeholder="msg.moderation.searchPlaceholder"
          :aria-label="msg.moderation.searchPlaceholder"
        />
        <button
          v-if="searchQuery"
          id="admin-moderation-search-clear"
          type="button"
          class="absolute top-1/2 right-2.5 -translate-y-1/2 text-(--comment-text-muted) hover:text-(--comment-text)"
          :aria-label="msg.moderation.clearSearch"
          @click="searchQuery = ''"
        >
          <CommentIcon name="close" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <!-- Bulk Actions Bar -->
    <div
      v-if="selectedIds.size > 0"
      id="admin-moderation-bulk-bar"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--comment-border) bg-(--comment-card-bg) p-3 shadow-xs"
    >
      <div class="flex items-center gap-2">
        <span
          id="admin-moderation-selected-count"
          class="text-sm font-medium text-(--comment-text)"
        >
          {{ msg.moderation.selectedCount(selectedIds.size) }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          id="admin-moderation-bulk-approve"
          type="button"
          class="cmt-btn cmt-btn--primary text-xs"
          :disabled="bulkActionLoading"
          @click="executeBulk('publish')"
        >
          {{ msg.moderation.bulkApprove }}
        </button>
        <button
          id="admin-moderation-bulk-hide"
          type="button"
          class="cmt-btn cmt-btn--danger text-xs"
          :disabled="bulkActionLoading"
          @click="executeBulk('hide')"
        >
          {{ msg.moderation.bulkHide }}
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <CommentAlert
      v-if="error"
      id="admin-moderation-error-alert"
      type="error"
      class="mb-4"
    >
      {{ error }}
    </CommentAlert>

    <!-- Table -->
    <div
      id="admin-moderation-table-wrapper"
      class="overflow-x-auto rounded-lg border border-(--comment-border) bg-(--comment-bg)"
    >
      <table
        id="admin-moderation-table"
        class="w-full text-left text-sm text-(--comment-text)"
      >
        <thead
          id="admin-moderation-table-head"
          class="border-b border-(--comment-border) bg-(--comment-card-bg) text-xs font-medium tracking-wider text-(--comment-text-muted) uppercase"
        >
          <tr id="admin-moderation-header-row">
            <th
              id="admin-moderation-th-select"
              scope="col"
              class="w-10 px-4 py-3"
            >
              <input
                id="admin-moderation-select-all"
                type="checkbox"
                class="rounded border-(--comment-border) text-(--comment-primary) focus:ring-(--comment-focus-ring)"
                :checked="isAllSelected"
                :aria-label="msg.moderation.selectAll"
                @change="toggleSelectAll"
              />
            </th>
            <th
              id="admin-moderation-th-status"
              scope="col"
              class="px-4 py-3 text-left"
            >
              {{ msg.moderation.colStatus }}
            </th>
            <th
              id="admin-moderation-th-content"
              scope="col"
              class="px-4 py-3 text-left"
            >
              {{ msg.moderation.colContent }}
            </th>
            <th
              id="admin-moderation-th-sender"
              scope="col"
              class="hidden px-4 py-3 text-left md:table-cell"
            >
              {{ msg.moderation.colSender }}
            </th>
            <th
              id="admin-moderation-th-date"
              scope="col"
              class="hidden px-4 py-3 text-left lg:table-cell"
            >
              {{ msg.moderation.colDate }}
            </th>
            <th
              id="admin-moderation-th-actions"
              scope="col"
              class="px-4 py-3 text-left"
            >
              {{ msg.moderation.colActions }}
            </th>
          </tr>
        </thead>
        <tbody
          id="admin-moderation-table-body"
          class="divide-y divide-(--comment-border)"
        >
          <!-- Loading State -->
          <tr v-if="isLoading" id="admin-moderation-loading-row">
            <td
              id="admin-moderation-loading-cell"
              colspan="6"
              class="px-4 py-12 text-center text-(--comment-text-muted)"
            >
              <div
                class="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
              ></div>
              <p class="mt-2">{{ msg.moderation.loading }}</p>
            </td>
          </tr>

          <!-- Empty State -->
          <tr
            v-else-if="filteredComments.length === 0"
            id="admin-moderation-empty-row"
          >
            <td
              id="admin-moderation-empty-cell"
              colspan="6"
              class="px-4 py-12 text-center text-(--comment-text-muted)"
            >
              <slot name="empty">
                <p id="admin-moderation-empty-text">
                  {{
                    searchQuery
                      ? msg.moderation.noSearchResults
                      : msg.moderation.empty
                  }}
                </p>
              </slot>
            </td>
          </tr>

          <!-- Comment Rows -->
          <tr
            v-for="comment in filteredComments"
            v-else
            :id="`comment-row-${comment.id}`"
            :key="comment.id"
            class="transition-colors hover:bg-(--comment-surface)"
          >
            <!-- Checkbox -->
            <td :id="`comment-select-cell-${comment.id}`" class="px-4 py-3">
              <input
                :id="`admin-moderation-select-${comment.id}`"
                type="checkbox"
                class="rounded border-(--comment-border) text-(--comment-primary) focus:ring-(--comment-focus-ring)"
                :checked="selectedIds.has(comment.id)"
                :aria-label="msg.moderation.selectRow(comment.id)"
                @change="toggleSelect(comment.id)"
              />
            </td>

            <!-- Status -->
            <td :id="`comment-status-cell-${comment.id}`" class="px-4 py-3">
              <div class="flex flex-col gap-1">
                <span
                  :id="`comment-status-${comment.id}`"
                  class="cmt-badge inline-flex w-fit text-xs font-semibold"
                  :class="statusBadgeClass(comment.status)"
                >
                  {{ statusBadgeLabel(comment.status) }}
                </span>
                <span
                  v-if="comment.is_banned"
                  :id="`comment-banned-badge-${comment.id}`"
                  class="cmt-badge cmt-badge--danger inline-flex w-fit text-xs font-semibold"
                >
                  {{ msg.moderation.statusBanned }}
                </span>
                <span
                  v-if="
                    enablePinning &&
                    comment.is_pinned &&
                    !comment.parent_comment_id
                  "
                  :id="`comment-pinned-badge-${comment.id}`"
                  class="cmt-badge cmt-badge--primary inline-flex w-fit text-xs font-semibold"
                >
                  {{ msg.node.pinned }}
                </span>
              </div>
            </td>

            <!-- Content -->
            <td :id="`comment-content-cell-${comment.id}`" class="px-4 py-3">
              <p
                :id="`comment-text-${comment.id}`"
                class="max-w-xs truncate text-sm font-normal text-(--comment-text)"
              >
                {{ comment.content }}
              </p>

              <!-- Image Attachment -->
              <img
                v-if="comment.image_upload_url"
                :id="`comment-image-${comment.id}`"
                :src="
                  (transformImageUrl
                    ? transformImageUrl(comment.image_upload_url, {
                        width: 400,
                      })
                    : comment.image_upload_url) ?? undefined
                "
                :alt="msg.moderation.photoAttachmentAlt"
                class="mt-1.5 max-h-24 max-w-xs rounded-sm object-contain"
                loading="lazy"
              />

              <!-- File Attachment -->
              <a
                v-if="safeDownloadUrl(comment.file_upload_url)"
                :id="`comment-file-${comment.id}`"
                :href="safeDownloadUrl(comment.file_upload_url)"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-1.5 inline-flex items-center gap-1 text-xs text-(--comment-primary) hover:underline"
              >
                <CommentIcon name="paperclip" class="h-3.5 w-3.5 shrink-0" />
                <span>{{ msg.moderation.downloadAttachment }}</span>
              </a>

              <!-- Target Link / Label -->
              <div
                :id="`comment-target-${comment.id}`"
                class="mt-1 text-xs text-(--comment-text-muted)"
              >
                <slot name="target-link" :comment="comment">
                  <a
                    v-if="resolveTargetUrl(comment)"
                    :id="`comment-target-link-${comment.id}`"
                    :href="resolveTargetUrl(comment)"
                    class="hover:underline"
                  >
                    {{ resolveTargetLabel(comment) }}
                  </a>
                  <span v-else>{{ resolveTargetLabel(comment) }}</span>
                </slot>
              </div>
            </td>

            <!-- Sender -->
            <td
              :id="`comment-sender-cell-${comment.id}`"
              class="hidden px-4 py-3 md:table-cell"
            >
              <slot name="sender" :comment="comment">
                <p
                  :id="`comment-sender-name-${comment.id}`"
                  class="text-sm font-medium text-(--comment-text)"
                >
                  {{
                    comment.author?.name ||
                    comment.guest_name ||
                    msg.moderation.anonymous
                  }}
                </p>
                <p
                  v-if="comment.guest_email"
                  :id="`comment-sender-email-${comment.id}`"
                  class="text-xs text-(--comment-text-muted)"
                >
                  {{ comment.guest_email }}
                </p>
              </slot>
            </td>

            <!-- Date -->
            <td
              :id="`comment-date-cell-${comment.id}`"
              class="hidden px-4 py-3 text-sm text-(--comment-text-muted) lg:table-cell"
            >
              <span :id="`comment-date-${comment.id}`">
                {{ formatDateTimeDisplay(comment.created_at) }}
              </span>
            </td>

            <!-- Actions -->
            <td :id="`comment-actions-cell-${comment.id}`" class="px-4 py-3">
              <div
                class="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2"
              >
                <!-- Approve -->
                <button
                  v-if="comment.status === 'pending_review'"
                  :id="`comment-approve-button-${comment.id}`"
                  type="button"
                  class="cmt-btn cmt-btn--primary text-xs"
                  :disabled="actionLoadingId === comment.id"
                  @click="updateStatus(comment.id, 'publish')"
                >
                  {{ msg.moderation.approve }}
                </button>

                <!-- Hide -->
                <button
                  v-if="comment.status === 'published'"
                  :id="`comment-hide-button-${comment.id}`"
                  type="button"
                  class="cmt-btn cmt-btn--warning text-xs"
                  :disabled="actionLoadingId === comment.id"
                  @click="updateStatus(comment.id, 'hide')"
                >
                  {{ msg.moderation.hide }}
                </button>

                <!-- Show -->
                <button
                  v-if="comment.status === 'hidden'"
                  :id="`comment-show-button-${comment.id}`"
                  type="button"
                  class="cmt-btn cmt-btn--secondary text-xs"
                  :disabled="actionLoadingId === comment.id"
                  @click="updateStatus(comment.id, 'publish')"
                >
                  {{ msg.moderation.show }}
                </button>

                <!-- Pin / Unpin -->
                <button
                  v-if="enablePinning && !comment.parent_comment_id"
                  :id="`comment-pin-button-${comment.id}`"
                  type="button"
                  class="cmt-btn cmt-btn--secondary text-xs"
                  :disabled="actionLoadingId === comment.id"
                  @click="togglePin(comment.id, comment.is_pinned)"
                >
                  {{
                    comment.is_pinned
                      ? msg.moderation.unpin
                      : msg.moderation.pin
                  }}
                </button>

                <!-- Ban / Unban for user_id -->
                <template v-if="comment.user_id">
                  <button
                    v-if="!comment.is_banned"
                    :id="`comment-ban-button-${comment.id}`"
                    type="button"
                    class="cmt-btn cmt-btn--danger text-xs"
                    :disabled="actionLoadingId === comment.id"
                    @click="openBanDialog(comment)"
                  >
                    {{ msg.moderation.ban }}
                  </button>
                  <button
                    v-else
                    :id="`comment-unban-button-${comment.id}`"
                    type="button"
                    class="cmt-btn cmt-btn--secondary text-xs"
                    :disabled="actionLoadingId === comment.id"
                    @click="handleUnban(comment)"
                  >
                    {{ msg.moderation.unban }}
                  </button>
                </template>

                <!-- Delete Permanently -->
                <button
                  v-if="adapter.hardDeleteComment && canHardDelete"
                  :id="`comment-delete-button-${comment.id}`"
                  type="button"
                  class="cmt-btn cmt-btn--danger text-xs"
                  :disabled="actionLoadingId === comment.id"
                  @click="openDeleteDialog(comment)"
                >
                  {{ msg.moderation.deletePermanently }}
                </button>

                <slot name="custom-actions" :comment="comment" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Load More -->
    <div
      v-if="hasMore"
      id="admin-moderation-load-more-container"
      class="mt-6 flex justify-center"
    >
      <button
        id="admin-moderation-load-more-button"
        type="button"
        class="cmt-btn cmt-btn--secondary gap-2"
        :disabled="isLoadingMore"
        @click="loadItems(comments.length, true)"
      >
        <span
          v-if="isLoadingMore"
          class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        {{
          isLoadingMore ? msg.moderation.loadingMore : msg.moderation.loadMore
        }}
      </button>
    </div>

    <!-- Ban Modal Dialog -->
    <CommentDialog
      v-if="isBanDialogOpen && banTarget"
      id="admin-moderation-ban-dialog"
      :open="isBanDialogOpen"
      labelledby="admin-moderation-ban-dialog-title"
      @close="closeBanDialog"
    >
      <div class="border-b border-(--comment-border) p-4">
        <h2
          id="admin-moderation-ban-dialog-title"
          class="text-lg font-bold text-(--comment-heading)"
        >
          {{ msg.moderation.banTitle(banTarget.userName) }}
        </h2>
      </div>

      <div class="space-y-4 p-6">
        <div>
          <label for="admin-moderation-ban-reason" class="block">
            <span
              class="mb-1 block text-xs font-medium tracking-wider text-(--comment-text-muted) uppercase"
            >
              {{ msg.moderation.banReasonLabel }}
            </span>
            <textarea
              id="admin-moderation-ban-reason"
              v-model="banReason"
              rows="3"
              class="cmt-input mt-1 tracking-normal normal-case"
              :placeholder="msg.moderation.banReasonPlaceholder"
            />
          </label>
        </div>

        <div>
          <p
            class="mb-2 block text-xs font-medium tracking-wider text-(--comment-text-muted) uppercase"
          >
            {{ msg.moderation.banDurationLabel }}
          </p>
          <div id="admin-moderation-ban-presets" class="flex flex-wrap gap-2">
            <button
              v-for="preset in durationPresets"
              :id="`admin-moderation-ban-preset-${preset.id}`"
              :key="preset.id"
              type="button"
              class="rounded-full px-3 py-1 text-sm font-medium transition-colors"
              :class="
                banSelectedPreset === preset.id
                  ? 'bg-(--comment-danger) text-white'
                  : 'bg-(--comment-surface) text-(--comment-text-muted) hover:bg-(--comment-surface-hover)'
              "
              @click="selectBanPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>
          <p
            v-if="banExpiresAt"
            id="admin-moderation-ban-expires-text"
            class="mt-2 text-xs text-(--comment-text-muted)"
          >
            {{
              msg.moderation.banExpiresAt(formatDateTimeDisplay(banExpiresAt))
            }}
          </p>
          <p
            v-else
            id="admin-moderation-ban-permanent-text"
            class="mt-2 text-xs text-(--comment-danger)"
          >
            {{ msg.moderation.banPermanent }}
          </p>
        </div>

        <CommentAlert
          v-if="banError"
          id="admin-moderation-ban-error"
          type="error"
        >
          {{ banError }}
        </CommentAlert>
      </div>

      <div
        class="flex justify-end gap-3 border-t border-(--comment-border) p-4"
      >
        <button
          id="admin-moderation-ban-cancel"
          type="button"
          class="cmt-btn cmt-btn--secondary"
          :disabled="isBanSubmitting"
          @click="closeBanDialog"
        >
          {{ msg.common.cancel }}
        </button>
        <button
          id="admin-moderation-ban-submit"
          type="button"
          class="cmt-btn cmt-btn--danger"
          :disabled="isBanSubmitting"
          @click="submitBan"
        >
          <span
            v-if="isBanSubmitting"
            class="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {{ msg.moderation.banSubmit }}
        </button>
      </div>
    </CommentDialog>

    <!-- Hard Delete Modal Dialog -->
    <CommentDialog
      v-if="isDeleteDialogOpen && deleteTarget"
      id="admin-moderation-delete-dialog"
      :open="isDeleteDialogOpen"
      labelledby="admin-moderation-delete-dialog-title"
      @close="closeDeleteDialog"
    >
      <div class="border-b border-(--comment-border) p-4">
        <h2
          id="admin-moderation-delete-dialog-title"
          class="text-lg font-bold text-(--comment-heading)"
        >
          {{ msg.moderation.deleteConfirmTitle }}
        </h2>
      </div>

      <div class="space-y-4 p-6">
        <p
          id="admin-moderation-delete-dialog-text"
          class="text-sm text-(--comment-text)"
        >
          {{ msg.moderation.deleteConfirmMessage }}
        </p>

        <div
          v-if="deleteTarget.content"
          id="admin-moderation-delete-target-preview"
          class="rounded-md border border-(--comment-border) bg-(--comment-surface) p-3 text-xs text-(--comment-text-muted) italic"
        >
          "{{ deleteTarget.content }}"
        </div>

        <CommentAlert
          v-if="deleteError"
          id="admin-moderation-delete-error"
          type="error"
        >
          {{ deleteError }}
        </CommentAlert>
      </div>

      <div
        class="flex justify-end gap-3 border-t border-(--comment-border) p-4"
      >
        <button
          id="admin-moderation-delete-cancel"
          type="button"
          class="cmt-btn cmt-btn--secondary"
          :disabled="isDeleteSubmitting"
          @click="closeDeleteDialog"
        >
          {{ msg.common.cancel }}
        </button>
        <button
          id="admin-moderation-delete-submit"
          type="button"
          class="cmt-btn cmt-btn--danger"
          :disabled="isDeleteSubmitting"
          @click="submitDelete"
        >
          <span
            v-if="isDeleteSubmitting"
            class="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {{ msg.moderation.deleteSubmit }}
        </button>
      </div>
    </CommentDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import type {
  CommentBackendAdapter,
  CommentLocale,
  CommentMessages,
  CommentMessagesOverride,
  CommentModerationItem,
  CommentStatus,
} from "../types";

import { resolveCommentMessages } from "../locales";
import { getErrorMessage } from "../utils/errors";
import { formatDateTime } from "../utils/time";
import { safeLinkUrl } from "../utils/url";
import CommentAlert from "./CommentAlert.vue";
import CommentDialog from "./CommentDialog.vue";
import CommentIcon from "./CommentIcon.vue";

defineOptions({ name: "CommentModerationTable" });

type FilterStatus = CommentStatus | "all";

const props = withDefaults(
  defineProps<{
    adapter: CommentBackendAdapter;
    locale?: CommentLocale;
    messages?: CommentMessagesOverride;
    enablePinning?: boolean;
    pageSize?: number;
    dateLocale?: string;
    timeZone?: string;
    transformImageUrl?: (url: string, opts: { width: number }) => string;
    targetUrl?: (comment: CommentModerationItem) => string | undefined;
    targetLabel?: (comment: CommentModerationItem) => string | undefined;
    canHardDelete?: boolean;
  }>(),
  {
    locale: "id",
    messages: undefined,
    enablePinning: false,
    pageSize: 20,
    dateLocale: "id-ID",
    timeZone: "Asia/Jakarta",
    transformImageUrl: undefined,
    targetUrl: undefined,
    targetLabel: undefined,
    canHardDelete: true,
  },
);

const emit = defineEmits<{
  notify: [payload: { level: "success" | "error" | "info"; message: string }];
}>();

const msg = computed<CommentMessages>(() =>
  resolveCommentMessages(props.locale, props.messages),
);

const activeFilter = ref<FilterStatus>("pending_review");
const searchQuery = ref("");
const comments = ref<CommentModerationItem[]>([]);
const selectedIds = ref<Set<string>>(new Set());
const isLoading = ref(false);
const isLoadingMore = ref(false);
const hasMore = ref(false);
const actionLoadingId = ref<string | null>(null);
const bulkActionLoading = ref(false);
const error = ref<string | null>(null);

const statusCounts = ref<Record<FilterStatus, number>>({
  all: 0,
  pending_review: 0,
  published: 0,
  hidden: 0,
});

// Ban dialog state
const isBanDialogOpen = ref(false);
const banTarget = ref<{ userId: string; userName: string } | null>(null);
const banReason = ref("");
const banSelectedPreset = ref("permanent");
const banExpiresAt = ref<string | null>(null);
const isBanSubmitting = ref(false);
const banError = ref<string | null>(null);

// Hard delete dialog state
const isDeleteDialogOpen = ref(false);
const deleteTarget = ref<CommentModerationItem | null>(null);
const isDeleteSubmitting = ref(false);
const deleteError = ref<string | null>(null);

const durationPresets = computed(() => [
  { id: "week", label: msg.value.moderation.banPresetWeek, days: 7 },
  { id: "month", label: msg.value.moderation.banPresetMonth, days: 30 },
  {
    id: "three_months",
    label: msg.value.moderation.banPresetThreeMonths,
    days: 90,
  },
  {
    id: "permanent",
    label: msg.value.moderation.banPresetPermanent,
    days: null,
  },
]);

const filterTabs = computed(() => [
  {
    value: "all" as const,
    label: msg.value.moderation.filterAll,
    count: statusCounts.value.all,
  },
  {
    value: "pending_review" as const,
    label: msg.value.moderation.filterPending,
    count: statusCounts.value.pending_review,
  },
  {
    value: "published" as const,
    label: msg.value.moderation.filterPublished,
    count: statusCounts.value.published,
  },
  {
    value: "hidden" as const,
    label: msg.value.moderation.filterHidden,
    count: statusCounts.value.hidden,
  },
]);

const filteredComments = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return comments.value;
  return comments.value.filter((comment) => {
    const content = (comment.content || "").toLowerCase();
    const author = (comment.author?.name || "").toLowerCase();
    const guestName = (comment.guest_name || "").toLowerCase();
    const guestEmail = (comment.guest_email || "").toLowerCase();
    return (
      content.includes(query) ||
      author.includes(query) ||
      guestName.includes(query) ||
      guestEmail.includes(query)
    );
  });
});

const isAllSelected = computed(() => {
  const visible = filteredComments.value;
  return (
    visible.length > 0 && visible.every((c) => selectedIds.value.has(c.id))
  );
});

const setFilter = (value: FilterStatus) => {
  activeFilter.value = value;
  selectedIds.value = new Set();
  void loadItems(0);
};

const statusBadgeLabel = (status: CommentStatus) => {
  if (status === "published") return msg.value.moderation.statusPublished;
  if (status === "pending_review") return msg.value.moderation.statusPending;
  if (status === "hidden") return msg.value.moderation.statusHidden;
  return status;
};

const statusBadgeClass = (status: CommentStatus) => {
  if (status === "published") return "cmt-badge--primary";
  if (status === "pending_review") return "cmt-badge--warning";
  if (status === "hidden") return "cmt-badge--danger";
  return "";
};

const safeDownloadUrl = (
  url: string | null | undefined,
): string | undefined => {
  if (!url) return undefined;
  return safeLinkUrl(url);
};

const resolveTargetLabel = (comment: CommentModerationItem): string => {
  if (props.targetLabel) {
    const label = props.targetLabel(comment);
    if (label) return label;
  }
  if (comment.target_type === "song") return msg.value.moderation.targetSong;
  if (comment.target_type === "article")
    return msg.value.moderation.targetArticle;
  return comment.target_type;
};

const resolveTargetUrl = (
  comment: CommentModerationItem,
): string | undefined => {
  if (props.targetUrl) return props.targetUrl(comment);
  return undefined;
};

const formatDateTimeDisplay = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "-";
  return formatDateTime(dateStr, {
    locale: props.dateLocale,
    timeZone: props.timeZone,
  });
};

const loadCounts = async () => {
  if (!props.adapter.fetchModerationCounts) return;
  try {
    const counts = await props.adapter.fetchModerationCounts();
    statusCounts.value = {
      all: counts.all ?? 0,
      pending_review: counts.pending_review ?? 0,
      published: counts.published ?? 0,
      hidden: counts.hidden ?? 0,
    };
  } catch {
    // Non-critical, preserve previous counts
  }
};

const loadItems = async (offset = 0, append = false) => {
  if (!props.adapter.fetchModerationQueue) return;
  if (offset === 0) {
    isLoading.value = true;
  } else {
    isLoadingMore.value = true;
  }
  error.value = null;

  try {
    const result = await props.adapter.fetchModerationQueue({
      status: activeFilter.value,
      offset,
      limit: props.pageSize + 1,
      search: searchQuery.value || undefined,
    });

    let items: CommentModerationItem[] = [];
    let hasMoreResult = false;

    if (Array.isArray(result)) {
      hasMoreResult = result.length > props.pageSize;
      items = hasMoreResult ? result.slice(0, props.pageSize) : result;
    } else if (result) {
      items = result.items ?? [];
      hasMoreResult = Boolean(result.hasMore);
      if (result.statusCounts) {
        statusCounts.value = {
          all: result.statusCounts.all ?? 0,
          pending_review: result.statusCounts.pending_review ?? 0,
          published: result.statusCounts.published ?? 0,
          hidden: result.statusCounts.hidden ?? 0,
        };
      }
    }

    hasMore.value = hasMoreResult;
    if (append) {
      comments.value = [...comments.value, ...items];
    } else {
      comments.value = items;
    }
  } catch (err) {
    error.value = getErrorMessage(err, msg.value.errors.unexpected);
    emit("notify", { level: "error", message: error.value });
  } finally {
    if (offset === 0) isLoading.value = false;
    else isLoadingMore.value = false;
  }
};

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(filteredComments.value.map((c) => c.id));
  }
};

const toggleSelect = (id: string) => {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
};

const updateStatus = async (id: string, action: "publish" | "hide") => {
  if (!props.adapter.moderateComment) return;
  actionLoadingId.value = id;
  try {
    await props.adapter.moderateComment([id], action);
    emit("notify", {
      level: "success",
      message: msg.value.moderation.successStatusUpdated,
    });
    // Update local state
    const target = comments.value.find((c) => c.id === id);
    if (target) {
      target.status = action === "publish" ? "published" : "hidden";
    }
    void loadCounts();
  } catch (err) {
    emit("notify", {
      level: "error",
      message: getErrorMessage(err, msg.value.moderation.errorStatusUpdate),
    });
  } finally {
    actionLoadingId.value = null;
  }
};

const togglePin = async (id: string, currentPinned = false) => {
  if (!props.adapter.pinComment) return;
  actionLoadingId.value = id;
  try {
    await props.adapter.pinComment(id, !currentPinned);
    const target = comments.value.find((c) => c.id === id);
    if (target) {
      target.is_pinned = !currentPinned;
    }
  } catch (err) {
    emit("notify", {
      level: "error",
      message: getErrorMessage(err, msg.value.moderation.errorStatusUpdate),
    });
  } finally {
    actionLoadingId.value = null;
  }
};

const executeBulk = async (action: "publish" | "hide") => {
  if (!props.adapter.moderateComment || selectedIds.value.size === 0) return;
  bulkActionLoading.value = true;
  const ids = Array.from(selectedIds.value);
  try {
    await props.adapter.moderateComment(ids, action);
    emit("notify", {
      level: "success",
      message: msg.value.moderation.successStatusUpdated,
    });
    const newStatus = action === "publish" ? "published" : "hidden";
    for (const id of ids) {
      const c = comments.value.find((item) => item.id === id);
      if (c) c.status = newStatus;
    }
    selectedIds.value = new Set();
    void loadCounts();
  } catch (err) {
    emit("notify", {
      level: "error",
      message: getErrorMessage(err, msg.value.moderation.errorStatusUpdate),
    });
  } finally {
    bulkActionLoading.value = false;
  }
};

const openBanDialog = (comment: CommentModerationItem) => {
  if (!comment.user_id) return;
  banTarget.value = {
    userId: comment.user_id,
    userName:
      comment.author?.name ||
      comment.guest_name ||
      msg.value.moderation.anonymous,
  };
  banReason.value = "";
  banSelectedPreset.value = "permanent";
  banExpiresAt.value = null;
  banError.value = null;
  isBanDialogOpen.value = true;
};

const closeBanDialog = () => {
  isBanDialogOpen.value = false;
  banTarget.value = null;
  banReason.value = "";
  banExpiresAt.value = null;
  banError.value = null;
};

const selectBanPreset = (preset: { id: string; days: number | null }) => {
  banSelectedPreset.value = preset.id;
  if (preset.days === null) {
    banExpiresAt.value = null;
  } else {
    const d = new Date();
    d.setDate(d.getDate() + preset.days);
    banExpiresAt.value = d.toISOString();
  }
};

const submitBan = async () => {
  if (!props.adapter.banUser || !banTarget.value) return;
  isBanSubmitting.value = true;
  banError.value = null;
  try {
    await props.adapter.banUser({
      userId: banTarget.value.userId,
      reason: banReason.value || undefined,
      expiresAt: banExpiresAt.value,
    });
    emit("notify", {
      level: "success",
      message: msg.value.moderation.successBanned,
    });
    // Mark banned in local state
    for (const c of comments.value) {
      if (c.user_id === banTarget.value.userId) {
        c.is_banned = true;
      }
    }
    closeBanDialog();
  } catch (err) {
    banError.value = getErrorMessage(err, msg.value.moderation.errorBan);
  } finally {
    isBanSubmitting.value = false;
  }
};

const handleUnban = async (comment: CommentModerationItem) => {
  if (!props.adapter.unbanUser || !comment.user_id) return;
  actionLoadingId.value = comment.id;
  try {
    await props.adapter.unbanUser(comment.user_id);
    emit("notify", {
      level: "success",
      message: msg.value.moderation.successUnbanned,
    });
    // Unmark banned in local state
    for (const c of comments.value) {
      if (c.user_id === comment.user_id) {
        c.is_banned = false;
      }
    }
  } catch (err) {
    emit("notify", {
      level: "error",
      message: getErrorMessage(err, msg.value.moderation.errorUnban),
    });
  } finally {
    actionLoadingId.value = null;
  }
};

const openDeleteDialog = (comment: CommentModerationItem) => {
  deleteTarget.value = comment;
  deleteError.value = null;
  isDeleteDialogOpen.value = true;
};

const closeDeleteDialog = () => {
  isDeleteDialogOpen.value = false;
  deleteTarget.value = null;
  deleteError.value = null;
};

const submitDelete = async () => {
  if (!props.adapter.hardDeleteComment || !deleteTarget.value) return;
  isDeleteSubmitting.value = true;
  deleteError.value = null;
  const targetId = deleteTarget.value.id;
  try {
    await props.adapter.hardDeleteComment(targetId);
    emit("notify", {
      level: "success",
      message: msg.value.moderation.successDeleted,
    });
    comments.value = comments.value.filter((c) => c.id !== targetId);
    selectedIds.value.delete(targetId);
    void loadCounts();
    closeDeleteDialog();
  } catch (err) {
    deleteError.value = getErrorMessage(err, msg.value.moderation.errorDelete);
  } finally {
    isDeleteSubmitting.value = false;
  }
};

onMounted(async () => {
  await Promise.all([loadItems(0), loadCounts()]);
});

watch(activeFilter, () => {
  selectedIds.value = new Set();
});
</script>
