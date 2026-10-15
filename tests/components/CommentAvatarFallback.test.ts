import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import CommentAvatarFallback from "../../src/components/CommentAvatarFallback.vue";
import { getAvatarColorIndex, getInitials } from "../../src/utils/avatar";

describe("CommentAvatarFallback", () => {
  it("shows colored initials when a name is known", () => {
    const wrapper = mount(CommentAvatarFallback, {
      props: { name: "Budi Santoso" },
    });

    expect(wrapper.text()).toBe("BS");
    expect(wrapper.attributes("class")).toMatch(/cmt-avatar-[0-5]/);
  });

  it("gives the same name the same color", () => {
    const color = (name: string) =>
      mount(CommentAvatarFallback, { props: { name } })
        .attributes("class")
        ?.match(/cmt-avatar-\d/)?.[0];

    expect(color("Budi")).toBe(color("  budi "));
  });

  it("falls back to the silhouette without a name", () => {
    const wrapper = mount(CommentAvatarFallback, { props: { name: "" } });

    expect(wrapper.find("svg").exists()).toBe(true);
    expect(wrapper.text()).toBe("");
  });

  it("passes an id attribute through to its root", () => {
    const wrapper = mount(CommentAvatarFallback, {
      props: { name: "Budi" },
      attrs: { id: "avatar-1" },
    });

    expect(wrapper.attributes("id")).toBe("avatar-1");
  });
});

describe("avatar helpers", () => {
  it.each([
    ["Budi Santoso", "BS"],
    ["budi", "B"],
    ["Maria Theresia Ani", "MA"],
    ["  ", ""],
    [null, ""],
    ["🎵 Lagu", "🎵L"],
  ])("getInitials(%j) = %j", (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });

  it("keeps palette indexes in range", () => {
    expect(getAvatarColorIndex("Budi", 6)).toBeLessThan(6);
    expect(getAvatarColorIndex("Budi", 0)).toBe(0);
    expect(getAvatarColorIndex(undefined, 6)).toBe(0);
  });
});
