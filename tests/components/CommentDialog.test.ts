import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import CommentDialog from "../../src/components/CommentDialog.vue";

afterEach(() => {
  document.body.innerHTML = "";
});

const mountDialog = (open: boolean) =>
  mount(CommentDialog, {
    props: { open, label: "Dialog" },
    slots: { default: "<p>isi</p>" },
    attachTo: document.body,
  });

// The template starts with HTML comments, so the wrapper's element is not the
// <dialog> itself.
const dialogOf = (wrapper: ReturnType<typeof mountDialog>) =>
  wrapper.find("dialog").element as HTMLDialogElement;

describe("CommentDialog", () => {
  it("opens and closes with the open prop", async () => {
    const wrapper = mountDialog(false);
    expect(dialogOf(wrapper).open).toBe(false);

    await wrapper.setProps({ open: true });
    expect(dialogOf(wrapper).open).toBe(true);

    await wrapper.setProps({ open: false });
    expect(dialogOf(wrapper).open).toBe(false);
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("asks to close on Escape (cancel) instead of closing itself", () => {
    const wrapper = mountDialog(true);
    const cancel = new Event("cancel", { cancelable: true });

    dialogOf(wrapper).dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(dialogOf(wrapper).open).toBe(true);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("reports a native close the browser did on its own", () => {
    const wrapper = mountDialog(true);

    dialogOf(wrapper).dispatchEvent(new Event("close"));

    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("does not report the native close that follows its own close", async () => {
    const wrapper = mountDialog(true);

    await wrapper.setProps({ open: false });
    dialogOf(wrapper).dispatchEvent(new Event("close"));

    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("closes on a click on the backdrop but not on its content", async () => {
    const wrapper = mountDialog(true);

    await wrapper.find("p").trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    await wrapper.find("dialog").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
