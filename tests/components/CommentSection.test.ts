import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { ref } from "vue";

import CommentNode from "../../src/components/CommentNode.vue";
import CommentSection from "../../src/components/CommentSection.vue";
import { useCommentTree } from "../../src/composables/useCommentTree";
import { createFakeAdapter, item, SIGNED_IN, TARGET } from "../helpers";
import { mountSection } from "./mountSection";

afterEach(() => {
  document.body.innerHTML = "";
});

const dated = (id: string, day: number, extra = {}) =>
  item(id, {
    created_at: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
    ...extra,
  });

describe("CommentSection", () => {
  it("loads its own thread on mount and wraps it in the theme root", async () => {
    const { wrapper, adapter } = await mountSection({ rows: [item("c1")] });

    expect(adapter.fetchComments).toHaveBeenCalledWith(TARGET);
    expect(wrapper.classes()).toContain("comments-root");
    expect(wrapper.find("#comment-node-c1").exists()).toBe(true);
  });

  it("shows an invitation to comment first when there are no comments", async () => {
    const { wrapper } = await mountSection({ rows: [] });

    expect(wrapper.find("#comment-section-empty-title").text()).toBe(
      "Belum ada komentar",
    );
    expect(wrapper.find("#comment-section-list").exists()).toBe(false);
  });

  it("shows the load error only while there is nothing to display", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchComments.mockRejectedValue(new Error("down"));
    const { wrapper } = await mountSection({ adapter });

    expect(wrapper.find("#comment-section-error-text").text()).toBe(
      "Gagal memuat komentar: down",
    );
  });

  it("uses the chosen locale and message overrides", async () => {
    const { wrapper } = await mountSection({
      rows: [],
      props: {
        locale: "en",
        messages: { section: { emptyHint: "Say something!" } },
      },
    });

    expect(wrapper.find("#comment-section-empty-title").text()).toBe(
      "No comments yet",
    );
    expect(wrapper.find("#comment-section-empty-hint").text()).toBe(
      "Say something!",
    );
  });

  describe("sorting", () => {
    const rows = [
      dated("old", 1, { upvote_count: 1 }),
      dated("mid", 2, { upvote_count: 5 }),
      dated("new", 3, { is_pinned: true }),
    ];

    it("is hidden with fewer than two top-level comments", async () => {
      const { wrapper } = await mountSection({ rows: [item("c1")] });

      expect(wrapper.find("#comment-section-sort").exists()).toBe(false);
    });

    it("lists the three orders with the current one pressed", async () => {
      const { wrapper } = await mountSection({ rows });

      const buttons = wrapper.findAll("#comment-section-sort button");
      expect(buttons.map((b) => b.text())).toEqual([
        "Terbaru",
        "Terlama",
        "Terpopuler",
      ]);
      expect(
        wrapper.find("#comment-section-sort-oldest").attributes("aria-pressed"),
      ).toBe("true");
    });

    it("re-orders the visible comments when an order is chosen", async () => {
      const { wrapper } = await mountSection({ rows });

      await wrapper.find("#comment-section-sort-popular").trigger("click");

      const ids = wrapper
        .findAll("#comment-section-list > [id^='comment-node-']")
        .map((n) => n.attributes("id"));
      expect(ids).toEqual([
        "comment-node-mid",
        "comment-node-old",
        "comment-node-new",
      ]);
    });

    it("shows pinned badges when pinning is enabled without altering sort options", async () => {
      const { wrapper } = await mountSection({
        rows,
        props: { enablePinning: true },
      });

      expect(
        wrapper.findAll("#comment-section-sort button").map((b) => b.text()),
      ).toEqual(["Terbaru", "Terlama", "Terpopuler"]);
      expect(wrapper.find("#comment-pinned-badge-new").text()).toBe(
        "Disematkan",
      );
    });

    it("does not show pinned badges while pinning is disabled", async () => {
      const { wrapper } = await mountSection({ rows });

      expect(wrapper.find("#comment-pinned-badge-new").exists()).toBe(false);
    });

    describe("compact sort menu (narrow screens)", () => {
      const menuOrders = (
        wrapper: Awaited<ReturnType<typeof mountSection>>["wrapper"],
      ) =>
        wrapper
          .findAll("#comment-section-sort-menu button")
          .map((b) => b.text());

      it("is hidden with fewer than two comments", async () => {
        const { wrapper } = await mountSection({ rows: [item("c1")] });

        expect(wrapper.find("#comment-section-sort-menu-button").exists()).toBe(
          false,
        );
      });

      it("opens from one Urutkan button and lists the three orders", async () => {
        const { wrapper } = await mountSection({ rows });
        const button = wrapper.find("#comment-section-sort-menu-button");
        expect(button.attributes("aria-expanded")).toBe("false");
        expect(wrapper.find("#comment-section-sort-menu").exists()).toBe(false);

        await button.trigger("click");

        expect(button.attributes("aria-expanded")).toBe("true");
        expect(menuOrders(wrapper)).toEqual([
          "Terbaru",
          "Terlama",
          "Terpopuler",
        ]);
        expect(
          wrapper
            .find("#comment-section-sort-menu-oldest")
            .attributes("aria-pressed"),
        ).toBe("true");
      });

      it("re-orders the comments and closes when an order is chosen", async () => {
        const { wrapper } = await mountSection({ rows });
        await wrapper
          .find("#comment-section-sort-menu-button")
          .trigger("click");

        await wrapper
          .find("#comment-section-sort-menu-popular")
          .trigger("click");

        expect(wrapper.find("#comment-section-sort-menu").exists()).toBe(false);
        expect(
          wrapper
            .findAll("#comment-section-list > [id^='comment-node-']")
            .map((n) => n.attributes("id")),
        ).toEqual(["comment-node-mid", "comment-node-old", "comment-node-new"]);
        // The desktop buttons follow the same order.
        expect(
          wrapper
            .find("#comment-section-sort-popular")
            .attributes("aria-pressed"),
        ).toBe("true");
      });

      it("closes on a press outside and on Escape, returning focus", async () => {
        const { wrapper } = await mountSection({ rows });
        const button = wrapper.find("#comment-section-sort-menu-button");

        await button.trigger("click");
        document.body.dispatchEvent(
          new Event("pointerdown", { bubbles: true }),
        );
        await flushPromises();
        expect(wrapper.find("#comment-section-sort-menu").exists()).toBe(false);

        await button.trigger("click");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await flushPromises();
        expect(wrapper.find("#comment-section-sort-menu").exists()).toBe(false);
        expect(document.activeElement).toBe(button.element);
      });
    });

    it("shares a header row with the heading slot, above the form", async () => {
      const { wrapper } = await mountSection({
        rows,
        slots: { heading: '<h2 id="slot-heading">Komentar</h2>' },
      });

      const header = wrapper.find("#comment-section-header");
      expect(header.find("#slot-heading").exists()).toBe(true);
      expect(header.find("#comment-section-sort").exists()).toBe(true);
      expect(
        header.element.compareDocumentPosition(
          wrapper.find("#comment-form-container, #comment-form-auth-prompt")
            .element,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("renders the heading slot alone when there is nothing to sort", async () => {
      const { wrapper } = await mountSection({
        rows: [item("c1")],
        slots: { heading: '<h2 id="slot-heading">Komentar</h2>' },
      });

      expect(wrapper.find("#comment-section-header").exists()).toBe(true);
      expect(wrapper.find("#comment-section-sort").exists()).toBe(false);
    });

    it("renders no header row without a heading slot or sort", async () => {
      const { wrapper } = await mountSection({ rows: [item("c1")] });

      expect(wrapper.find("#comment-section-header").exists()).toBe(false);
    });
  });

  it("offers to load more when comments exceed the first page", async () => {
    const { wrapper } = await mountSection({
      rows: Array.from({ length: 12 }, (_, i) => item(`c${i}`)),
    });

    const button = wrapper.find("#comment-section-load-more-button");
    expect(button.text()).toBe("Muat lebih banyak (2 tersisa)");

    await button.trigger("click");

    expect(wrapper.find("#comment-section-load-more-button").exists()).toBe(
      false,
    );
    expect(wrapper.findAll("[id^='comment-text-']")).toHaveLength(12);
  });

  it("renders a host-managed tree without loading it", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchComments.mockResolvedValue([item("c1")]);
    const tree = useCommentTree(adapter, {
      target: TARGET,
      viewer: ref(SIGNED_IN),
    });
    const wrapper = mount(CommentSection, { props: { tree } });
    await flushPromises();
    expect(adapter.fetchComments).not.toHaveBeenCalled();
    expect(wrapper.find("#comment-node-c1").exists()).toBe(false);

    await tree.load();
    await flushPromises();

    expect(wrapper.find("#comment-node-c1").exists()).toBe(true);
  });

  it("only renders comments and forms inside a section", () => {
    expect(() =>
      mount(CommentNode, {
        props: { comment: { ...item("c1"), children: [] } },
      }),
    ).toThrow(/inside CommentSection/);
  });

  it("refuses to render without a tree or an adapter", () => {
    expect(() => mount(CommentSection)).toThrow(/tree.*adapter/);
  });

  it("passes handled errors to the error handler", async () => {
    const adapter = createFakeAdapter();
    adapter.fetchComments.mockRejectedValue(new Error("raw"));
    const { wrapper } = await mountSection({
      adapter,
      props: { errorHandler: () => "Pesan ramah" },
    });

    expect(wrapper.find("#comment-section-error-text").text()).toBe(
      "Gagal memuat komentar: Pesan ramah",
    );
  });
});
