import { vi } from "vitest";

import type {
  CommentBackendAdapter,
  CommentItem,
  CommentTarget,
  CommentViewer,
} from "../src/types";

export const TARGET: CommentTarget = { targetId: "post-1", targetType: "post" };

export const SIGNED_IN: CommentViewer = {
  userId: "user-1",
  isAnonymous: false,
  canModerate: false,
};

export const GUEST: CommentViewer = {
  userId: "anon-1",
  isAnonymous: true,
  canModerate: false,
};

export function item(
  id: string,
  overrides: Partial<CommentItem> = {},
): CommentItem {
  return {
    id,
    target_id: TARGET.targetId,
    target_type: TARGET.targetType,
    parent_comment_id: null,
    path: null,
    content: `content-${id}`,
    status: "published",
    created_at: null,
    updated_at: null,
    upvote_count: 0,
    downvote_count: 0,
    user_id: null,
    guest_name: null,
    image_upload_url: null,
    file_upload_url: null,
    author: null,
    ...overrides,
  };
}

/** A promise the test settles by hand, to interleave async steps. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise((r) => setTimeout(r, 0));

/** An in-memory adapter whose methods are spies with harmless defaults. */
export function createFakeAdapter() {
  return {
    fetchComments: vi.fn<CommentBackendAdapter["fetchComments"]>(() =>
      Promise.resolve([]),
    ),
    countComments: vi.fn<CommentBackendAdapter["countComments"]>(() =>
      Promise.resolve(0),
    ),
    fetchUserVotes: vi.fn<CommentBackendAdapter["fetchUserVotes"]>(() =>
      Promise.resolve({}),
    ),
    submitComment: vi.fn<CommentBackendAdapter["submitComment"]>(() =>
      Promise.resolve(),
    ),
    setVote: vi.fn<CommentBackendAdapter["setVote"]>(() => Promise.resolve()),
    updateComment: vi.fn<CommentBackendAdapter["updateComment"]>(() =>
      Promise.resolve(),
    ),
    deleteComment: vi.fn<CommentBackendAdapter["deleteComment"]>(() =>
      Promise.resolve(),
    ),
    fetchModerationQueue: vi.fn<
      NonNullable<CommentBackendAdapter["fetchModerationQueue"]>
    >(() => Promise.resolve([])),
    fetchModerationCounts: vi.fn<
      NonNullable<CommentBackendAdapter["fetchModerationCounts"]>
    >(() =>
      Promise.resolve({ all: 0, pending_review: 0, published: 0, hidden: 0 }),
    ),
    moderateComment: vi.fn<
      NonNullable<CommentBackendAdapter["moderateComment"]>
    >(() => Promise.resolve()),
    pinComment: vi.fn<NonNullable<CommentBackendAdapter["pinComment"]>>(() =>
      Promise.resolve(),
    ),
    banUser: vi.fn<NonNullable<CommentBackendAdapter["banUser"]>>(() =>
      Promise.resolve(),
    ),
    unbanUser: vi.fn<NonNullable<CommentBackendAdapter["unbanUser"]>>(() =>
      Promise.resolve(),
    ),
  } satisfies CommentBackendAdapter;
}

export type FakeAdapter = ReturnType<typeof createFakeAdapter>;
