import type {
  CommentItem,
  CommentSortOrder,
  CommentTreeNode,
  VoteType,
} from "../types";

// Ids of every ancestor, root first. The ltree `path` holds the whole chain
// (the last label is the comment itself), which lets us rebuild ancestors the
// viewer cannot see; fall back to the direct parent when it is missing.
const getAncestorIds = (comment: CommentItem): string[] => {
  if (typeof comment.path === "string") {
    return comment.path.split(".").slice(0, -1);
  }
  return comment.parent_comment_id ? [comment.parent_comment_id] : [];
};

const buildRemovedPlaceholder = (
  id: string,
  parentCommentId: string | null,
  sample: CommentItem,
): CommentTreeNode => ({
  id,
  target_id: sample.target_id,
  target_type: sample.target_type,
  parent_comment_id: parentCommentId,
  path: null,
  content: "",
  status: "hidden",
  created_at: sample.created_at,
  updated_at: null,
  upvote_count: 0,
  downvote_count: 0,
  user_id: null,
  guest_name: null,
  image_upload_url: null,
  file_upload_url: null,
  author: null,
  children: [],
  isRemoved: true,
});

/**
 * Builds the reply tree in a single O(n) pass. Works because the input is
 * ordered by path, so parents always precede their replies. A reply whose
 * ancestor was not returned (deleted, hidden or still pending for this viewer)
 * is hung under a "removed" placeholder instead of being promoted to a
 * top-level comment.
 */
export function buildCommentTree(flatList: CommentItem[]): CommentTreeNode[] {
  const map: Record<string, CommentTreeNode> = {};
  const roots: CommentTreeNode[] = [];

  for (const comment of flatList) {
    const node: CommentTreeNode = { ...comment, children: [] };
    map[comment.id] = node;

    let parent: CommentTreeNode | undefined;
    for (const ancestorId of getAncestorIds(comment)) {
      let ancestor = map[ancestorId];
      if (!ancestor) {
        ancestor = buildRemovedPlaceholder(
          ancestorId,
          parent?.id ?? null,
          comment,
        );
        map[ancestorId] = ancestor;
        (parent ? parent.children : roots).push(ancestor);
      }
      parent = ancestor;
    }
    (parent ? parent.children : roots).push(node);
  }

  return roots;
}

const toTime = (value: string | null) => (value ? Date.parse(value) || 0 : 0);

const byNewest = (a: CommentTreeNode, b: CommentTreeNode) =>
  toTime(b.created_at) - toTime(a.created_at);

/**
 * Sorts top-level comments without mutating the input. `oldest` keeps the
 * backend order (path order is chronological for roots). When pinning is
 * active, pinned comments always appear at the top.
 */
export function sortRoots(
  roots: CommentTreeNode[],
  order: CommentSortOrder,
  enablePinning = true,
): CommentTreeNode[] {
  if (!enablePinning) {
    if (order === "oldest") return roots;
    if (order === "newest") return [...roots].sort(byNewest);
    const score = (c: CommentTreeNode) => c.upvote_count - c.downvote_count;
    return [...roots].sort((a, b) => score(b) - score(a) || byNewest(a, b));
  }

  const pinnedRoots: CommentTreeNode[] = [];
  const normalRoots: CommentTreeNode[] = [];

  for (const root of roots) {
    if (root.is_pinned) {
      pinnedRoots.push(root);
    } else {
      normalRoots.push(root);
    }
  }

  if (pinnedRoots.length === 0 && order === "oldest") {
    return roots;
  }

  const score = (c: CommentTreeNode) => c.upvote_count - c.downvote_count;

  const sortGroup = (group: CommentTreeNode[]) => {
    if (order === "oldest") return group;
    if (order === "newest") return [...group].sort(byNewest);
    return [...group].sort((a, b) => score(b) - score(a) || byNewest(a, b));
  };

  const sortedPinned =
    order === "popular"
      ? [...pinnedRoots].sort((a, b) => score(b) - score(a) || byNewest(a, b))
      : order === "oldest"
        ? pinnedRoots
        : [...pinnedRoots].sort(byNewest);

  return [...sortedPinned, ...sortGroup(normalRoots)];
}

/**
 * Counts every visible comment, replies included. Removed placeholders and
 * hidden comments (only visible to staff) are not part of the count.
 */
export function countVisible(nodes: CommentTreeNode[]): number {
  return nodes.reduce(
    (sum, node) =>
      sum +
      (node.isRemoved || node.status === "hidden" ? 0 : 1) +
      countVisible(node.children),
    0,
  );
}

export function findComment(
  nodes: CommentTreeNode[],
  id: string,
): CommentTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findComment(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Moves a comment's vote counts from `previous` to `next`, mirroring what the
 * backend tally does, so a vote can be shown without refetching the tree.
 */
export function applyVoteDelta(
  node: CommentTreeNode,
  previous: VoteType | undefined,
  next: VoteType | undefined,
): void {
  if (previous === "up") node.upvote_count -= 1;
  if (previous === "down") node.downvote_count -= 1;
  if (next === "up") node.upvote_count += 1;
  if (next === "down") node.downvote_count += 1;
}
