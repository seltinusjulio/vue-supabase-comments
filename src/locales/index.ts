import type {
  CommentLocale,
  CommentMessages,
  CommentMessagesOverride,
} from "../types";

import { en } from "./en";
import { id } from "./id";

export const commentLocales: Record<CommentLocale, CommentMessages> = {
  en,
  id,
};

/**
 * The preset for `locale` with `overrides` merged over it group by group, so a
 * host can replace single entries without restating the rest.
 */
export function resolveCommentMessages(
  locale: CommentLocale = "id",
  overrides: CommentMessagesOverride = {},
): CommentMessages {
  const base = commentLocales[locale];
  return {
    common: { ...base.common, ...overrides.common },
    section: {
      ...base.section,
      ...overrides.section,
      sort: { ...base.section.sort, ...overrides.section?.sort },
    },
    form: { ...base.form, ...overrides.form },
    node: { ...base.node, ...overrides.node },
    time: { ...base.time, ...overrides.time },
    errors: { ...base.errors, ...overrides.errors },
    moderation: { ...base.moderation, ...overrides.moderation },
  };
}

export { en, id };
