import {
  type Component,
  type ComputedRef,
  inject,
  type InjectionKey,
  type Ref,
  type Slots,
} from "vue";

import type { CommentTree } from "../composables/useCommentTree";
import type { CommentMessages } from "../types";
import type { DateFormatOptions } from "../utils/time";

export type NotifyLevel = "success" | "error" | "info";

export interface CommentNotification {
  level: NotifyLevel;
  message: string;
}

/** Rewrites an image URL, e.g. to a resized CDN variant. */
export type TransformImageUrl = (
  url: string,
  options: { width: number },
) => string;

export interface CommentFeatures {
  voting: boolean;
  attachments: boolean;
  allowGuests: boolean;
  pinning: boolean;
  /** Reply levels that get their own indentation; deeper replies render flat. */
  maxDepth: number;
  maxLength: number | null;
  editWindowMinutes: number | null;
}

/** What CommentSection shares with the nodes and forms it renders. */
export interface CommentSectionContext {
  tree: CommentTree;
  /**
   * The comment node component, so replies render it through the context
   * instead of a self-import or a name lookup (which would resolve to a host
   * component that happens to be called CommentNode).
   */
  nodeComponent: Component;
  messages: ComputedRef<CommentMessages>;
  features: ComputedRef<CommentFeatures>;
  dateOptions: ComputedRef<DateFormatOptions>;
  transformImageUrl: (url: string, options: { width: number }) => string;
  /** Shared clock for relative dates; one timer serves every comment. */
  now: Ref<Date>;
  /** The host's slots, forwarded to nested nodes. */
  slots: Slots;
  notify: (notification: CommentNotification) => void;
}

export const COMMENT_SECTION_CONTEXT: InjectionKey<CommentSectionContext> =
  Symbol("CommentSectionContext");

export function useCommentSectionContext(): CommentSectionContext {
  const context = inject(COMMENT_SECTION_CONTEXT, null);
  if (!context) {
    throw new Error(
      "CommentNode and CommentForm must be rendered inside CommentSection.",
    );
  }
  return context;
}
