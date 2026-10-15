<template>
  <span
    v-if="initials"
    :class="`cmt-avatar-${colorIndex}`"
    class="flex h-full w-full items-center justify-center text-xs font-semibold select-none"
    aria-hidden="true"
    >{{ initials }}</span
  >
  <svg
    v-else
    class="h-5 w-5 text-(--comment-text-muted)"
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      fill-rule="evenodd"
      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
      clip-rule="evenodd"
    />
  </svg>
</template>

<script setup lang="ts">
/**
 * Avatar for a commenter without a picture: colored initials when a name is
 * known, otherwise a neutral silhouette. Fills its circular parent.
 */
import { computed } from "vue";

import { getAvatarColorIndex, getInitials } from "../utils/avatar";

/** Number of .cmt-avatar-N color classes in comments.css. */
const PALETTE_SIZE = 6;

const props = defineProps<{
  name?: string | null;
}>();

const initials = computed(() => getInitials(props.name));
const colorIndex = computed(() =>
  getAvatarColorIndex(props.name, PALETTE_SIZE),
);
</script>
