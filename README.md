# vue-supabase-comments

> Domain-agnostic, hierarchical threaded comments engine for Vue 3 and Nuxt with a pluggable backend adapter, PostgreSQL `ltree` support, Tailwind CSS v4 readiness, and zero framework lock-in.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Vue 3](https://img.shields.io/badge/Vue-3.5%2B-brightgreen.svg)](https://vuejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-blue.svg)](https://www.postgresql.org/)

---

## Features

- 🌳 **Hierarchical Threads:** Scalable tree hierarchy powered by PostgreSQL `ltree` with ancestor path preservation and tombstone support for deleted parent nodes.
- 🔌 **Pluggable Backend Adapter:** Decoupled from any single backend or proprietary database schema. Implement `CommentBackendAdapter` to back comments with Supabase, standard PostgreSQL, REST, or any custom API.
- 🛡️ **Zero Framework / Store Lock-in:** Pure Vue 3 Composition API (`useCommentTree`). Does not require Pinia or Nuxt runtime. Safe for SSR and V8 isolates (Cloudflare Workers / Pages).
- 🎨 **Tailwind CSS v4 & Theming:** Styled strictly with CSS custom properties (`--comment-*`). Light and dark mode out-of-the-box.
- 🌐 **Built-in Internationalization:** Native Indonesian (`id`) and English (`en`) dictionary presets, with deep-merge customization via `CommentMessages`.
- 🔐 **Battle-Tested Server-Side Guards:**
  - Automated guest session detection (`is_anonymous`) forcing pending review.
  - Vote spoofing and unauthorized pin prevention on insert.
  - Strict allowlist trigger guarding comment edits and author impersonation.
  - Column-level privilege separation protecting guest contact information (`guest_email`).
- 🛠️ **Unified Admin Moderation Table:** Included `<CommentModerationTable>` component supporting search, live status counts, batch approval/hiding, pinning, and user bans.
- 🧩 **Inversion of Control via Slots:** Inject custom author badges (`#author-badge`), authentication CTAs (`#auth-prompt`), custom action menus (`#comment-actions`), and image viewers (`#image-viewer`).

---

## Table of Contents

- [Installation](#installation)
- [Database Setup](#database-setup)
- [Integration](#integration)
  - [Nuxt 3 / 4 Integration](#nuxt-3--4-integration)
  - [Vanilla Vue 3 / Vite Integration](#vanilla-vue-3--vite-integration)
- [Tailwind CSS v4 Configuration](#tailwind-css-v4-configuration)
- [Theming & CSS Variables](#theming--css-variables)
- [Backend Adapter (`CommentBackendAdapter`)](#backend-adapter-commentbackendadapter)
- [Components Usage](#components-usage)
  - [`<CommentSection>`](#commentsection)
  - [`<CommentModerationTable>`](#commentmoderationtable)
- [Composable: `useCommentTree`](#composable-usecommenttree)
- [Internationalization (i18n)](#internationalization-i18n)
- [License](#license)

---

## Installation

### Option A: Git Submodule (Recommended for multi-repo private setups)

```bash
git submodule add https://github.com/<org>/vue-supabase-comments.git packages/comments
```

### Option B: Local / Monorepo Package

Include the module in your workspace or copy to `packages/comments`.

---

## Database Setup

The module includes a production-ready SQL recipe in [`sql/comments_schema.sql`](./sql/comments_schema.sql).

### Prerequisites

- **PostgreSQL 16 or newer** (PostgreSQL 16+ allows hyphenated raw UUIDs in `ltree` labels).
- PostgreSQL `ltree` extension enabled.

Run the recipe in your Supabase SQL Editor or migration pipeline:

```bash
# In Supabase CLI
supabase db push
# Or apply sql/comments_schema.sql directly to your PostgreSQL database
```

The recipe sets up:

1. `comments`, `comment_votes`, and `comment_bans` tables.
2. `path` trigger using raw UUIDs for precise tree reconstruction.
3. Server-side insert defaults (vote reset, guest moderation status).
4. Allowlist update guards preventing author spoofing and column manipulation.
5. Column-level privilege revoking `guest_email` from public roles.
6. `soft_delete_comment` and `get_admin_comments` SECURITY DEFINER RPCs.

---

## Integration

### Nuxt 3 / 4 Integration

Register the module entry in `nuxt.config.ts`:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["./packages/comments/src/module"],
  comments: {
    css: true, // Inject default CSS variables
    prefix: "", // Optional component prefix, e.g. "Pkg" -> <PkgCommentSection>
  },
});
```

This auto-registers:

- Components: `CommentSection`, `CommentNode`, `CommentForm`, `CommentModerationTable`
- Auto-imports: `useCommentTree`, `resolveCommentMessages`

### Vanilla Vue 3 / Vite Integration

Import components and styles directly in your application:

```ts
// main.ts
import "vue-supabase-comments/styles.css";
```

```vue
<script setup lang="ts">
import { CommentSection, useCommentTree } from "vue-supabase-comments";
</script>
```

---

## Tailwind CSS v4 Configuration

Because the module uses scoped CSS classes and CSS custom properties inside `@layer base`, you should tell Tailwind v4 to scan the module sources for utility classes if needed:

```css
/* In your main CSS file (e.g. assets/css/main.css) */
@source "../../packages/comments/src";
```

---

## Theming & CSS Variables

The module is styled through `--comment-*` variables attached to `.comments-root`. To customize the appearance, override these variables in your host application:

```css
/* Light Mode overrides */
.comments-root {
  --comment-primary: #1e3a8a;
  --comment-primary-hover: #172554;
  --comment-bg: #ffffff;
  --comment-surface: #f8fafc;
  --comment-text: #0f172a;
  --comment-border: #e2e8f0;
}

/* Dark Mode overrides */
.dark .comments-root,
[data-theme="dark"] .comments-root {
  --comment-primary: #3b82f6;
  --comment-primary-hover: #60a5fa;
  --comment-bg: #0f172a;
  --comment-surface: #1e293b;
  --comment-text: #f8fafc;
  --comment-border: #334155;
}
```

---

## Backend Adapter (`CommentBackendAdapter`)

Create an adapter that satisfies `CommentBackendAdapter`.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommentBackendAdapter,
  CommentItem,
  CommentTarget,
  SubmitCommentPayload,
} from "vue-supabase-comments";

export function createSupabaseCommentsAdapter(
  supabase: SupabaseClient,
): CommentBackendAdapter {
  return {
    async fetchComments(target: CommentTarget): Promise<CommentItem[]> {
      const { data, error } = await supabase
        .from("comments")
        .select(
          "id, target_id, target_type, parent_comment_id, path, content, status, created_at, updated_at, upvote_count, downvote_count, user_id, guest_name, image_upload_url, file_upload_url",
        )
        .eq("target_id", target.targetId)
        .eq("target_type", target.targetType)
        .order("path", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },

    async countComments(target: CommentTarget): Promise<number> {
      const { count, error } = await supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("target_id", target.targetId)
        .eq("target_type", target.targetType)
        .eq("status", "published");

      if (error) throw error;
      return count ?? 0;
    },

    async fetchUserVotes(
      target: CommentTarget,
    ): Promise<Record<string, "up" | "down">> {
      const { data, error } = await supabase
        .from("comment_votes")
        .select("comment_id, vote_type");
      if (error) throw error;
      return Object.fromEntries(data.map((v) => [v.comment_id, v.vote_type]));
    },

    async submitComment(payload: SubmitCommentPayload): Promise<void> {
      const { error } = await supabase.from("comments").insert({
        target_id: payload.targetId,
        target_type: payload.targetType,
        parent_comment_id: payload.parentId ?? null,
        content: payload.content,
        guest_name: payload.guestName,
        guest_email: payload.guestEmail,
      });
      if (error) throw error;
    },

    async setVote(
      commentId: string,
      vote: "up" | "down" | null,
    ): Promise<void> {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Must be signed in to vote");

      if (vote === null) {
        await supabase
          .from("comment_votes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("comment_votes")
          .upsert({ comment_id: commentId, user_id: user.id, vote_type: vote });
      }
    },

    async updateComment(commentId: string, content: string): Promise<void> {
      const { error } = await supabase
        .from("comments")
        .update({ content })
        .eq("id", commentId);
      if (error) throw error;
    },

    async deleteComment(commentId: string): Promise<void> {
      const { error } = await supabase.rpc("soft_delete_comment", {
        p_comment_id: commentId,
      });
      if (error) throw error;
    },
  };
}
```

---

## Components Usage

### `<CommentSection>`

The primary interactive comment section displaying threaded comments, voting, replies, image attachments, and comment form.

```vue
<script setup lang="ts">
import { computed } from "vue";
import { CommentSection } from "vue-supabase-comments";
import { useAuthStore } from "@/stores/useAuthStore";
import { commentsAdapter } from "@/utils/commentsAdapter";

const auth = useAuthStore();

const viewer = computed(() => ({
  userId: auth.user?.id ?? null,
  isAnonymous: auth.user?.is_anonymous ?? true,
  canModerate: auth.user?.role === "admin" || auth.user?.role === "moderator",
}));

function handleNotification(notification: {
  level: "success" | "error" | "info";
  message: string;
}) {
  console.log(`[${notification.level}] ${notification.message}`);
}
</script>

<template>
  <CommentSection
    :target-id="'article-123'"
    :target-type="'article'"
    :adapter="commentsAdapter"
    :viewer="viewer"
    :allow-guests="true"
    :enable-voting="true"
    :enable-attachments="true"
    :enable-pinning="true"
    :max-depth="3"
    :max-length="2000"
    :locale="'id'"
    @notify="handleNotification"
  >
    <!-- Custom Author Badge slot -->
    <template #author-badge="{ author, comment }">
      <span v-if="author.metadata?.isStaff" class="badge-staff">Staff</span>
    </template>

    <!-- Custom Auth Prompt slot for non-logged in users when allowGuests is false -->
    <template #auth-prompt>
      <button class="btn-login" @click="auth.login()">
        Masuk untuk berkomentar
      </button>
    </template>
  </CommentSection>
</template>
```

#### Props

| Prop                | Type                       | Default                               | Description                                            |
| ------------------- | -------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `targetId`          | `string`                   | **Required**                          | Unique ID of the commented entity.                     |
| `targetType`        | `string`                   | **Required**                          | Type of the entity (e.g. `'article'`, `'song'`).       |
| `adapter`           | `CommentBackendAdapter`    | **Required**                          | Backend adapter instance.                              |
| `viewer`            | `CommentViewer`            | `{ userId: null, isAnonymous: true }` | Reactive state of the current viewer.                  |
| `allowGuests`       | `boolean`                  | `true`                                | Allow anonymous sessions to comment.                   |
| `enableVoting`      | `boolean`                  | `true`                                | Enable upvote and downvote buttons.                    |
| `enableAttachments` | `boolean`                  | `false`                               | Enable image and file attachments.                     |
| `enablePinning`     | `boolean`                  | `false`                               | Enable moderators to pin comments.                     |
| `maxDepth`          | `number`                   | `3`                                   | Maximum indent depth before flattening nested replies. |
| `maxLength`         | `number \| null`           | `null`                                | Character count limit for comment form.                |
| `editWindowMinutes` | `number \| null`           | `null`                                | Time window in minutes where owners can edit comments. |
| `locale`            | `'id' \| 'en'`             | `'id'`                                | Built-in UI locale.                                    |
| `messages`          | `Partial<CommentMessages>` | `undefined`                           | Custom dictionary overrides.                           |

---

### `<CommentModerationTable>`

Full-featured moderation dashboard for staff and administrators.

```vue
<script setup lang="ts">
import { CommentModerationTable } from "vue-supabase-comments";
import { commentsAdapter } from "@/utils/commentsAdapter";

function resolveTargetUrl(comment: { target_id: string; target_type: string }) {
  if (comment.target_type === "article")
    return `/articles/${comment.target_id}`;
  return `/items/${comment.target_id}`;
}
</script>

<template>
  <CommentModerationTable
    :adapter="commentsAdapter"
    :target-url-resolver="resolveTargetUrl"
    :locale="'id'"
  />
</template>
```

---

## Composable: `useCommentTree`

For headless UI implementations or custom layouts, `useCommentTree` provides all reactive state and tree manipulation:

```ts
import { useCommentTree } from "vue-supabase-comments";

const tree = useCommentTree(adapter, {
  target: () => ({ targetId: "article-123", targetType: "article" }),
  viewer: () => ({ userId: currentUser.value?.id ?? null, isAnonymous: false }),
  pageSize: 15,
  defaultSortOrder: "oldest",
});

await tree.load();
```

---

## Internationalization (i18n)

The module ships with full Indonesian (`id`) and English (`en`) dictionary presets. You can override specific keys or provide an entire custom dictionary:

```ts
import { resolveCommentMessages, id } from "vue-supabase-comments";

const customMessages = resolveCommentMessages("id", {
  form: {
    placeholder: "Tuliskan tanggapan Anda...",
    submit: "Kirim Tanggapan",
  },
});
```

Pass `customMessages` to the `:messages` prop on `<CommentSection>` or `<CommentModerationTable>`.

---

## License

[MIT](LICENSE) © 2026
