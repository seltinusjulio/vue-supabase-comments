import type { VNode } from "vue";

import { flushPromises, mount } from "@vue/test-utils";

import type { CommentItem, CommentViewer } from "../../src/types";

import CommentSection from "../../src/components/CommentSection.vue";
import { createFakeAdapter, type FakeAdapter, TARGET } from "../helpers";

/** A test slot; its props depend on the slot, so they stay loosely typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestSlot = (props: Record<string, any>) => VNode | string;

export interface MountOptions {
  rows?: CommentItem[];
  viewer?: CommentViewer | null;
  props?: Record<string, unknown>;
  slots?: Record<string, TestSlot | string>;
  adapter?: FakeAdapter;
}

/** Mounts a CommentSection backed by a fake adapter and waits for the load. */
export async function mountSection(options: MountOptions = {}) {
  const adapter = options.adapter ?? createFakeAdapter();
  if (options.rows) adapter.fetchComments.mockResolvedValue(options.rows);
  const wrapper = mount(CommentSection, {
    props: {
      adapter,
      targetId: TARGET.targetId,
      targetType: TARGET.targetType,
      viewer: options.viewer ?? null,
      ...options.props,
    },
    slots: options.slots as Record<string, never>,
    attachTo: document.body,
  });
  await flushPromises();
  return { wrapper, adapter };
}
