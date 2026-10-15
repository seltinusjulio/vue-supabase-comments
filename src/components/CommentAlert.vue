<template>
  <div
    :role="type === 'error' ? 'alert' : 'status'"
    class="cmt-alert"
    :class="`cmt-alert--${type}`"
  >
    <CommentIcon name="alert" class="h-5 w-5 shrink-0" />
    <div><slot /></div>
  </div>
</template>

<script setup lang="ts">
import CommentIcon from "./CommentIcon.vue";

defineProps<{ type: "error" | "warning" }>();
</script>
