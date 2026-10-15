import { describe, expect, it } from "vitest";

import type { CommentMessages } from "../src/types";

import { en, id, resolveCommentMessages } from "../src/locales";

// Every leaf key, e.g. "section.sort.pinned", to compare presets structurally.
function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object"
      ? keys(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("locale presets", () => {
  it("define the same keys in Indonesian and English", () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(keys(en).sort(byName)).toEqual(keys(id).sort(byName));
  });

  it.each([
    ["id", id],
    ["en", en],
  ])("%s: every message with a value includes it", (_name, preset) => {
    const functions = Object.values(preset).flatMap((group: object) =>
      Object.values(group).filter(
        (value): value is (n: number) => string => typeof value === "function",
      ),
    );

    expect(functions.length).toBeGreaterThan(0);
    for (const format of functions) {
      expect(format(7)).toContain("7");
    }
  });

  it("format messages that take a value", () => {
    expect(id.section.loadMore(3)).toBe("Muat lebih banyak (3 tersisa)");
    expect(id.node.showReplies(2)).toBe("Lihat 2 balasan");
    expect(en.node.showReplies(1)).toBe("View 1 reply");
    expect(en.node.showReplies(2)).toBe("View 2 replies");
    expect(en.form.charactersLeft(1)).toBe("1 character left");
    expect(en.time.daysAgo(3)).toBe("3 days ago");
  });
});

describe("resolveCommentMessages", () => {
  it("defaults to the Indonesian preset", () => {
    expect(resolveCommentMessages()).toEqual(id);
  });

  it("merges overrides group by group without dropping the rest", () => {
    const loginToVote = "Masuk dulu untuk memberi suara.";
    const messages: CommentMessages = resolveCommentMessages("en", {
      node: { loginToVote },
      section: { sort: { ...en.section.sort, pinned: "Featured" } },
    });

    expect(messages.node.loginToVote).toBe(loginToVote);
    expect(messages.node.removed).toBe(en.node.removed);
    expect(messages.section.sort.pinned).toBe("Featured");
    expect(messages.section.sort.newest).toBe("Newest");
    expect(messages.section.emptyTitle).toBe(en.section.emptyTitle);
  });

  it("does not modify the presets", () => {
    resolveCommentMessages("id", { common: { cancel: "X" } });

    expect(id.common.cancel).toBe("Batal");
  });
});
