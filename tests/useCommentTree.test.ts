import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, type Ref, ref } from "vue";

import type {
  CommentItem,
  CommentTarget,
  CommentViewer,
  VoteType,
} from "../src/types";

import {
  type CommentTreeOptions,
  useCommentTree,
} from "../src/composables/useCommentTree";
import { resolveCommentMessages } from "../src/locales";
import {
  createFakeAdapter,
  deferred,
  type FakeAdapter,
  flush,
  GUEST,
  item,
  SIGNED_IN,
  TARGET,
} from "./helpers";

let adapter: FakeAdapter;
let viewer: Ref<CommentViewer | null>;
let target: Ref<CommentTarget | null>;

function setup(extra: Partial<CommentTreeOptions> = {}) {
  return useCommentTree(adapter, { target, viewer, ...extra });
}

function serve(rows: CommentItem[], votes: Record<string, VoteType> = {}) {
  adapter.fetchComments.mockResolvedValue(rows);
  adapter.fetchUserVotes.mockResolvedValue(votes);
}

beforeEach(() => {
  adapter = createFakeAdapter();
  viewer = ref<CommentViewer | null>(null);
  target = ref<CommentTarget | null>(TARGET);
});

describe("useCommentTree: load", () => {
  it("builds the tree from the adapter's rows for the target", async () => {
    serve([item("c1"), item("c2", { parent_comment_id: "c1" }), item("c3")]);
    const tree = setup();

    await tree.load();

    expect(adapter.fetchComments).toHaveBeenCalledWith(TARGET);
    expect(tree.comments.value.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(tree.comments.value[0]?.children[0]?.id).toBe("c2");
    expect(tree.totalCount.value).toBe(3);
  });

  it("does nothing without a target", async () => {
    target.value = null;
    const tree = setup();

    await tree.load();

    expect(adapter.fetchComments).not.toHaveBeenCalled();
    expect(tree.loading.value).toBe(false);
  });

  it("does not fetch votes for an anonymous visitor without a session", async () => {
    serve([item("c1")]);
    const tree = setup();

    await tree.load();

    expect(adapter.fetchUserVotes).not.toHaveBeenCalled();
    expect(tree.userVotes.value).toEqual({});
  });

  it("fetches the viewer's votes, dropping votes for comments not loaded", async () => {
    viewer.value = SIGNED_IN;
    serve([item("c1")], { c1: "up", elsewhere: "down" });
    const tree = setup();

    await tree.load();

    expect(adapter.fetchUserVotes).toHaveBeenCalledWith(TARGET);
    expect(tree.userVotes.value).toEqual({ c1: "up" });
  });

  it("still shows the thread when only the vote lookup fails", async () => {
    viewer.value = SIGNED_IN;
    adapter.fetchComments.mockResolvedValue([item("c1")]);
    adapter.fetchUserVotes.mockRejectedValue(new Error("votes down"));
    const onError = vi.fn();
    const tree = setup({ onError });

    await tree.load();

    expect(tree.comments.value.map((c) => c.id)).toEqual(["c1"]);
    expect(tree.userVotes.value).toEqual({});
    expect(tree.error.value).toBeNull();
    expect(onError).toHaveBeenCalledWith("fetchUserVotes", expect.any(Error));
  });

  it("sets an error message on failure", async () => {
    adapter.fetchComments.mockRejectedValue(new Error("down"));
    const tree = setup();

    await tree.load();

    expect(tree.error.value).toBe("down");
  });

  it("reads the message of non-Error rejections such as PostgREST errors", async () => {
    adapter.fetchComments.mockRejectedValue({ message: "permission denied" });
    const tree = setup();

    await tree.load();

    expect(tree.error.value).toBe("permission denied");
  });

  it("falls back to the locale's generic message for unreadable errors", async () => {
    adapter.fetchComments.mockRejectedValue(42);
    const tree = setup({ messages: resolveCommentMessages("en") });

    await tree.load();

    expect(tree.error.value).toBe("An unexpected error occurred.");
  });

  it("uses the message returned by onError and passes the context", async () => {
    adapter.fetchComments.mockRejectedValue(new Error("raw"));
    const onError = vi.fn(() => "Friendly message");
    const tree = setup({ onError });

    await tree.load();

    expect(onError).toHaveBeenCalledWith("fetchComments", expect.any(Error));
    expect(tree.error.value).toBe("Friendly message");
  });
});

describe("useCommentTree: loading state", () => {
  it("toggles loading on the initial fetch", async () => {
    serve([item("c1")]);
    const tree = setup();

    const pending = tree.load();
    expect(tree.loading.value).toBe(true);
    await pending;

    expect(tree.loading.value).toBe(false);
  });

  it("keeps loading false while refetching after submit, edit, delete and vote", async () => {
    viewer.value = SIGNED_IN;
    serve([item("c1")]);
    const tree = setup();
    await tree.load();

    const pending = [
      tree.submitComment({ content: "Amin" }),
      tree.updateComment("c1", "Edited"),
      tree.deleteComment("c1"),
      tree.voteComment("c1", "up"),
    ];
    expect(tree.loading.value).toBe(false);
    await Promise.all(pending);

    expect(tree.loading.value).toBe(false);
  });
});

describe("useCommentTree: sorting and pagination", () => {
  const rows = (count: number, extra: (i: number) => Partial<CommentItem>) =>
    Array.from({ length: count }, (_, i) => item(`c${i}`, extra(i)));

  it("defaults to oldest first, the order the adapter returns", async () => {
    serve(rows(3, (i) => ({ created_at: `2026-01-0${3 - i}T00:00:00Z` })));
    const tree = setup();
    await tree.load();

    expect(tree.sortOrder.value).toBe("oldest");
    expect(tree.visibleComments.value.map((c) => c.id)).toEqual([
      "c0",
      "c1",
      "c2",
    ]);
  });

  it("honours a custom default order and page size", async () => {
    serve(rows(5, (i) => ({ created_at: `2026-01-0${i + 1}T00:00:00Z` })));
    const tree = setup({ defaultSortOrder: "newest", pageSize: 2 });
    await tree.load();

    expect(tree.visibleComments.value.map((c) => c.id)).toEqual(["c4", "c3"]);
    expect(tree.hasMore.value).toBe(true);
  });

  it("shows only the first page of root comments and loadMore reveals more", async () => {
    serve(rows(15, () => ({})));
    const tree = setup();
    await tree.load();

    expect(tree.visibleComments.value).toHaveLength(10);
    expect(tree.hasMore.value).toBe(true);

    tree.loadMore();

    expect(tree.visibleComments.value).toHaveLength(15);
    expect(tree.hasMore.value).toBe(false);
  });

  it("paginates the sorted list, not the raw one", async () => {
    serve(rows(12, (i) => ({ upvote_count: i })));
    const tree = setup();
    await tree.load();

    tree.setSortOrder("popular");

    expect(tree.visibleComments.value[0]?.id).toBe("c11");
    expect(tree.visibleComments.value).toHaveLength(10);
    expect(tree.hasMore.value).toBe(true);
  });

  it("resets pagination when the order changes and on reset()", async () => {
    serve(rows(25, () => ({})));
    const tree = setup();
    await tree.load();
    tree.loadMore();
    expect(tree.visibleComments.value).toHaveLength(20);

    tree.setSortOrder("newest");
    expect(tree.visibleComments.value).toHaveLength(10);

    tree.setSortOrder("popular");
    tree.reset();
    expect(tree.sortOrder.value).toBe("oldest");
  });

  it("goes back to the first page on load() but not on refresh()", async () => {
    serve(rows(15, () => ({})));
    const tree = setup();
    await tree.load();
    tree.loadMore();

    await tree.refresh();
    expect(tree.visibleComments.value).toHaveLength(15);

    await tree.load();
    expect(tree.visibleComments.value).toHaveLength(10);
  });
});

describe("useCommentTree: submitting keeps the new comment visible", () => {
  const root = (id: string, day: number, extra: Partial<CommentItem> = {}) =>
    item(id, {
      user_id: "someone",
      created_at: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
      ...extra,
    });

  const seed = async (count: number, extra: Partial<CommentItem> = {}) => {
    viewer.value = SIGNED_IN;
    const rows = Array.from({ length: count }, (_, i) =>
      root(`c${i}`, i + 1, extra),
    );
    serve(rows);
    const tree = setup();
    await tree.load();
    return { tree, rows };
  };

  it("passes the target and input to the adapter", async () => {
    const { tree } = await seed(1);
    const image = new File(["x"], "photo.jpg");

    const ok = await tree.submitComment({
      content: "Amin",
      parentCommentId: "c0",
      imageFile: image,
    });

    expect(ok).toBe(true);
    expect(adapter.submitComment).toHaveBeenCalledWith({
      ...TARGET,
      content: "Amin",
      parentCommentId: "c0",
      imageFile: image,
    });
  });

  it("switches to newest first when the new comment would sit beyond the first page", async () => {
    const { tree, rows } = await seed(12);
    expect(tree.visibleComments.value).toHaveLength(10);
    serve([...rows, root("mine", 28, { user_id: "user-1" })]);

    await tree.submitComment({ content: "Amin" });

    expect(tree.sortOrder.value).toBe("newest");
    expect(tree.visibleComments.value[0]?.id).toBe("mine");
    // Pagination is kept: the whole list is not rendered.
    expect(tree.visibleComments.value).toHaveLength(10);
  });

  it("keeps the current order when the new comment is already visible", async () => {
    const { tree, rows } = await seed(5);
    serve([...rows, root("mine", 28, { user_id: "user-1" })]);

    await tree.submitComment({ content: "Amin" });

    expect(tree.sortOrder.value).toBe("oldest");
    expect(tree.visibleComments.value.map((c) => c.id)).toContain("mine");
  });

  it("also leaves 'popular' when the new comment ranks beyond the first page", async () => {
    const { tree, rows } = await seed(12, { upvote_count: 5 });
    tree.setSortOrder("popular");
    serve([...rows, root("mine", 28, { user_id: "user-1" })]);

    await tree.submitComment({ content: "Amin" });

    expect(tree.sortOrder.value).toBe("newest");
    expect(tree.visibleComments.value[0]?.id).toBe("mine");
  });

  it("ignores new top-level comments written by other people", async () => {
    const { tree, rows } = await seed(12);
    serve([...rows, root("theirs", 28, { user_id: "other" })]);

    await tree.submitComment({ content: "Amin" });

    expect(tree.sortOrder.value).toBe("oldest");
  });

  it("ignores removed placeholders", async () => {
    const { tree, rows } = await seed(12);
    serve([
      ...rows,
      root("orphan", 29, {
        parent_comment_id: "gone",
        path: "gone.orphan",
        user_id: "user-1",
      }),
    ]);

    await tree.submitComment({ content: "Amin" });

    expect(tree.sortOrder.value).toBe("oldest");
  });

  it("still reveals the new comment when the submit's own refetch was superseded", async () => {
    const { tree, rows } = await seed(12);
    const mine = root("mine", 28, { user_id: "user-1" });
    const submitFetch = deferred<CommentItem[]>();
    adapter.fetchComments.mockReturnValueOnce(submitFetch.promise);
    const posting = tree.submitComment({ content: "Amin" });
    await flush();

    // A newer fetch (e.g. a vote's reconcile) takes the ticket and lands first.
    adapter.fetchComments.mockResolvedValue([...rows, mine]);
    await tree.refresh();
    expect(tree.sortOrder.value).toBe("newest");
    expect(tree.visibleComments.value[0]?.id).toBe("mine");

    // The submit's own, now stale, response arrives and is ignored.
    submitFetch.resolve(rows);
    expect(await posting).toBe(true);
    expect(tree.comments.value.map((c) => c.id)).toContain("mine");
  });

  it("only reveals once, so a later refetch does not undo the user's order", async () => {
    const { tree, rows } = await seed(12);
    const mine = root("mine", 28, { user_id: "user-1" });
    serve([...rows, mine]);
    await tree.submitComment({ content: "Amin" });
    expect(tree.sortOrder.value).toBe("newest");

    tree.setSortOrder("oldest");
    serve([...rows, mine, root("mine2", 29, { user_id: "user-1" })]);
    await tree.refresh();

    expect(tree.sortOrder.value).toBe("oldest");
  });

  it("does not flip the order later when the comment never showed up (still pending)", async () => {
    const { tree, rows } = await seed(12);
    // The comment is pending review, so the list does not return it.
    serve(rows);
    await tree.submitComment({ content: "Amin" });
    expect(tree.sortOrder.value).toBe("oldest");

    // Much later it is approved and lands beyond the first page.
    serve([...rows, root("approved", 28, { user_id: "user-1" })]);
    await tree.refresh();

    expect(tree.sortOrder.value).toBe("oldest");
  });

  it("forgets the pending reveal on reset()", async () => {
    const { tree, rows } = await seed(12);
    const submitFetch = deferred<CommentItem[]>();
    adapter.fetchComments.mockReturnValueOnce(submitFetch.promise);
    const posting = tree.submitComment({ content: "Amin" });
    await flush();

    tree.reset();
    serve([...rows, root("mine", 28, { user_id: "user-1" })]);
    await tree.load();
    submitFetch.resolve(rows);
    await posting;

    expect(tree.sortOrder.value).toBe("oldest");
  });

  it("does not touch the order when posting a reply", async () => {
    const { tree } = await seed(12);

    await tree.submitComment({ content: "Balasan", parentCommentId: "c0" });

    expect(tree.sortOrder.value).toBe("oldest");
    expect(tree.visibleComments.value).toHaveLength(10);
  });
});

describe("useCommentTree: submitComment validation and errors", () => {
  it("refuses to submit without a signed-in viewer", async () => {
    const tree = setup({ messages: resolveCommentMessages("en") });

    const ok = await tree.submitComment({ content: "Amin" });

    expect(ok).toBe(false);
    expect(tree.error.value).toBe("Please sign in to comment.");
    expect(adapter.submitComment).not.toHaveBeenCalled();
  });

  it("requires a name and email from guests", async () => {
    viewer.value = GUEST;
    const tree = setup();

    const ok = await tree.submitComment({ content: "Amin", guestName: " " });

    expect(ok).toBe(false);
    expect(tree.error.value).toBe("Nama dan email wajib diisi.");
    expect(adapter.submitComment).not.toHaveBeenCalled();
  });

  it("submits for a guest who gave a name and email", async () => {
    viewer.value = GUEST;
    const tree = setup();

    const ok = await tree.submitComment({
      content: "Bagus",
      guestName: "Tamu",
      guestEmail: "tamu@example.com",
    });

    expect(ok).toBe(true);
    expect(adapter.submitComment).toHaveBeenCalledWith(
      expect.objectContaining({ guestName: "Tamu" }),
    );
  });

  it("sets an error and returns false when the adapter rejects", async () => {
    viewer.value = SIGNED_IN;
    adapter.submitComment.mockRejectedValue(new Error("insert rejected"));
    const tree = setup();

    const ok = await tree.submitComment({ content: "Amin" });

    expect(ok).toBe(false);
    expect(tree.error.value).toBe("insert rejected");
    expect(adapter.fetchComments).not.toHaveBeenCalled();
  });
});

describe("useCommentTree: stale responses", () => {
  it("drops a response that arrives after reset()", async () => {
    const late = deferred<CommentItem[]>();
    adapter.fetchComments.mockReturnValue(late.promise);
    const tree = setup();

    const pending = tree.load();
    expect(tree.loading.value).toBe(true);
    tree.reset();
    expect(tree.loading.value).toBe(false);
    late.resolve([item("c1")]);
    await pending;

    expect(tree.comments.value).toEqual([]);
    expect(tree.totalCount.value).toBe(0);
    expect(tree.loading.value).toBe(false);
  });

  it("lets only the newest of two overlapping fetches write", async () => {
    const slow = deferred<CommentItem[]>();
    adapter.fetchComments.mockReturnValueOnce(slow.promise);
    const tree = setup();
    const first = tree.load({ silent: true });

    adapter.fetchComments.mockResolvedValue([item("new")]);
    await tree.load({ silent: true });
    slow.resolve([item("old")]);
    await first;

    expect(tree.comments.value.map((c) => c.id)).toEqual(["new"]);
  });

  it("ignores an error from a superseded fetch", async () => {
    const slow = deferred<CommentItem[]>();
    adapter.fetchComments.mockReturnValueOnce(slow.promise);
    const tree = setup();
    const first = tree.load({ silent: true });

    adapter.fetchComments.mockResolvedValue([item("new")]);
    await tree.load({ silent: true });
    slow.reject(new Error("late failure"));
    await first;

    expect(tree.error.value).toBeNull();
    expect(tree.comments.value.map((c) => c.id)).toEqual(["new"]);
  });

  it("keeps loading until the newest fetch has finished", async () => {
    const first = deferred<CommentItem[]>();
    const second = deferred<CommentItem[]>();
    adapter.fetchComments
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const tree = setup();
    const firstFetch = tree.load();
    expect(tree.loading.value).toBe(true);

    const secondFetch = tree.load({ resetPagination: false, silent: true });

    first.resolve([item("old")]);
    await firstFetch;
    expect(tree.loading.value).toBe(true);

    second.resolve([item("new")]);
    await secondFetch;
    expect(tree.loading.value).toBe(false);
    expect(tree.comments.value.map((c) => c.id)).toEqual(["new"]);
  });
});

describe("useCommentTree: voteComment", () => {
  const seed = async (
    extra: Partial<CommentItem> = {},
    votes: Record<string, VoteType> = {},
  ) => {
    viewer.value = SIGNED_IN;
    serve(
      [item("c1", { upvote_count: 2, downvote_count: 1, ...extra })],
      votes,
    );
    const tree = setup();
    await tree.load();
    adapter.fetchComments.mockClear();
    return tree;
  };

  it("does nothing when there's no signed-in viewer", async () => {
    const tree = setup();

    expect(await tree.voteComment("c1", "up")).toBe(false);
    expect(adapter.setVote).not.toHaveBeenCalled();
  });

  it("adds a new vote locally without refetching comments", async () => {
    const tree = await seed();

    const ok = await tree.voteComment("c1", "up");

    expect(ok).toBe(true);
    expect(adapter.setVote).toHaveBeenCalledWith("c1", "up", null);
    expect(tree.comments.value[0]?.upvote_count).toBe(3);
    expect(tree.comments.value[0]?.downvote_count).toBe(1);
    expect(tree.userVotes.value.c1).toBe("up");
    expect(adapter.fetchComments).not.toHaveBeenCalled();
  });

  it("removes the vote when voting the same way again", async () => {
    const tree = await seed({}, { c1: "up" });

    await tree.voteComment("c1", "up");

    expect(adapter.setVote).toHaveBeenCalledWith("c1", null, "up");
    expect(tree.comments.value[0]?.upvote_count).toBe(1);
    expect(tree.userVotes.value.c1).toBeUndefined();
  });

  it("moves the count between up and down when switching the vote", async () => {
    const tree = await seed({}, { c1: "up" });

    await tree.voteComment("c1", "down");

    expect(adapter.setVote).toHaveBeenCalledWith("c1", "down", "up");
    expect(tree.comments.value[0]?.upvote_count).toBe(1);
    expect(tree.comments.value[0]?.downvote_count).toBe(2);
    expect(tree.userVotes.value.c1).toBe("down");
  });

  it("still saves a vote for a comment that is not in the loaded tree", async () => {
    viewer.value = SIGNED_IN;
    const tree = setup();

    expect(await tree.voteComment("c9", "up")).toBe(true);
    expect(adapter.setVote).toHaveBeenCalledWith("c9", "up", null);
    expect(tree.userVotes.value.c9).toBe("up");
  });

  it("updates replies nested in the tree", async () => {
    viewer.value = SIGNED_IN;
    serve([item("c1"), item("c2", { parent_comment_id: "c1" })]);
    const tree = setup();
    await tree.load();

    await tree.voteComment("c2", "up");

    expect(tree.comments.value[0]?.children[0]?.upvote_count).toBe(1);
    expect(tree.comments.value[0]?.upvote_count).toBe(0);
  });

  it("preserves the current pagination window after voting", async () => {
    viewer.value = SIGNED_IN;
    serve(Array.from({ length: 15 }, (_, i) => item(`c${i}`)));
    const tree = setup();
    await tree.load();
    tree.loadMore();

    await tree.voteComment("c0", "up");

    expect(tree.visibleComments.value).toHaveLength(15);
  });

  it("rolls back counts and the user's vote when the mutation fails", async () => {
    const tree = await seed({}, { c1: "up" });
    adapter.setVote.mockRejectedValue(new Error("vote rejected"));

    const ok = await tree.voteComment("c1", "down");

    expect(ok).toBe(false);
    expect(tree.comments.value[0]?.upvote_count).toBe(2);
    expect(tree.comments.value[0]?.downvote_count).toBe(1);
    expect(tree.userVotes.value.c1).toBe("up");
    expect(tree.error.value).toBe("vote rejected");
  });

  it("rolls back a failed first vote to no vote", async () => {
    const tree = await seed();
    adapter.setVote.mockRejectedValue(new Error("vote rejected"));

    await tree.voteComment("c1", "up");

    expect(tree.comments.value[0]?.upvote_count).toBe(2);
    expect(tree.userVotes.value.c1).toBeUndefined();
  });
});

describe("useCommentTree: votes racing with refetches", () => {
  const server = (up: number) => [
    item("c1", { upvote_count: up, downvote_count: 0 }),
  ];

  const seed = async () => {
    viewer.value = SIGNED_IN;
    serve(server(2));
    const tree = setup();
    await tree.load();
    return tree;
  };

  it("reconciles from the backend when a refetch replaced the tree during a successful vote", async () => {
    const tree = await seed();
    const commit = deferred<void>();
    adapter.setVote.mockReturnValue(commit.promise);
    const voting = tree.voteComment("c1", "up");
    expect(tree.comments.value[0]?.upvote_count).toBe(3);

    // A refetch that read the backend before the vote committed overwrites
    // the optimistic count.
    serve(server(2));
    await tree.refresh();
    expect(tree.comments.value[0]?.upvote_count).toBe(2);

    // The vote commits; the backend now includes it.
    serve(server(3), { c1: "up" });
    const fetchesBefore = adapter.fetchComments.mock.calls.length;
    commit.resolve();

    expect(await voting).toBe(true);
    expect(adapter.fetchComments.mock.calls.length).toBe(fetchesBefore + 1);
    expect(tree.comments.value[0]?.upvote_count).toBe(3);
    expect(tree.userVotes.value.c1).toBe("up");
  });

  it("does not subtract from a refreshed tree when the vote fails", async () => {
    const tree = await seed();
    const commit = deferred<void>();
    adapter.setVote.mockReturnValue(commit.promise);
    const voting = tree.voteComment("c1", "up");

    serve(server(2));
    await tree.refresh();
    expect(tree.comments.value[0]?.upvote_count).toBe(2);

    commit.reject(new Error("vote rejected"));

    expect(await voting).toBe(false);
    expect(tree.comments.value[0]?.upvote_count).toBe(2);
    expect(tree.userVotes.value.c1).toBeUndefined();
    expect(tree.error.value).toBe("vote rejected");
  });

  it("discards a stale refetch that started before the vote committed but resolves after it", async () => {
    const tree = await seed();
    const commit = deferred<void>();
    adapter.setVote.mockReturnValue(commit.promise);
    const voting = tree.voteComment("c1", "up");

    // A refetch starts while the vote is in flight and reads pre-commit counts.
    const staleRead = deferred<CommentItem[]>();
    adapter.fetchComments.mockReturnValueOnce(staleRead.promise);
    const staleFetch = tree.refresh();

    // The vote commits first; the reconcile fetch reads the committed state.
    serve(server(3), { c1: "up" });
    commit.resolve();
    expect(await voting).toBe(true);
    expect(tree.comments.value[0]?.upvote_count).toBe(3);

    // The stale response finally arrives and must not win.
    staleRead.resolve(server(2));
    await staleFetch;

    expect(tree.comments.value[0]?.upvote_count).toBe(3);
    expect(tree.userVotes.value.c1).toBe("up");
  });

  it("does not refetch after a vote when nothing replaced the tree", async () => {
    const tree = await seed();
    const fetchesBefore = adapter.fetchComments.mock.calls.length;

    await tree.voteComment("c1", "up");

    expect(adapter.fetchComments.mock.calls.length).toBe(fetchesBefore);
    expect(tree.comments.value[0]?.upvote_count).toBe(3);
  });
});

describe("useCommentTree: updateComment / deleteComment", () => {
  const seed = async () => {
    viewer.value = SIGNED_IN;
    serve(Array.from({ length: 15 }, (_, i) => item(`c${i}`)));
    const tree = setup();
    await tree.load();
    tree.loadMore();
    return tree;
  };

  it("updateComment edits through the adapter and refetches without resetting pagination", async () => {
    const tree = await seed();

    const ok = await tree.updateComment("c0", "Edited");

    expect(ok).toBe(true);
    expect(adapter.updateComment).toHaveBeenCalledWith("c0", "Edited");
    expect(adapter.fetchComments).toHaveBeenCalledTimes(2);
    expect(tree.visibleComments.value).toHaveLength(15);
  });

  it("updateComment sets an error and returns false on failure", async () => {
    const tree = await seed();
    adapter.updateComment.mockRejectedValue(new Error("forbidden"));

    expect(await tree.updateComment("c0", "Edited")).toBe(false);
    expect(tree.error.value).toBe("forbidden");
  });

  it("deleteComment hides through the adapter and refetches", async () => {
    const tree = await seed();

    const ok = await tree.deleteComment("c0");

    expect(ok).toBe(true);
    expect(adapter.deleteComment).toHaveBeenCalledWith("c0");
    expect(adapter.fetchComments).toHaveBeenCalledTimes(2);
    expect(tree.visibleComments.value).toHaveLength(15);
  });

  it("deleteComment sets an error and returns false on failure", async () => {
    const tree = await seed();
    adapter.deleteComment.mockRejectedValue(new Error("forbidden"));

    expect(await tree.deleteComment("c0")).toBe(false);
    expect(tree.error.value).toBe("forbidden");
  });
});

describe("useCommentTree: viewer changes", () => {
  it("reloads the shown thread when the viewer signs in or out", async () => {
    serve([item("c1")]);
    const tree = setup();
    await tree.load();
    expect(adapter.fetchComments).toHaveBeenCalledTimes(1);

    serve([item("c1"), item("own-pending", { status: "pending_review" })], {
      c1: "down",
    });
    viewer.value = SIGNED_IN;
    await nextTick();
    await flush();

    expect(adapter.fetchComments).toHaveBeenCalledTimes(2);
    expect(tree.comments.value.map((c) => c.id)).toContain("own-pending");
    expect(tree.userVotes.value).toEqual({ c1: "down" });

    viewer.value = null;
    await nextTick();
    await flush();

    expect(adapter.fetchComments).toHaveBeenCalledTimes(3);
    expect(tree.userVotes.value).toEqual({});
  });

  it("does not load anything on a viewer change before the first load", async () => {
    setup();

    viewer.value = SIGNED_IN;
    await nextTick();
    await flush();

    expect(adapter.fetchComments).not.toHaveBeenCalled();
  });

  it("ignores viewer updates that keep the same user", async () => {
    serve([item("c1")]);
    viewer.value = SIGNED_IN;
    const tree = setup();
    await tree.load();

    viewer.value = { ...SIGNED_IN, canModerate: true };
    await nextTick();
    await flush();

    expect(adapter.fetchComments).toHaveBeenCalledTimes(1);
    expect(tree.viewer.value?.canModerate).toBe(true);
  });
});

describe("useCommentTree: reset", () => {
  it("clears all state back to defaults", async () => {
    viewer.value = SIGNED_IN;
    serve(
      Array.from({ length: 15 }, (_, i) => item(`c${i}`)),
      { c0: "up" },
    );
    const tree = setup();
    await tree.load();
    tree.loadMore();
    adapter.fetchComments.mockRejectedValueOnce(new Error("x"));
    await tree.refresh();

    tree.reset();

    expect(tree.comments.value).toEqual([]);
    expect(tree.loading.value).toBe(false);
    expect(tree.error.value).toBeNull();
    expect(tree.userVotes.value).toEqual({});
    expect(tree.visibleComments.value).toEqual([]);
  });

  it("forgets the loaded thread, so refresh() does nothing afterwards", async () => {
    serve([item("c1")]);
    const tree = setup();
    await tree.load();
    tree.reset();

    await tree.refresh();

    expect(adapter.fetchComments).toHaveBeenCalledTimes(1);
  });
});
