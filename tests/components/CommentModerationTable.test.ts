import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import type { CommentModerationItem } from "../../src/types";

import CommentModerationTable from "../../src/components/CommentModerationTable.vue";
import { createFakeAdapter, item } from "../helpers";

afterEach(() => {
  document.body.innerHTML = "";
});

function modItem(
  id: string,
  overrides: Partial<CommentModerationItem> = {},
): CommentModerationItem {
  return {
    ...item(id),
    target_id: "s1",
    target_type: "song",
    guest_email: null,
    is_banned: false,
    ...overrides,
  };
}

describe("CommentModerationTable", () => {
  it("loads pending review comments and counts on mount", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", {
        content: "Halo dunia",
        status: "pending_review",
        user_id: "u1",
        author: { id: "u1", name: "Budi" },
      }),
    ]);
    adapter.fetchModerationCounts.mockResolvedValueOnce({
      all: 10,
      pending_review: 1,
      published: 7,
      hidden: 2,
    });

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    expect(adapter.fetchModerationQueue).toHaveBeenCalledWith({
      status: "pending_review",
      offset: 0,
      limit: 21,
      search: undefined,
    });
    expect(adapter.fetchModerationCounts).toHaveBeenCalled();

    // Verify tabs and counts
    expect(
      wrapper.find("#admin-moderation-tab-pending_review").text(),
    ).toContain("1");
    expect(wrapper.find("#admin-moderation-tab-published").text()).toContain(
      "7",
    );
    expect(wrapper.find("#admin-moderation-tab-hidden").text()).toContain("2");
    expect(wrapper.find("#admin-moderation-tab-all").text()).toContain("10");

    // Verify row content
    expect(wrapper.find("#comment-row-c1").exists()).toBe(true);
    expect(wrapper.find("#comment-text-c1").text()).toBe("Halo dunia");
    expect(wrapper.find("#comment-sender-name-c1").text()).toBe("Budi");
    expect(wrapper.find("#comment-status-c1").text()).toBe("Menunggu Tinjauan");
  });

  it("switches status filter tabs and reloads", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValue([
      modItem("c2", { status: "published" }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    await wrapper.find("#admin-moderation-tab-published").trigger("click");
    await flushPromises();

    expect(adapter.fetchModerationQueue).toHaveBeenLastCalledWith({
      status: "published",
      offset: 0,
      limit: 21,
      search: undefined,
    });
  });

  it("filters comments by search query in the client", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { content: "Komentar lagu rohani", guest_name: "Andi" }),
      modItem("c2", {
        content: "Pertanyaan liturgi",
        guest_email: "siti@example.com",
      }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    expect(wrapper.findAll("tbody tr").length).toBe(2);

    const input = wrapper.find("#admin-moderation-search-input");
    await input.setValue("siti");

    expect(wrapper.findAll("tbody tr").length).toBe(1);
    expect(wrapper.find("#comment-row-c2").exists()).toBe(true);
    expect(wrapper.find("#comment-row-c1").exists()).toBe(false);

    // Clear search
    await wrapper.find("#admin-moderation-search-clear").trigger("click");
    expect(wrapper.findAll("tbody tr").length).toBe(2);
  });

  it("approves, hides, and shows comments via moderateComment", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { status: "pending_review" }),
      modItem("c2", { status: "published" }),
      modItem("c3", { status: "hidden" }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    // Approve c1
    await wrapper.find("#comment-approve-button-c1").trigger("click");
    await flushPromises();
    expect(adapter.moderateComment).toHaveBeenCalledWith(["c1"], "publish");
    expect(wrapper.emitted("notify")?.[0]?.[0]).toMatchObject({
      level: "success",
    });

    // Hide c2
    await wrapper.find("#comment-hide-button-c2").trigger("click");
    await flushPromises();
    expect(adapter.moderateComment).toHaveBeenCalledWith(["c2"], "hide");

    // Show c3
    await wrapper.find("#comment-show-button-c3").trigger("click");
    await flushPromises();
    expect(adapter.moderateComment).toHaveBeenCalledWith(["c3"], "publish");
  });

  it("supports bulk selection and actions", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { status: "pending_review" }),
      modItem("c2", { status: "pending_review" }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    expect(wrapper.find("#admin-moderation-bulk-bar").exists()).toBe(false);

    // Select all
    await wrapper.find("#admin-moderation-select-all").trigger("change");
    expect(wrapper.find("#admin-moderation-bulk-bar").exists()).toBe(true);
    expect(wrapper.find("#admin-moderation-selected-count").text()).toContain(
      "2",
    );

    // Bulk approve
    await wrapper.find("#admin-moderation-bulk-approve").trigger("click");
    await flushPromises();
    expect(adapter.moderateComment).toHaveBeenCalledWith(
      ["c1", "c2"],
      "publish",
    );
    expect(wrapper.find("#admin-moderation-bulk-bar").exists()).toBe(false);
  });

  it("supports banning and unbanning users", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { user_id: "user-1", is_banned: false }),
      modItem("c2", { user_id: "user-2", is_banned: true }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    // Ban user-1
    await wrapper.find("#comment-ban-button-c1").trigger("click");
    expect(wrapper.find("#admin-moderation-ban-dialog").exists()).toBe(true);

    // Verify label wraps textarea for a11y, but uppercase is isolated to the span
    const label = wrapper.find("label[for='admin-moderation-ban-reason']");
    expect(label.exists()).toBe(true);
    expect(label.classes()).not.toContain("uppercase");
    expect(label.find("span").classes()).toContain("uppercase");

    const textarea = wrapper.find("#admin-moderation-ban-reason");
    expect(textarea.classes()).toContain("normal-case");
    expect(textarea.classes()).toContain("tracking-normal");

    // Fill reason
    await textarea.setValue("Spam berulang");
    // Select preset 1 Minggu
    await wrapper.find("#admin-moderation-ban-preset-week").trigger("click");

    await wrapper.find("#admin-moderation-ban-submit").trigger("click");
    await flushPromises();

    expect(adapter.banUser).toHaveBeenCalledWith({
      userId: "user-1",
      reason: "Spam berulang",
      expiresAt: expect.any(String),
    });

    // Unban user-2
    await wrapper.find("#comment-unban-button-c2").trigger("click");
    await flushPromises();
    expect(adapter.unbanUser).toHaveBeenCalledWith("user-2");
  });

  it("supports pinning comments when enablePinning is true", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { is_pinned: false }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter, enablePinning: true },
    });
    await flushPromises();

    const pinBtn = wrapper.find("#comment-pin-button-c1");
    expect(pinBtn.exists()).toBe(true);
    await pinBtn.trigger("click");
    await flushPromises();

    expect(adapter.pinComment).toHaveBeenCalledWith("c1", true);
  });

  it("displays guest_email to staff", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", {
        guest_name: "Tamu Satu",
        guest_email: "tamu@example.com",
      }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter },
    });
    await flushPromises();

    expect(wrapper.find("#comment-sender-email-c1").text()).toBe(
      "tamu@example.com",
    );
  });

  it("resolves target labels and URLs", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { target_id: "lagu-123", target_type: "song" }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: {
        adapter,
        targetUrl: (c) => `/songs/${c.target_id}`,
      },
    });
    await flushPromises();

    const link = wrapper.find("#comment-target-c1 a");
    expect(link.exists()).toBe(true);
    expect(link.attributes("id")).toBe("comment-target-link-c1");
    expect(link.attributes("href")).toBe("/songs/lagu-123");
    expect(link.text()).toBe("Lagu");
  });

  it("renders hard-delete button when adapter supports it and canHardDelete is true", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { content: "Spam comment" }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter, canHardDelete: true },
    });
    await flushPromises();

    expect(wrapper.find("#comment-delete-button-c1").exists()).toBe(true);
  });

  it("hides hard-delete button when canHardDelete is false", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { content: "Spam comment" }),
    ]);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter, canHardDelete: false },
    });
    await flushPromises();

    expect(wrapper.find("#comment-delete-button-c1").exists()).toBe(false);
  });

  it("opens delete dialog and permanently deletes comment on confirmation", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { content: "Komentar yang akan dihapus" }),
    ]);
    adapter.hardDeleteComment.mockResolvedValueOnce(undefined);

    const wrapper = mount(CommentModerationTable, {
      props: { adapter, canHardDelete: true },
    });
    await flushPromises();

    // Click delete button to open dialog
    await wrapper.find("#comment-delete-button-c1").trigger("click");
    await flushPromises();

    expect(wrapper.find("#admin-moderation-delete-dialog").exists()).toBe(true);
    expect(
      wrapper.find("#admin-moderation-delete-target-preview").text(),
    ).toContain("Komentar yang akan dihapus");

    // Click confirm delete submit
    await wrapper.find("#admin-moderation-delete-submit").trigger("click");
    await flushPromises();

    expect(adapter.hardDeleteComment).toHaveBeenCalledWith("c1");
    expect(wrapper.find("#comment-row-c1").exists()).toBe(false);
    expect(wrapper.find("#admin-moderation-delete-dialog").exists()).toBe(false);
    const notifications = wrapper.emitted("notify");
    expect(notifications).toBeTruthy();
    expect(notifications?.[0]?.[0]).toEqual({
      level: "success",
      message: "Komentar berhasil dihapus secara permanen.",
    });
  });

  it("displays error in dialog if hard delete fails", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchModerationQueue.mockResolvedValueOnce([
      modItem("c1", { content: "Error delete target" }),
    ]);
    adapter.hardDeleteComment.mockRejectedValueOnce(new Error("Database error"));

    const wrapper = mount(CommentModerationTable, {
      props: { adapter, canHardDelete: true },
    });
    await flushPromises();

    await wrapper.find("#comment-delete-button-c1").trigger("click");
    await flushPromises();

    await wrapper.find("#admin-moderation-delete-submit").trigger("click");
    await flushPromises();

    expect(adapter.hardDeleteComment).toHaveBeenCalledWith("c1");
    expect(wrapper.find("#comment-row-c1").exists()).toBe(true);
    expect(wrapper.find("#admin-moderation-delete-error").text()).toContain(
      "Database error",
    );
  });
});
