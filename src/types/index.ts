/** Comment status. Deleting a comment hides it (`hidden`); there is no separate deleted state. */
export type CommentStatus = "published" | "pending_review" | "hidden";

export type VoteType = "up" | "down";

/**
 * Top-level sort orders. Replies always stay chronological. `pinned` puts
 * pinned comments first, then newest; it only makes sense with pinning enabled.
 */
export type CommentSortOrder = "newest" | "oldest" | "popular" | "pinned";

export interface CommentAuthor {
  id: string;
  name: string;
  avatar_url?: string | null;
  /** Free-form host data (e.g. staff role, membership flags) for the author-badge slot. */
  metadata?: Record<string, unknown>;
}

/**
 * One comment as returned by the backend adapter (flat, no children).
 * `guest_email` is intentionally absent: it is PII that must not reach public clients.
 */
export interface CommentItem {
  id: string;
  target_id: string;
  target_type: string;
  parent_comment_id: string | null;
  /**
   * Materialized path of ancestor ids, root first, dot-separated, ending with
   * this comment's own id (PostgreSQL ltree). Each label must equal a comment
   * id: the tree builder uses it to rebuild ancestors the viewer cannot see.
   */
  path: string | null;
  content: string;
  status: CommentStatus;
  created_at: string | null;
  updated_at: string | null;
  upvote_count: number;
  downvote_count: number;
  user_id: string | null;
  guest_name: string | null;
  image_upload_url: string | null;
  file_upload_url: string | null;
  is_pinned?: boolean;
  author: CommentAuthor | null;
}

/** A comment placed in the reply tree. */
export interface CommentTreeNode extends CommentItem {
  children: CommentTreeNode[];
  /** Stand-in for an ancestor the viewer cannot see (hidden, deleted or pending). */
  isRemoved?: boolean;
}

/**
 * Who is looking at the thread. Supplied by the host as a ref/getter so login
 * and logout are picked up without a reload. Ownership is decided by `userId`
 * only; guests are anonymous sessions that still have a user id.
 */
export interface CommentViewer {
  userId: string | null;
  /** Anonymous (guest) session: must provide a name and email to comment. */
  isAnonymous: boolean;
  canModerate: boolean;
}

export interface CommentTarget {
  targetId: string;
  targetType: string;
}

export interface SubmitCommentInput {
  content: string;
  parentCommentId?: string | null;
  guestName?: string;
  guestEmail?: string;
  imageFile?: File | null;
  attachmentFile?: File | null;
}

export type SubmitCommentPayload = CommentTarget & SubmitCommentInput;

/**
 * Everything the module needs from a backend. Methods reject (throw) on
 * failure; the composable turns the error into a message.
 */
export interface CommentBackendAdapter {
  /**
   * Comments the current viewer may see for a target: published ones plus the
   * viewer's own non-hidden ones. Must be ordered by `path` so a parent always
   * precedes its replies.
   */
  fetchComments(target: CommentTarget): Promise<CommentItem[]>;
  /** Same visibility rules as fetchComments, without loading the comments. */
  countComments(target: CommentTarget): Promise<number>;
  /**
   * The viewer's votes, keyed by comment id. May include votes outside the
   * target; the composable keeps only those for loaded comments.
   */
  fetchUserVotes(target: CommentTarget): Promise<Record<string, VoteType>>;
  /**
   * Stores a new comment. The backend decides its status (published or
   * pending review) and handles attachment uploads.
   */
  submitComment(payload: SubmitCommentPayload): Promise<void>;
  /**
   * Sets the viewer's vote on a comment; `null` removes it. `previous` is the
   * vote the viewer had, so a backend can choose insert, update or delete.
   */
  setVote(
    commentId: string,
    vote: VoteType | null,
    previous: VoteType | null,
  ): Promise<void>;
  updateComment(commentId: string, content: string): Promise<void>;
  /** Hides the viewer's own comment. */
  deleteComment(commentId: string): Promise<void>;

  // Moderation hooks, optional for hosts without an admin panel.
  fetchModerationQueue?(status: CommentStatus | "all"): Promise<CommentItem[]>;
  moderateComment?(
    commentIds: string[],
    action: "publish" | "hide",
    reason?: string,
  ): Promise<void>;
  pinComment?(commentId: string, pinned: boolean): Promise<void>;
  /**
   * Fields other than userId are optional per backend; an adapter must reject
   * targets it cannot store with a clear error.
   */
  banUser?(target: {
    userId?: string;
    guestEmail?: string;
    ipAddress?: string;
    reason?: string;
    expiresAt?: string | null;
  }): Promise<void>;
}

/** All user-facing text of the module. Values that need data are functions. */
export interface CommentMessages {
  common: {
    anonymous: string;
    cancel: string;
    delete: string;
    reply: string;
  };
  section: {
    loadError: (error: string) => string;
    emptyTitle: string;
    emptyHint: string;
    sortLabel: string;
    sortGroupLabel: string;
    sort: Record<CommentSortOrder, string>;
    loadMore: (remaining: number) => string;
  };
  form: {
    title: string;
    replyingTo: string;
    commentLabel: string;
    commentPlaceholder: string;
    replyPlaceholder: string;
    name: string;
    email: string;
    emailHint: string;
    addPhoto: string;
    attachFile: string;
    previewAlt: string;
    removeImage: string;
    submit: string;
    submitting: string;
    sentForModeration: string;
    photoTooLarge: string;
    fileTooLarge: string;
    submitFailed: string;
    charactersLeft: (count: number) => string;
  };
  node: {
    removed: string;
    avatarAlt: string;
    edited: string;
    pending: string;
    pinned: string;
    deletedForPublic: string;
    edit: string;
    editLabel: string;
    deleteLabel: string;
    deleteTitle: string;
    deleteConfirm: string;
    deleting: string;
    save: string;
    saving: string;
    attachmentAlt: string;
    enlargeAttachment: string;
    closeImage: string;
    downloadAttachment: string;
    like: string;
    dislike: string;
    likesSuffix: string;
    dislikesSuffix: string;
    hideReplies: string;
    showReplies: (count: number) => string;
    updateFailed: string;
    deleteFailed: string;
    voteFailed: string;
    loginToVote: string;
  };
  time: {
    justNow: string;
    minutesAgo: (count: number) => string;
    hoursAgo: (count: number) => string;
    daysAgo: (count: number) => string;
  };
  errors: {
    unexpected: string;
    signInRequired: string;
    guestInfoRequired: string;
  };
}

/** Partial override of CommentMessages, merged over a locale preset. */
export type CommentMessagesOverride = {
  [K in keyof CommentMessages]?: Partial<CommentMessages[K]>;
};

export type CommentLocale = "id" | "en";
