import { defineComponent, type PropType, type Slot } from "vue";

/**
 * Renders a slot function with the given props. CommentSection hands its
 * slots down through context, so nested nodes render them with this.
 */
export default defineComponent({
  name: "CommentSlotOutlet",
  props: {
    render: { type: Function as PropType<Slot>, required: true },
    slotProps: {
      type: Object as PropType<Record<string, unknown>>,
      default: () => ({}),
    },
  },
  setup(props) {
    return () => props.render(props.slotProps);
  },
});
