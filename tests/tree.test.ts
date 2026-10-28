import { describe, expect, it } from "vitest";

import type { CommentTreeNode } from "../src/types";

import {
  applyVoteDelta,
  buildCommentTree,
  countVisible,
  findComment,
  sortRoots,
} from "../src/utils/tree";
import { item } from "./helpers";

describe("buildCommentTree", () => {
  it("nests replies under their parent, in arrival order (path-sorted input)", () => {
    const tree = buildCommentTree([
      item("c1"),
      item("c2", { parent_comment_id: "c1" }),
      item("c3", { parent_comment_id: "c2" }),
      item("c4"),
    ]);

    expect(tree.map((c) => c.id)).toEqual(["c1", "c4"]);
    expect(tree[0]?.children[0]?.id).toBe("c2");
    expect(tree[0]?.children[0]?.children[0]?.id).toBe("c3");
    expect(tree[1]?.children).toEqual([]);
  });

  it("hangs a reply under a 'removed' placeholder when its parent is missing (no path)", () => {
    const tree = buildCommentTree([
      item("c2", { parent_comment_id: "gone" }),
      item("c3", { parent_comment_id: "c2" }),
    ]);

    expect(tree).toHaveLength(1);
    const placeholder = tree[0];
    expect(placeholder?.id).toBe("gone");
    expect(placeholder?.isRemoved).toBe(true);
    expect(placeholder?.content).toBe("");
    expect(placeholder?.status).toBe("hidden");
    expect(placeholder?.target_id).toBe("post-1");
    expect(placeholder?.children[0]?.id).toBe("c2");
    expect(placeholder?.children[0]?.children[0]?.id).toBe("c3");
  });

  it("rebuilds every missing ancestor from the path", () => {
    const tree = buildCommentTree([
      item("c3", { parent_comment_id: "b", path: "a.b.c3" }),
    ]);

    expect(tree.map((c) => c.id)).toEqual(["a"]);
    expect(tree[0]?.isRemoved).toBe(true);
    expect(tree[0]?.children[0]?.id).toBe("b");
    expect(tree[0]?.children[0]?.isRemoved).toBe(true);
    expect(tree[0]?.children[0]?.parent_comment_id).toBe("a");
    expect(tree[0]?.children[0]?.children[0]?.id).toBe("c3");
    expect(tree[0]?.children[0]?.children[0]?.isRemoved).toBeUndefined();
  });

  it("uses raw UUID path labels as ids", () => {
    const parent = "019a6b4c-aa4c-7e0e-ad24-8a7ee4eababe";
    const child = "019ae70f-7a94-733f-a6db-040871a763b2";
    const tree = buildCommentTree([
      item(parent, { path: parent }),
      item(child, { parent_comment_id: parent, path: `${parent}.${child}` }),
    ]);

    expect(tree.map((c) => c.id)).toEqual([parent]);
    expect(tree[0]?.isRemoved).toBeUndefined();
    expect(tree[0]?.children.map((c) => c.id)).toEqual([child]);
  });

  it("keeps a visible ancestor and only stands in for the missing one", () => {
    const tree = buildCommentTree([
      item("a", { path: "a" }),
      item("c3", { parent_comment_id: "b", path: "a.b.c3" }),
    ]);

    expect(tree.map((c) => c.id)).toEqual(["a"]);
    expect(tree[0]?.isRemoved).toBeUndefined();
    expect(tree[0]?.children[0]?.id).toBe("b");
    expect(tree[0]?.children[0]?.isRemoved).toBe(true);
  });

  it("shares one placeholder between siblings of the same missing parent", () => {
    const tree = buildCommentTree([
      item("c2", { parent_comment_id: "gone", path: "gone.c2" }),
      item("c3", { parent_comment_id: "gone", path: "gone.c3" }),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.map((c) => c.id)).toEqual(["c2", "c3"]);
  });

  it("does not turn a root comment with a path into a placeholder", () => {
    const tree = buildCommentTree([item("c1", { path: "c1" })]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.isRemoved).toBeUndefined();
  });
});

describe("sortRoots", () => {
  const roots = buildCommentTree([
    item("old", { created_at: "2026-01-01T00:00:00Z", upvote_count: 1 }),
    item("old-reply", {
      created_at: "2026-01-02T00:00:00Z",
      parent_comment_id: "old",
      upvote_count: 50,
    }),
    item("mid", {
      created_at: "2026-02-01T00:00:00Z",
      upvote_count: 5,
      downvote_count: 1,
    }),
    item("new", { created_at: "2026-03-01T00:00:00Z", upvote_count: 4 }),
    item("newer", { created_at: "2026-04-01T00:00:00Z", is_pinned: true }),
    item("pinned-old", { created_at: "2025-12-01T00:00:00Z", is_pinned: true }),
  ]);
  const ids = (nodes: CommentTreeNode[]) => nodes.map((c) => c.id);

  it("keeps the input order for oldest first when there are no pinned comments", () => {
    const unpinnedRoots = roots.filter((r) => !r.is_pinned);
    expect(sortRoots(unpinnedRoots, "oldest")).toBe(unpinnedRoots);
  });

  it("puts pinned comments at the top in oldest first order", () => {
    expect(ids(sortRoots(roots, "oldest"))).toEqual([
      "newer",
      "pinned-old",
      "old",
      "mid",
      "new",
    ]);
  });

  it("puts pinned comments at the top in newest first order", () => {
    expect(ids(sortRoots(roots, "newest"))).toEqual([
      "newer",
      "pinned-old",
      "new",
      "mid",
      "old",
    ]);
  });

  it("puts pinned comments at the top in popular order", () => {
    // mid = 4, new = 4 (newer wins the tie), old = 1, pinned roots stay at the top
    expect(ids(sortRoots(roots, "popular"))).toEqual([
      "newer",
      "pinned-old",
      "new",
      "mid",
      "old",
    ]);
  });

  it("puts pinned comments first, then the newest", () => {
    expect(ids(sortRoots(roots, "pinned"))).toEqual([
      "newer",
      "pinned-old",
      "new",
      "mid",
      "old",
    ]);
  });

  it("ignores is_pinned when enablePinning is false", () => {
    expect(sortRoots(roots, "oldest", false)).toBe(roots);
    expect(ids(sortRoots(roots, "newest", false))).toEqual([
      "newer",
      "new",
      "mid",
      "old",
      "pinned-old",
    ]);
    expect(ids(sortRoots(roots, "popular", false))).toEqual([
      "new",
      "mid",
      "old",
      "newer",
      "pinned-old",
    ]);
  });

  it("does not mutate the input or reorder replies", () => {
    const before = ids(roots);
    sortRoots(roots, "newest");

    expect(ids(roots)).toEqual(before);
    expect(roots[0]?.children.map((c) => c.id)).toEqual(["old-reply"]);
  });

  it("treats missing and unparsable dates as the oldest", () => {
    const mixed = buildCommentTree([
      item("undated", { created_at: null }),
      item("dated", { created_at: "2026-01-01T00:00:00Z" }),
      item("broken", { created_at: "not-a-date" }),
    ]);

    expect(ids(sortRoots(mixed, "newest"))).toEqual([
      "dated",
      "undated",
      "broken",
    ]);
  });
});

describe("countVisible", () => {
  it("counts top-level comments and all replies", () => {
    const tree = buildCommentTree([
      item("c1"),
      item("c2", { parent_comment_id: "c1" }),
      item("c3", { parent_comment_id: "c2" }),
      item("c4"),
    ]);

    expect(countVisible(tree)).toBe(4);
  });

  it("ignores hidden comments and removed placeholders", () => {
    const tree = buildCommentTree([
      item("c1", { status: "hidden" }),
      item("c2", { parent_comment_id: "gone" }),
      item("c3"),
    ]);

    expect(countVisible(tree)).toBe(2);
  });
});

describe("findComment / applyVoteDelta", () => {
  it("finds nested replies and moves their counts", () => {
    const tree = buildCommentTree([
      item("c1"),
      item("c2", { parent_comment_id: "c1", upvote_count: 2 }),
    ]);
    const reply = findComment(tree, "c2");
    expect(reply?.id).toBe("c2");
    expect(findComment(tree, "missing")).toBeUndefined();

    applyVoteDelta(reply!, "up", "down");
    expect(reply?.upvote_count).toBe(1);
    expect(reply?.downvote_count).toBe(1);

    applyVoteDelta(reply!, "down", undefined);
    expect(reply?.downvote_count).toBe(0);
  });
});
