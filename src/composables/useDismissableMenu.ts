import { onBeforeUnmount, type Ref, ref, watch } from "vue";

/**
 * Open state for a small popup menu that closes on a press outside
 * `container` or on Escape, which also returns focus to the container's first
 * button (the one that opens it). The document listeners only exist while the
 * menu is open.
 */
export function useDismissableMenu(container: Ref<HTMLElement | null>) {
  const isOpen = ref(false);

  const closeOnOutsidePress = (event: Event) => {
    if (!container.value?.contains(event.target as Node)) isOpen.value = false;
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    isOpen.value = false;
    container.value?.querySelector("button")?.focus();
  };
  const removeListeners = () => {
    document.removeEventListener("pointerdown", closeOnOutsidePress);
    document.removeEventListener("keydown", closeOnEscape);
  };

  watch(isOpen, (open) => {
    removeListeners();
    if (!open) return;
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
  });
  onBeforeUnmount(removeListeners);

  return {
    isOpen,
    close: () => {
      isOpen.value = false;
    },
    toggle: () => {
      isOpen.value = !isOpen.value;
    },
  };
}
