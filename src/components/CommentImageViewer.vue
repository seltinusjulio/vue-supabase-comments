<template>
  <CommentDialog
    :id="id"
    :open="open"
    variant="image"
    :label="alt"
    @close="emit('close')"
  >
    <button
      :id="`${id}-close-button`"
      type="button"
      class="cmt-focus absolute top-4 right-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
      :aria-label="closeLabel"
      :title="closeLabel"
      @click="emit('close')"
    >
      <CommentIcon name="close" class="h-6 w-6" />
    </button>
    <img
      :id="`${id}-image`"
      :src="src"
      :alt="alt"
      class="max-h-[90vh] max-w-full rounded-lg object-contain"
    />
  </CommentDialog>
</template>

<script setup lang="ts">
import CommentDialog from "./CommentDialog.vue";
import CommentIcon from "./CommentIcon.vue";

defineProps<{
  id: string;
  open: boolean;
  src: string;
  alt: string;
  closeLabel: string;
}>();

const emit = defineEmits<{ (e: "close"): void }>();
</script>
