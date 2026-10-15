<template>
  <!-- Native modal dialog: rendered in the top layer (no teleport needed),
       traps focus, closes on Escape and returns focus to the opener. The click
       handler only detects backdrop clicks; Escape is the keyboard path. -->
  <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
  <dialog
    ref="dialogRef"
    :class="variant === 'image' ? 'cmt-viewer' : 'cmt-dialog'"
    :aria-labelledby="labelledby"
    :aria-label="label"
    @cancel.prevent="close"
    @click="onBackdropClick"
  >
    <slot />
  </dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    variant?: "confirm" | "image";
    labelledby?: string;
    label?: string;
  }>(),
  { variant: "confirm", labelledby: undefined, label: undefined },
);

const emit = defineEmits<{ (e: "close"): void }>();

const dialogRef = ref<HTMLDialogElement | null>(null);

const sync = (open: boolean) => {
  const dialog = dialogRef.value;
  if (!dialog) return;
  if (open && !dialog.open) dialog.showModal();
  else if (!open && dialog.open) dialog.close();
};

const close = () => emit("close");

// A click on the dialog element itself (not its content) is a backdrop click.
const onBackdropClick = (event: MouseEvent) => {
  if (event.target === dialogRef.value) close();
};

onMounted(() => sync(props.open));
watch(() => props.open, sync);
onBeforeUnmount(() => sync(false));
</script>
