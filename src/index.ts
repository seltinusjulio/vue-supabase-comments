export {
  type CommentTree,
  type CommentTreeOptions,
  DEFAULT_PAGE_SIZE,
  type LoadCommentsOptions,
  useCommentTree,
} from "./composables/useCommentTree";
export { commentLocales, en, id, resolveCommentMessages } from "./locales";
export type * from "./types";
export { getErrorMessage } from "./utils/errors";
export {
  applyVoteDelta,
  buildCommentTree,
  countVisible,
  findComment,
  sortRoots,
} from "./utils/tree";
export { default as CommentAvatarFallback } from "./components/CommentAvatarFallback.vue";
export { default as CommentForm } from "./components/CommentForm.vue";
export { default as CommentModerationTable } from "./components/CommentModerationTable.vue";
export { default as CommentNode } from "./components/CommentNode.vue";
export { default as CommentSection } from "./components/CommentSection.vue";
export {
  COMMENT_SECTION_CONTEXT,
  type CommentFeatures,
  type CommentNotification,
  type CommentSectionContext,
  type NotifyLevel,
  type TransformImageUrl,
  useCommentSectionContext,
} from "./components/context";
export { getAvatarColorIndex, getInitials } from "./utils/avatar";
export {
  type DateFormatOptions,
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from "./utils/time";
