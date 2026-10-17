import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "vue";

import type { CommentItem } from "../../src/types";

import { createFakeAdapter, GUEST, item, SIGNED_IN } from "../helpers";
import { mountSection } from "./mountSection";

const own = (extra: Partial<CommentItem> = {}) =>
  item("c1", {
    user_id: SIGNED_IN.userId,
    content: "Halo",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    author: { id: "user-1", name: "Budi", avatar_url: null },
    ...extra,
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const dialog = (id: string) =>
  document.getElementById(`comment-delete-modal-${id}`) as HTMLDialogElement;

describe("CommentNode: delete confirmation", () => {
  it("opens a modal dialog", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });

    await wrapper.find("#comment-delete-button-c1").trigger("click");

    expect(dialog("c1").open).toBe(true);
    expect(dialog("c1").getAttribute("aria-labelledby")).toBe(
      "comment-delete-modal-title-c1",
    );
  });

  it("does not delete when the dialog is cancelled", async () => {
    const { wrapper, adapter } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });
    await wrapper.find("#comment-delete-button-c1").trigger("click");

    await wrapper.find("#comment-delete-cancel-button-c1").trigger("click");

    expect(dialog("c1").open).toBe(false);
    expect(adapter.deleteComment).not.toHaveBeenCalled();
  });

  it("closes on Escape (the dialog's cancel event)", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });
    await wrapper.find("#comment-delete-button-c1").trigger("click");

    dialog("c1").dispatchEvent(new Event("cancel", { cancelable: true }));
    await flushPromises();

    expect(dialog("c1").open).toBe(false);
  });

  it("deletes the comment and closes the dialog on confirm", async () => {
    const { wrapper, adapter } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });
    await wrapper.find("#comment-delete-button-c1").trigger("click");

    await wrapper.find("#comment-delete-confirm-button-c1").trigger("click");
    await flushPromises();

    expect(adapter.deleteComment).toHaveBeenCalledWith("c1");
    expect(dialog("c1").open).toBe(false);
  });

  it("notifies the error and closes the dialog when deletion fails", async () => {
    const adapter = createFakeAdapter();
    adapter.deleteComment.mockRejectedValue(new Error("forbidden"));
    const { wrapper } = await mountSection({
      adapter,
      rows: [own()],
      viewer: SIGNED_IN,
    });
    await wrapper.find("#comment-delete-button-c1").trigger("click");

    await wrapper.find("#comment-delete-confirm-button-c1").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("notify")).toEqual([
      [{ level: "error", message: "forbidden" }],
    ]);
    expect(dialog("c1").open).toBe(false);
  });
});

describe("CommentNode: status badges and owner actions", () => {
  it("marks a hidden comment as removed for the public and hides edit/delete", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ status: "hidden" })],
      viewer: SIGNED_IN,
    });

    expect(wrapper.find("#comment-hidden-badge-c1").text()).toBe(
      "Dihapus, tidak tampil untuk publik",
    );
    expect(wrapper.find("#comment-owner-actions-c1").exists()).toBe(true);
    expect(wrapper.find("#comment-edit-button-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-delete-button-c1").exists()).toBe(false);
  });

  it("marks the user's own pending comment and does not allow editing it", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ status: "pending_review" })],
      viewer: SIGNED_IN,
    });

    expect(wrapper.find("#comment-pending-badge-c1").text()).toBe(
      "Menunggu moderasi",
    );
    expect(wrapper.find("#comment-edit-button-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-delete-button-c1").exists()).toBe(true);
  });

  it("uses labelled icon buttons for owner actions", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });

    const edit = wrapper.find("#comment-edit-button-c1");
    const del = wrapper.find("#comment-delete-button-c1");
    expect(edit.attributes("aria-label")).toBe("Sunting komentar");
    expect(del.attributes("aria-label")).toBe("Hapus komentar");
    expect(del.classes()).toContain("cmt-action--danger");
  });

  it("hides owner actions from other users", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ user_id: "someone-else" })],
      viewer: SIGNED_IN,
    });

    expect(wrapper.find("#comment-owner-actions-c1").exists()).toBe(false);
  });

  it("only allows editing inside the edit window", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ created_at: "2026-10-01T02:50:00Z" })],
      viewer: SIGNED_IN,
      props: { editWindowMinutes: 15 },
    });
    expect(wrapper.find("#comment-edit-button-c1").exists()).toBe(true);

    vi.advanceTimersByTime(6 * 60_000);
    await flushPromises();

    expect(wrapper.find("#comment-edit-button-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-delete-button-c1").exists()).toBe(true);
  });

  it("does not allow editing when the creation time is unknown and a window is set", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ created_at: null })],
      viewer: SIGNED_IN,
      props: { editWindowMinutes: 15 },
    });

    expect(wrapper.find("#comment-edit-button-c1").exists()).toBe(false);
  });
});

describe("CommentNode: dates and author", () => {
  it("shows a relative date with the absolute date as title", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      props: { timeZone: "Asia/Jakarta" },
    });

    const time = wrapper.find("#comment-date-c1");
    expect(time.text()).toBe("3 jam lalu");
    expect(time.attributes("datetime")).toBe("2026-10-01T00:00:00Z");
    expect(time.attributes("title")).toContain("2026");
  });

  it("keeps the relative date current as the shared clock ticks", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ created_at: "2026-10-01T02:59:30Z" })],
    });
    expect(wrapper.find("#comment-date-c1").text()).toBe("Baru saja");

    vi.advanceTimersByTime(60_000);
    await flushPromises();

    expect(wrapper.find("#comment-date-c1").text()).toBe("1 menit lalu");
  });

  it("only shows the edited marker once the comment was updated", async () => {
    const { wrapper } = await mountSection({
      rows: [own(), own({ id: "c2", updated_at: "2026-10-01T01:00:00Z" })],
    });

    expect(wrapper.find("#comment-edited-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-edited-c2").text()).toBe("(diedit)");
  });

  it("shows the author name, falling back to the guest name and then 'Anonim'", async () => {
    const { wrapper } = await mountSection({
      rows: [own(), item("g", { guest_name: "Tamu" }), item("a")],
    });

    expect(wrapper.find("#comment-author-name-c1").text()).toBe("Budi");
    expect(wrapper.find("#comment-author-name-g").text()).toBe("Tamu");
    expect(wrapper.find("#comment-author-name-a").text()).toBe("Anonim");
  });

  it("renders the host's author badge with the author's metadata", async () => {
    const { wrapper } = await mountSection({
      rows: [
        own({
          author: {
            id: "user-1",
            name: "Budi",
            metadata: { role: "Moderator" },
          },
        }),
        item("guest", { guest_name: "Tamu" }),
      ],
      slots: {
        "author-badge": ({ author }) =>
          h("span", { class: "badge" }, String(author.metadata?.role)),
      },
    });

    expect(wrapper.find("#comment-meta-c1 .badge").text()).toBe("Moderator");
    // No author record (guest): nothing for the slot to describe.
    expect(wrapper.find("#comment-meta-guest .badge").exists()).toBe(false);
  });

  it("renders host actions in every comment's footer", async () => {
    const { wrapper } = await mountSection({
      rows: [own(), item("c2", { parent_comment_id: "c1" })],
      slots: {
        "comment-actions": ({ comment }) =>
          h("button", { class: "report" }, `Laporkan ${comment.id}`),
      },
    });

    expect(wrapper.find("#comment-footer-c1 .report").text()).toBe(
      "Laporkan c1",
    );
    expect(wrapper.find("#comment-footer-c2 .report").text()).toBe(
      "Laporkan c2",
    );
  });

  it("shows initials for a commenter without a picture", async () => {
    const { wrapper } = await mountSection({
      rows: [own(), item("anon")],
    });

    expect(wrapper.find("#comment-avatar-fallback-c1").text()).toBe("B");
    expect(wrapper.find("svg#comment-avatar-fallback-anon").exists()).toBe(
      true,
    );
  });

  it("retries a failed transformed avatar with the original URL, then falls back", async () => {
    const { wrapper } = await mountSection({
      rows: [
        own({
          author: { id: "user-1", name: "Budi", avatar_url: "https://x/a.png" },
        }),
      ],
      props: {
        transformImageUrl: (url: string, { width }: { width: number }) =>
          `https://cdn/w=${width}/${url}`,
      },
    });
    const avatar = () => wrapper.find("#comment-avatar-c1");
    expect(avatar().attributes("src")).toBe("https://cdn/w=64/https://x/a.png");

    await avatar().trigger("error");
    expect(avatar().attributes("src")).toBe("https://x/a.png");

    await avatar().trigger("error");
    expect(avatar().exists()).toBe(false);
    expect(wrapper.find("#comment-avatar-fallback-c1").text()).toBe("B");
  });

  it("falls back straight away when an untransformed avatar fails", async () => {
    const { wrapper } = await mountSection({
      rows: [
        own({
          author: { id: "user-1", name: "Budi", avatar_url: "https://x/a.png" },
        }),
      ],
    });

    await wrapper.find("#comment-avatar-c1").trigger("error");

    expect(wrapper.find("#comment-avatar-c1").exists()).toBe(false);
  });
});

describe("CommentNode: attachments", () => {
  const withImage = own({ image_upload_url: "https://x/photo.jpg" });

  it("renders a square thumbnail with a loading placeholder until the image loads", async () => {
    const { wrapper } = await mountSection({ rows: [withImage] });
    const container = wrapper.find("#comment-image-container-c1");
    expect(container.classes()).toContain("animate-pulse");

    await wrapper.find("#comment-image-attachment-c1").trigger("load");

    expect(container.classes()).not.toContain("animate-pulse");
  });

  it("creates the viewer on first open and shows the original image", async () => {
    const { wrapper } = await mountSection({
      rows: [withImage],
      props: { transformImageUrl: (url: string) => `${url}?w=512` },
    });
    expect(wrapper.find("#comment-image-lightbox-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-image-attachment-c1").attributes("src")).toBe(
      "https://x/photo.jpg?w=512",
    );

    await wrapper.find("#comment-image-open-button-c1").trigger("click");

    const viewer = document.getElementById(
      "comment-image-lightbox-c1",
    ) as HTMLDialogElement;
    expect(viewer.open).toBe(true);
    expect(
      document
        .getElementById("comment-image-lightbox-c1-image")
        ?.getAttribute("src"),
    ).toBe("https://x/photo.jpg");

    await wrapper
      .find("#comment-image-lightbox-c1-close-button")
      .trigger("click");
    expect(viewer.open).toBe(false);
    expect(wrapper.find("#comment-image-lightbox-c1").exists()).toBe(true);
  });

  it("closes the viewer on a backdrop click but not on a click on the image", async () => {
    const { wrapper } = await mountSection({ rows: [withImage] });
    await wrapper.find("#comment-image-open-button-c1").trigger("click");
    const viewer = wrapper.find("#comment-image-lightbox-c1");

    await wrapper.find("#comment-image-lightbox-c1-image").trigger("click");
    expect((viewer.element as HTMLDialogElement).open).toBe(true);

    await viewer.trigger("click");
    expect((viewer.element as HTMLDialogElement).open).toBe(false);
  });

  it("lets the host replace the image viewer", async () => {
    const { wrapper } = await mountSection({
      rows: [withImage],
      slots: {
        "image-viewer": ({ src, open, close }) =>
          h(
            "button",
            { class: "host-viewer", "data-open": String(open), onClick: close },
            src,
          ),
      },
    });

    await wrapper.find("#comment-image-open-button-c1").trigger("click");
    const hostViewer = wrapper.find(".host-viewer");
    expect(hostViewer.text()).toBe("https://x/photo.jpg");
    expect(hostViewer.attributes("data-open")).toBe("true");
    expect(wrapper.find("#comment-image-lightbox-c1").exists()).toBe(false);

    await hostViewer.trigger("click");
    expect(wrapper.find(".host-viewer").attributes("data-open")).toBe("false");
  });

  it("retries a failed transformed attachment with the original URL before dropping it", async () => {
    const { wrapper } = await mountSection({
      rows: [withImage],
      props: { transformImageUrl: (url: string) => `${url}?w=512` },
    });
    const img = () => wrapper.find("#comment-image-attachment-c1");

    await img().trigger("error");
    expect(img().attributes("src")).toBe("https://x/photo.jpg");

    await img().trigger("error");
    expect(wrapper.find("#comment-image-container-c1").exists()).toBe(false);
  });

  it("renders no image container or viewer without an attachment", async () => {
    const { wrapper } = await mountSection({ rows: [own()] });

    expect(wrapper.find("#comment-image-container-c1").exists()).toBe(false);
  });

  it("lets the thumbnail reopen the viewer after the browser closed it itself", async () => {
    const { wrapper } = await mountSection({ rows: [withImage] });
    const open = () =>
      wrapper.find("#comment-image-open-button-c1").trigger("click");
    await open();
    const viewer = wrapper.find("#comment-image-lightbox-c1")
      .element as HTMLDialogElement;
    expect(viewer.open).toBe(true);

    // Closed natively without a cancel, as the Android back gesture can do.
    viewer.close();
    viewer.dispatchEvent(new Event("close"));
    await flushPromises();
    expect(viewer.open).toBe(false);

    await open();
    expect(viewer.open).toBe(true);
  });

  it.each([
    "javascript:alert(document.cookie)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "//evil.example/x.pdf",
  ])("does not link an unsafe file URL (%s)", async (url) => {
    const { wrapper } = await mountSection({
      rows: [own({ file_upload_url: url })],
    });

    expect(wrapper.find("#comment-file-attachment-c1").exists()).toBe(false);
  });

  it("links a file attachment safely in a new tab", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ file_upload_url: "https://x/doc.pdf" })],
    });

    const link = wrapper.find("#comment-file-attachment-c1");
    expect(link.attributes("href")).toBe("https://x/doc.pdf");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
  });
});

describe("CommentNode: editing", () => {
  const startEditing = async () => {
    const mounted = await mountSection({ rows: [own()], viewer: SIGNED_IN });
    await mounted.wrapper.find("#comment-edit-button-c1").trigger("click");
    return mounted;
  };

  it("opens an edit box prefilled with the content and hides owner actions", async () => {
    const { wrapper } = await startEditing();

    expect(
      (wrapper.find("#comment-edit-textarea-c1").element as HTMLTextAreaElement)
        .value,
    ).toBe("Halo");
    expect(wrapper.find("#comment-owner-actions-c1").exists()).toBe(false);
  });

  it("cancels without saving", async () => {
    const { wrapper, adapter } = await startEditing();

    await wrapper.find("#comment-cancel-edit-c1").trigger("click");

    expect(wrapper.find("#comment-edit-container-c1").exists()).toBe(false);
    expect(adapter.updateComment).not.toHaveBeenCalled();
  });

  it("disables saving for blank content", async () => {
    const { wrapper } = await startEditing();

    await wrapper.find("#comment-edit-textarea-c1").setValue("   ");

    expect(
      wrapper.find("#comment-save-edit-c1").attributes("disabled"),
    ).toBeDefined();
  });

  it("saves the trimmed content and leaves edit mode", async () => {
    const { wrapper, adapter } = await startEditing();
    await wrapper.find("#comment-edit-textarea-c1").setValue("  Baru  ");

    await wrapper.find("#comment-save-edit-c1").trigger("click");
    await flushPromises();

    expect(adapter.updateComment).toHaveBeenCalledWith("c1", "Baru");
    expect(wrapper.find("#comment-edit-container-c1").exists()).toBe(false);
  });

  it("stays in edit mode and notifies when saving fails", async () => {
    const { wrapper, adapter } = await startEditing();
    adapter.updateComment.mockRejectedValue(new Error("forbidden"));

    await wrapper.find("#comment-save-edit-c1").trigger("click");
    await flushPromises();

    expect(wrapper.find("#comment-edit-container-c1").exists()).toBe(true);
    expect(wrapper.emitted("notify")).toEqual([
      [{ level: "error", message: "forbidden" }],
    ]);
  });

  it("limits the edit box to maxLength", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
      props: { maxLength: 2000 },
    });
    await wrapper.find("#comment-edit-button-c1").trigger("click");

    expect(
      wrapper.find("#comment-edit-textarea-c1").attributes("maxlength"),
    ).toBe("2000");
  });
});

describe("CommentNode: voting", () => {
  it("hides vote counts at zero and shows them when positive", async () => {
    const { wrapper } = await mountSection({
      rows: [own({ upvote_count: 2 })],
    });

    expect(wrapper.find("#comment-upvote-count-c1").text()).toBe("2");
    expect(wrapper.find("#comment-downvote-count-c1").exists()).toBe(false);
  });

  it("reflects the user's vote with aria-pressed and the active class", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchUserVotes.mockResolvedValue({ c1: "down" });
    const { wrapper } = await mountSection({
      adapter,
      rows: [own()],
      viewer: SIGNED_IN,
    });

    const down = wrapper.find("#comment-downvote-button-c1");
    expect(down.attributes("aria-pressed")).toBe("true");
    expect(down.classes()).toContain("cmt-action--active-danger");
    expect(
      wrapper.find("#comment-upvote-button-c1").attributes("aria-pressed"),
    ).toBe("false");
  });

  it("sends the vote for the clicked button", async () => {
    const { wrapper, adapter } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });

    await wrapper.find("#comment-upvote-button-c1").trigger("click");
    await flushPromises();

    expect(adapter.setVote).toHaveBeenCalledWith("c1", "up", null);
    expect(wrapper.find("#comment-upvote-count-c1").text()).toBe("1");
  });

  it("asks guests and visitors without a session to sign in instead of voting", async () => {
    for (const viewer of [GUEST, null]) {
      const { wrapper, adapter } = await mountSection({
        rows: [own({ upvote_count: 3 })],
        viewer,
      });
      const up = wrapper.find("#comment-upvote-button-c1");
      expect(up.attributes("title")).toBe(
        "Silakan masuk untuk memberikan suara.",
      );

      await up.trigger("click");

      expect(adapter.setVote).not.toHaveBeenCalled();
      expect(wrapper.emitted("notify")).toEqual([
        [{ level: "error", message: "Silakan masuk untuk memberikan suara." }],
      ]);
      expect(wrapper.find("#comment-upvote-count-c1").text()).toBe("3");
      wrapper.unmount();
    }
  });

  it("notifies when a vote fails", async () => {
    const adapter = createFakeAdapter();
    adapter.setVote.mockRejectedValue(new Error("vote rejected"));
    const { wrapper } = await mountSection({
      adapter,
      rows: [own()],
      viewer: SIGNED_IN,
    });

    await wrapper.find("#comment-downvote-button-c1").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("notify")).toEqual([
      [{ level: "error", message: "vote rejected" }],
    ]);
  });

  it("ignores a second click while a vote is in flight", async () => {
    const adapter = createFakeAdapter();
    let finish!: () => void;
    adapter.setVote.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { wrapper } = await mountSection({
      adapter,
      rows: [own()],
      viewer: SIGNED_IN,
    });
    const up = wrapper.find("#comment-upvote-button-c1");

    await up.trigger("click");
    expect(up.attributes("disabled")).toBeDefined();
    await up.trigger("click");
    finish();
    await flushPromises();

    expect(adapter.setVote).toHaveBeenCalledTimes(1);
  });

  it("hides the vote buttons when voting is disabled", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      props: { enableVoting: false },
    });

    expect(wrapper.find("#comment-upvote-button-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-reply-button-c1").exists()).toBe(true);
  });
});

describe("CommentNode: replying", () => {
  it("toggles the reply form, names who is replied to, and closes on cancel", async () => {
    const { wrapper } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });
    const reply = wrapper.find("#comment-reply-button-c1");

    await reply.trigger("click");
    expect(reply.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find("#comment-form-reply-to-c1").text()).toContain("Budi");

    await wrapper.find("#comment-form-cancel-button-c1").trigger("click");
    expect(wrapper.find("#comment-reply-form-container-c1").exists()).toBe(
      false,
    );
  });

  it("posts the reply under the comment", async () => {
    const { wrapper, adapter } = await mountSection({
      rows: [own()],
      viewer: SIGNED_IN,
    });
    await wrapper.find("#comment-reply-button-c1").trigger("click");
    await wrapper.find("#comment-content-c1").setValue("Setuju");

    await wrapper.find("#comment-form-c1").trigger("submit");
    await flushPromises();

    expect(adapter.submitComment).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Setuju", parentCommentId: "c1" }),
    );
    expect(wrapper.find("#comment-reply-form-container-c1").exists()).toBe(
      false,
    );
  });
});

describe("CommentNode: thread layout", () => {
  const chain = (depth: number) =>
    Array.from({ length: depth }, (_, i) =>
      item(`d${i}`, { parent_comment_id: i ? `d${i - 1}` : null }),
    );

  it("renders replies with itself even when the host registers its own CommentNode", async () => {
    const { wrapper } = await mountSection({
      rows: chain(2),
      globalComponents: {
        CommentNode: { template: '<div class="host-node" />' },
      },
    });

    expect(wrapper.find(".host-node").exists()).toBe(false);
    expect(wrapper.find("#comment-text-d1").exists()).toBe(true);
  });

  it("only separates top-level comments with a divider", async () => {
    const { wrapper } = await mountSection({ rows: chain(2) });

    expect(wrapper.find("#comment-node-d0").classes()).toContain("border-b");
    expect(wrapper.find("#comment-node-d1").classes()).not.toContain(
      "border-b",
    );
  });

  it("indents replies up to maxDepth and keeps deeper ones flat", async () => {
    const { wrapper } = await mountSection({
      rows: chain(3),
      props: { maxDepth: 1 },
    });

    expect(wrapper.find("#comment-children-container-d0").classes()).toContain(
      "border-l-2",
    );
    expect(
      wrapper.find("#comment-children-container-d1").classes(),
    ).not.toContain("border-l-2");
  });

  it("shows a notice for a removed ancestor and keeps its replies", async () => {
    const { wrapper } = await mountSection({
      rows: [item("c2", { parent_comment_id: "gone" })],
    });

    expect(wrapper.find("#comment-removed-gone").text()).toBe(
      "Komentar ini tidak tersedia.",
    );
    expect(wrapper.find("#comment-footer-gone").exists()).toBe(false);
    expect(wrapper.find("#comment-node-c2").exists()).toBe(true);
  });

  it("collapses threads with more than 3 replies behind a toggle", async () => {
    const { wrapper } = await mountSection({
      rows: [
        item("root"),
        ...["r1", "r2", "r3", "r4"].map((id) =>
          item(id, { parent_comment_id: "root" }),
        ),
      ],
    });
    const toggle = wrapper.find("#comment-replies-toggle-root");
    expect(toggle.text()).toBe("Lihat 4 balasan");
    expect(wrapper.find("#comment-children-container-root").exists()).toBe(
      false,
    );

    await toggle.trigger("click");

    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find("#comment-children-container-root").exists()).toBe(
      true,
    );
    expect(toggle.text()).toBe("Sembunyikan balasan");
  });

  it("shows up to 3 replies directly, counting nested ones but not placeholders", async () => {
    const { wrapper } = await mountSection({
      rows: [
        item("root"),
        item("r1", { parent_comment_id: "root" }),
        item("r2", { parent_comment_id: "r1" }),
        item("r3", { parent_comment_id: "gone", path: "root.gone.r3" }),
      ],
    });

    expect(wrapper.find("#comment-replies-toggle-root").exists()).toBe(false);
    expect(wrapper.find("#comment-node-r3").exists()).toBe(true);
  });

  it("expands a collapsed thread after a reply is posted into it", async () => {
    const { wrapper } = await mountSection({
      rows: [
        own({ id: "root" }),
        ...["r1", "r2", "r3", "r4"].map((id) =>
          item(id, { parent_comment_id: "root" }),
        ),
      ],
      viewer: SIGNED_IN,
    });
    await wrapper.find("#comment-reply-button-root").trigger("click");
    await wrapper.find("#comment-content-root").setValue("Balasan");

    await wrapper.find("#comment-form-root").trigger("submit");
    await flushPromises();

    expect(wrapper.find("#comment-children-container-root").exists()).toBe(
      true,
    );
  });
});

describe("CommentNode: moderation actions", () => {
  it("allows moderator to quick-approve a pending comment", async () => {
    const adapter = createFakeAdapter();
    adapter.moderateComment = vi.fn().mockResolvedValue(undefined);
    const { wrapper } = await mountSection({
      adapter,
      rows: [item("c1", { status: "pending_review" })],
      viewer: { ...SIGNED_IN, canModerate: true },
    });

    const approveBtn = wrapper.find("#comment-approve-button-c1");
    expect(approveBtn.exists()).toBe(true);

    await approveBtn.trigger("click");
    await flushPromises();

    expect(adapter.moderateComment).toHaveBeenCalledWith(
      ["c1"],
      "publish",
      undefined,
    );
    expect(wrapper.emitted("notify")).toContainEqual([
      expect.objectContaining({ level: "success" }),
    ]);
  });

  it("handles quick-approve errors gracefully", async () => {
    const adapter = createFakeAdapter();
    adapter.moderateComment = vi
      .fn()
      .mockRejectedValue(new Error("approve failed"));
    const { wrapper } = await mountSection({
      adapter,
      rows: [item("c1", { status: "pending_review" })],
      viewer: { ...SIGNED_IN, canModerate: true },
    });

    const approveBtn = wrapper.find("#comment-approve-button-c1");
    await approveBtn.trigger("click");
    await flushPromises();

    expect(wrapper.emitted("notify")).toContainEqual([
      expect.objectContaining({ level: "error" }),
    ]);
  });

  it("allows moderator to pin and unpin a comment when pinning feature is enabled", async () => {
    const adapter = createFakeAdapter();
    adapter.pinComment = vi.fn().mockResolvedValue(undefined);
    const { wrapper } = await mountSection({
      adapter,
      rows: [item("c1", { is_pinned: false })],
      viewer: { ...SIGNED_IN, canModerate: true },
      props: { enablePinning: true },
    });

    const pinBtn = wrapper.find("#comment-pin-button-c1");
    expect(pinBtn.exists()).toBe(true);

    await pinBtn.trigger("click");
    await flushPromises();

    expect(adapter.pinComment).toHaveBeenCalledWith("c1", true);
  });

  it("handles pin comment errors gracefully", async () => {
    const adapter = createFakeAdapter();
    adapter.pinComment = vi.fn().mockRejectedValue(new Error("pin failed"));
    const { wrapper } = await mountSection({
      adapter,
      rows: [item("c1", { is_pinned: true })],
      viewer: { ...SIGNED_IN, canModerate: true },
      props: { enablePinning: true },
    });

    const pinBtn = wrapper.find("#comment-pin-button-c1");
    await pinBtn.trigger("click");
    await flushPromises();

    expect(wrapper.emitted("notify")).toContainEqual([
      expect.objectContaining({ level: "error" }),
    ]);
  });
});
