import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { h } from "vue";

import { createFakeAdapter, GUEST, item, SIGNED_IN } from "../helpers";
import { mountSection } from "./mountSection";

afterEach(() => {
  document.body.innerHTML = "";
});

const textarea = (
  wrapper: Awaited<ReturnType<typeof mountSection>>["wrapper"],
) => wrapper.find("#comment-content");

describe("CommentForm: top-level form", () => {
  it("starts compact: a short textarea without fields, attachments or buttons", async () => {
    const { wrapper } = await mountSection({ viewer: SIGNED_IN });

    expect(textarea(wrapper).attributes("rows")).toBe("2");
    expect(wrapper.find("#comment-form-attachments-container").exists()).toBe(
      false,
    );
    expect(wrapper.find("#comment-form-actions-container").exists()).toBe(
      false,
    );
    expect(wrapper.find("#comment-form-title").classes()).toContain("sr-only");
  });

  it("shows guest fields with a privacy hint once a guest focuses it", async () => {
    const { wrapper } = await mountSection({ viewer: GUEST });

    await textarea(wrapper).trigger("focus");

    expect(wrapper.find("#guest-name").exists()).toBe(true);
    expect(wrapper.find("#guest-email").attributes("aria-describedby")).toBe(
      "comment-form-guest-email-hint",
    );
    expect(wrapper.find("#comment-form-guest-email-hint").text()).toBe(
      "Email tidak akan ditampilkan kepada publik.",
    );
    expect(wrapper.find("#comment-form-attachments-container").exists()).toBe(
      false,
    );
  });

  it("offers attachments to signed-in users once focused", async () => {
    const { wrapper } = await mountSection({ viewer: SIGNED_IN });

    await textarea(wrapper).trigger("focus");

    expect(wrapper.find("#comment-image-input").exists()).toBe(true);
    expect(wrapper.find("#comment-file-input").exists()).toBe(true);
    expect(wrapper.find("#guest-name").exists()).toBe(false);
  });

  it("hides attachments when they are disabled", async () => {
    const { wrapper } = await mountSection({
      viewer: SIGNED_IN,
      props: { enableAttachments: false },
    });

    await textarea(wrapper).trigger("focus");

    expect(wrapper.find("#comment-form-attachments-container").exists()).toBe(
      false,
    );
  });

  it("expands as soon as there is a draft, even without focus", async () => {
    const { wrapper } = await mountSection({ viewer: SIGNED_IN });

    await textarea(wrapper).setValue("Draf");

    expect(textarea(wrapper).attributes("rows")).toBe("3");
    expect(wrapper.find("#comment-form-submit-button").exists()).toBe(true);
  });

  it("shows Batal once expanded, and it discards the draft and collapses", async () => {
    const { wrapper } = await mountSection({ viewer: SIGNED_IN });
    await textarea(wrapper).trigger("focus");

    const cancel = wrapper.find("#comment-form-cancel-button");
    expect(cancel.text()).toBe("Batal");
    expect(
      wrapper
        .findAll("#comment-form-buttons-group button")
        .map((b) => b.text()),
    ).toEqual(["Batal", "Kirim Komentar"]);

    await textarea(wrapper).setValue("Tidak jadi");
    await cancel.trigger("click");

    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe("");
    expect(textarea(wrapper).attributes("rows")).toBe("2");
    expect(wrapper.find("#comment-form-actions-container").exists()).toBe(
      false,
    );
  });

  it("discards a picked photo and file when Batal is pressed", async () => {
    const { wrapper } = await mountSection({ viewer: SIGNED_IN });
    await textarea(wrapper).trigger("focus");
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const input = wrapper.find("#comment-file-input");
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    expect(wrapper.find("#comment-form-file-name").exists()).toBe(true);

    await wrapper.find("#comment-form-cancel-button").trigger("click");

    expect(wrapper.find("#comment-form-file-name").exists()).toBe(false);
  });

  it("submits for a signed-in user with attachments and collapses again", async () => {
    const { wrapper, adapter } = await mountSection({ viewer: SIGNED_IN });
    await textarea(wrapper).setValue("Amin");
    const image = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const input = wrapper.find("#comment-image-input");
    Object.defineProperty(input.element, "files", { value: [image] });
    await input.trigger("change");
    expect(wrapper.find("#comment-form-image-preview").exists()).toBe(true);

    await wrapper.find("#comment-form").trigger("submit");
    await flushPromises();

    expect(adapter.submitComment).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Amin",
        parentCommentId: null,
        imageFile: image,
        attachmentFile: null,
      }),
    );
    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe("");
    expect(wrapper.find("#comment-form-image-preview").exists()).toBe(false);
    expect(wrapper.find("#comment-form-moderation-alert").exists()).toBe(false);
  });

  it("submits a guest comment with name and email and shows the moderation notice", async () => {
    const { wrapper, adapter } = await mountSection({ viewer: GUEST });
    await textarea(wrapper).setValue("Bagus");
    const submit = wrapper.find("#comment-form-submit-button");
    expect(submit.attributes("disabled")).toBeDefined();
    await wrapper.find("#guest-name").setValue("Tamu");
    await wrapper.find("#guest-email").setValue("tamu@example.com");

    await wrapper.find("#comment-form").trigger("submit");
    await flushPromises();

    expect(adapter.submitComment).toHaveBeenCalledWith(
      expect.objectContaining({
        guestName: "Tamu",
        guestEmail: "tamu@example.com",
      }),
    );
    expect(adapter.submitComment.mock.calls[0]?.[0]).not.toHaveProperty(
      "imageFile",
    );
    expect(wrapper.find("#comment-form-moderation-alert").text()).toBe(
      "Komentar Anda telah dikirim untuk moderasi.",
    );

    // A new draft supersedes the notice.
    await textarea(wrapper).setValue("Lagi");
    expect(wrapper.find("#comment-form-moderation-alert").exists()).toBe(false);
  });

  it("shows the error and keeps the draft when submitting fails", async () => {
    const adapter = createFakeAdapter();
    adapter.submitComment.mockRejectedValue(new Error("insert rejected"));
    const { wrapper } = await mountSection({ adapter, viewer: SIGNED_IN });
    await textarea(wrapper).setValue("Amin");

    await wrapper.find("#comment-form").trigger("submit");
    await flushPromises();

    const alert = wrapper.find("#comment-form-submit-error");
    expect(alert.text()).toBe("insert rejected");
    expect(alert.attributes("role")).toBe("alert");
    expect((textarea(wrapper).element as HTMLTextAreaElement).value).toBe(
      "Amin",
    );
  });

  it("rejects photos over 2MB and files over 5MB", async () => {
    const { wrapper } = await mountSection({ viewer: SIGNED_IN });
    await textarea(wrapper).trigger("focus");
    const pick = async (selector: string, size: number) => {
      const input = wrapper.find(selector);
      Object.defineProperty(input.element, "files", {
        value: [{ name: "big", size }],
        configurable: true,
      });
      await input.trigger("change");
    };

    await pick("#comment-image-input", 3 * 1024 * 1024);
    expect(wrapper.find("#comment-form-submit-error").text()).toBe(
      "Ukuran foto maksimal 2MB.",
    );

    await pick("#comment-file-input", 6 * 1024 * 1024);
    expect(wrapper.find("#comment-form-submit-error").text()).toBe(
      "Ukuran file maksimal 5MB.",
    );

    await pick("#comment-file-input", 1024);
    expect(wrapper.find("#comment-form-submit-error").exists()).toBe(false);
    expect(wrapper.find("#comment-form-file-name").text()).toBe("big");

    await wrapper.find("#comment-form-remove-file-button").trigger("click");
    expect(wrapper.find("#comment-form-file-preview").exists()).toBe(false);
  });

  it("counts down the characters left when maxLength is set", async () => {
    const { wrapper } = await mountSection({
      viewer: SIGNED_IN,
      props: { maxLength: 10 },
    });
    expect(textarea(wrapper).attributes("maxlength")).toBe("10");

    await textarea(wrapper).setValue("Halo");

    expect(wrapper.find("#comment-form-char-count").text()).toBe(
      "6 karakter tersisa",
    );
  });
});

describe("CommentForm: sign-in prompt", () => {
  it("asks visitors without a session to sign in", async () => {
    const { wrapper } = await mountSection({ viewer: null });

    expect(wrapper.find("#comment-form").exists()).toBe(false);
    expect(wrapper.find("#comment-form-auth-prompt").text()).toBe(
      "Silakan masuk untuk berkomentar.",
    );
  });

  it("renders the host's auth prompt for guests when guests are not allowed", async () => {
    const { wrapper } = await mountSection({
      viewer: GUEST,
      props: { allowGuests: false },
      slots: {
        "auth-prompt": () => h("button", { class: "sso" }, "Masuk dengan SSO"),
      },
    });

    expect(wrapper.find("#comment-form").exists()).toBe(false);
    expect(wrapper.find(".sso").text()).toBe("Masuk dengan SSO");
  });

  it("lets signed-in users comment even when guests are not allowed", async () => {
    const { wrapper } = await mountSection({
      viewer: SIGNED_IN,
      props: { allowGuests: false },
    });

    expect(wrapper.find("#comment-form").exists()).toBe(true);
  });
});

describe("CommentForm: reply form", () => {
  const openReply = async () => {
    const mounted = await mountSection({
      rows: [item("c1", { guest_name: "Tamu" })],
      viewer: SIGNED_IN,
    });
    await mounted.wrapper.find("#comment-reply-button-c1").trigger("click");
    return mounted;
  };

  it("is always expanded, names who is replied to and has no heading", async () => {
    const { wrapper } = await openReply();

    expect(wrapper.find("#comment-content-c1").attributes("rows")).toBe("3");
    expect(wrapper.find("#comment-form-reply-to-c1").text()).toBe(
      "Membalas Tamu",
    );
    expect(wrapper.find("#comment-form-title-c1").exists()).toBe(false);
    expect(wrapper.find("#comment-content-c1").attributes("placeholder")).toBe(
      "Tulis balasan…",
    );
  });

  it("focuses the textarea when it opens", async () => {
    const { wrapper } = await openReply();

    expect(document.activeElement).toBe(
      wrapper.find("#comment-content-c1").element,
    );
  });

  it("puts Batal before the reply button and suffixes ids with the parent id", async () => {
    const { wrapper } = await openReply();

    const buttons = wrapper.findAll("#comment-form-buttons-group-c1 button");
    expect(buttons.map((b) => b.text())).toEqual(["Batal", "Balas"]);
    expect(buttons[1]?.attributes("id")).toBe("comment-form-reply-button-c1");
    expect(wrapper.find("label[for='comment-content-c1']").exists()).toBe(true);
  });
});
