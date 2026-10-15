import { computed, type MaybeRefOrGetter, ref, toValue, watch } from "vue";

import type {
  CommentBackendAdapter,
  CommentMessages,
  CommentSortOrder,
  CommentTarget,
  CommentTreeNode,
  CommentViewer,
  SubmitCommentInput,
  VoteType,
} from "../types";

import { resolveCommentMessages } from "../locales";
import { getErrorMessage } from "../utils/errors";
import {
  applyVoteDelta,
  buildCommentTree,
  countVisible,
  findComment,
  sortRoots,
} from "../utils/tree";

export const DEFAULT_PAGE_SIZE = 10;

export interface CommentTreeOptions {
  /** The thread to load; `null` means nothing to load yet. */
  target: MaybeRefOrGetter<CommentTarget | null>;
  /** The current viewer; a change of user reloads the thread. */
  viewer: MaybeRefOrGetter<CommentViewer | null>;
  /** Text used for error messages raised by the composable itself. */
  messages?: MaybeRefOrGetter<CommentMessages>;
  /** Top-level comments per page. */
  pageSize?: number;
  defaultSortOrder?: CommentSortOrder;
  /**
   * Called for every handled error (e.g. to log it). Return a string to use
   * it as the user-facing message instead of the error's own message.
   */
  onError?: (context: string, error: unknown) => string | void;
}

export interface LoadCommentsOptions {
  /** Go back to the first page (default true). */
  resetPagination?: boolean;
  /**
   * Keep `loading` false, e.g. for refetches after a mutation, so the thread
   * and any open reply or edit form stay mounted.
   */
  silent?: boolean;
}

/**
 * Reactive state and actions for one comment thread. Each call is an
 * independent instance, so several threads can live on one page. Nothing is
 * fetched on creation: call `load()` (typically from `onMounted` or a user
 * action), which keeps the composable safe to create during SSR.
 */
export function useCommentTree(
  adapter: CommentBackendAdapter,
  options: CommentTreeOptions,
) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const defaultSortOrder = options.defaultSortOrder ?? "oldest";
  const messages = computed(
    () => toValue(options.messages) ?? resolveCommentMessages("id"),
  );
  const viewer = computed(() => toValue(options.viewer));

  const comments = ref<CommentTreeNode[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const userVotes = ref<Record<string, VoteType>>({});
  const visibleRootCount = ref(pageSize);
  const sortOrderState = ref<CommentSortOrder>(defaultSortOrder);

  // Every fetch takes a ticket; only the newest one may write, so a slow
  // response cannot overwrite newer data or repopulate a thread that was
  // already reset (reset() also invalidates tickets).
  let latestRequestId = 0;
  // How many fetch results were applied, so an in-flight vote can tell whether
  // the tree it adjusted optimistically has been replaced in the meantime.
  let appliedFetchCount = 0;
  // Fetches still waiting for the backend; one that started before a vote
  // committed can resolve after it with counts read too early.
  let inFlightFetches = 0;
  let lastTarget: CommentTarget | null = null;
  // Set after a top-level comment was posted; see revealPendingComment().
  let pendingReveal: {
    knownIds: Set<string>;
    isOwn: (comment: CommentTreeNode) => boolean;
  } | null = null;

  // Only top-level comments are sorted; replies stay in chronological order.
  const sortedComments = computed(() =>
    sortRoots(comments.value, sortOrderState.value),
  );
  const totalCount = computed(() => countVisible(comments.value));
  const visibleComments = computed(() =>
    sortedComments.value.slice(0, visibleRootCount.value),
  );
  const hasMore = computed(
    () => comments.value.length > visibleRootCount.value,
  );
  const sortOrder = computed(() => sortOrderState.value);

  function report(context: string, err: unknown): string {
    const message = options.onError?.(context, err);
    return typeof message === "string"
      ? message
      : getErrorMessage(err, messages.value.errors.unexpected);
  }

  function loadMore() {
    visibleRootCount.value += pageSize;
  }

  function setSortOrder(order: CommentSortOrder) {
    sortOrderState.value = order;
    visibleRootCount.value = pageSize;
  }

  /** Loads the thread named by the `target` option. */
  async function load(loadOptions: LoadCommentsOptions = {}) {
    await fetchThread(toValue(options.target), loadOptions);
  }

  /** Silent refetch of the last loaded thread that keeps the page size. */
  async function refresh() {
    await fetchThread(lastTarget, { resetPagination: false, silent: true });
  }

  async function fetchThread(
    target: CommentTarget | null,
    { resetPagination = true, silent = false }: LoadCommentsOptions,
  ) {
    if (!target) return;
    const requestId = ++latestRequestId;
    inFlightFetches++;
    lastTarget = target;
    if (!silent) loading.value = true;
    error.value = null;
    if (resetPagination) visibleRootCount.value = pageSize;
    try {
      const userId = viewer.value?.userId;
      // A failed vote lookup should not hide the thread itself.
      const votesRequest = userId
        ? adapter.fetchUserVotes(target).catch((err: unknown) => {
            report("fetchUserVotes", err);
            return null;
          })
        : Promise.resolve(null);
      const [items, votes] = await Promise.all([
        adapter.fetchComments(target),
        votesRequest,
      ]);

      if (requestId !== latestRequestId) return;

      comments.value = buildCommentTree(items);
      const commentIds = new Set(items.map((c) => c.id));
      userVotes.value = Object.fromEntries(
        Object.entries(votes ?? {}).filter(([id]) => commentIds.has(id)),
      );
      appliedFetchCount++;
      revealPendingComment();
    } catch (err) {
      if (requestId === latestRequestId) {
        error.value = report("fetchComments", err);
      }
    } finally {
      inFlightFetches--;
      if (requestId === latestRequestId) loading.value = false;
    }
  }

  // A new top-level comment can land beyond the first page for the current
  // order (last when sorted oldest first). Rather than rendering every comment,
  // switch to newest first, where it is on top. The check runs once, on the
  // first fetch applied after the insert. It still runs if the submit's own
  // refetch lost its ticket, and cannot linger if the comment stays pending.
  function revealPendingComment() {
    const pending = pendingReveal;
    if (!pending) return;
    pendingReveal = null;
    const created = comments.value.filter(
      (c) => !c.isRemoved && !pending.knownIds.has(c.id) && pending.isOwn(c),
    );
    if (created.length === 0) return;
    const visibleIds = new Set(visibleComments.value.map((c) => c.id));
    if (created.some((c) => !visibleIds.has(c.id))) setSortOrder("newest");
  }

  async function submitComment(input: SubmitCommentInput): Promise<boolean> {
    error.value = null;
    try {
      const target = toValue(options.target);
      const current = viewer.value;
      const userId = current?.userId;
      if (!target || !userId) {
        throw new Error(messages.value.errors.signInRequired);
      }
      if (
        current.isAnonymous &&
        !(input.guestName?.trim() && input.guestEmail?.trim())
      ) {
        throw new Error(messages.value.errors.guestInfoRequired);
      }

      const knownRootIds = new Set(comments.value.map((c) => c.id));
      await adapter.submitComment({ ...target, ...input });

      if (!input.parentCommentId) {
        pendingReveal = {
          knownIds: knownRootIds,
          isOwn: (c) => c.user_id === userId,
        };
      }
      await fetchThread(target, { resetPagination: false, silent: true });
      return true;
    } catch (err) {
      error.value = report("submitComment", err);
      return false;
    }
  }

  function setUserVote(commentId: string, vote: VoteType | undefined) {
    if (vote) {
      userVotes.value = { ...userVotes.value, [commentId]: vote };
    } else {
      const { [commentId]: _removed, ...rest } = userVotes.value;
      userVotes.value = rest;
    }
  }

  function adjustCounts(
    commentId: string,
    previous: VoteType | undefined,
    next: VoteType | undefined,
  ) {
    const node = findComment(comments.value, commentId);
    if (node) applyVoteDelta(node, previous, next);
  }

  /**
   * Votes optimistically. Voting the same way again removes the vote. Returns
   * false without contacting the backend when nobody is signed in.
   */
  async function voteComment(
    commentId: string,
    voteType: VoteType,
  ): Promise<boolean> {
    if (!viewer.value?.userId) return false;

    const existing = userVotes.value[commentId];
    const next = existing === voteType ? undefined : voteType;

    const appliedBefore = appliedFetchCount;
    // True when a fetch finished, or is still running, around this vote, so the
    // local tree can no longer be trusted. Reconciling starts a newer fetch,
    // which also makes any older, stale one lose its ticket.
    const racedWithFetch = () =>
      appliedFetchCount !== appliedBefore || inFlightFetches > 0;

    // Optimistic update; rolled back below if the mutation fails.
    adjustCounts(commentId, existing, next);
    setUserVote(commentId, next);

    try {
      await adapter.setVote(commentId, next ?? null, existing ?? null);
      // A refetch around the vote may carry counts read before it committed.
      if (racedWithFetch()) await refresh();
      return true;
    } catch (err) {
      setUserVote(commentId, existing);
      if (racedWithFetch()) {
        // The tree was replaced meanwhile, so subtracting locally would be wrong.
        await refresh();
      } else {
        adjustCounts(commentId, next, existing);
      }
      error.value = report("voteComment", err);
      return false;
    }
  }

  async function updateComment(id: string, content: string): Promise<boolean> {
    error.value = null;
    try {
      await adapter.updateComment(id, content);
      await refresh();
      return true;
    } catch (err) {
      error.value = report("updateComment", err);
      return false;
    }
  }

  async function deleteComment(id: string): Promise<boolean> {
    error.value = null;
    try {
      await adapter.deleteComment(id);
      await refresh();
      return true;
    } catch (err) {
      error.value = report("deleteComment", err);
      return false;
    }
  }

  function reset() {
    latestRequestId++;
    lastTarget = null;
    pendingReveal = null;
    comments.value = [];
    loading.value = false;
    error.value = null;
    userVotes.value = {};
    sortOrderState.value = defaultSortOrder;
    visibleRootCount.value = pageSize;
  }

  // Signing in or out changes which comments (own pending ones) and votes the
  // viewer sees, so reload the thread that is currently shown.
  watch(
    () => viewer.value?.userId ?? null,
    () => {
      void refresh();
    },
  );

  return {
    comments,
    visibleComments,
    totalCount,
    hasMore,
    sortOrder,
    loading,
    error,
    userVotes,
    viewer,
    load,
    refresh,
    loadMore,
    setSortOrder,
    submitComment,
    voteComment,
    updateComment,
    deleteComment,
    reset,
  };
}

export type CommentTree = ReturnType<typeof useCommentTree>;
