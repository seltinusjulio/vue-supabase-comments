<template>
  <div
    v-if="needsSignIn"
    :id="fid('comment-form-auth-prompt')"
    class="rounded-lg border border-(--comment-border) p-3"
  >
    <SlotOutlet
      v-if="ctx.slots['auth-prompt']"
      :render="ctx.slots['auth-prompt']"
      :slot-props="{ parentCommentId: parentCommentId ?? null }"
    />
    <p v-else class="text-sm text-(--comment-text-muted)">
      {{ msg.errors.signInRequired }}
    </p>
  </div>
  <div
    v-else
    :id="fid('comment-form-container')"
    class="rounded-lg border border-(--comment-border) p-3"
  >
    <h3 v-if="!parentCommentId" :id="fid('comment-form-title')" class="sr-only">
      {{ msg.form.title }}
    </h3>
    <p
      v-else-if="replyToName"
      :id="fid('comment-form-reply-to')"
      class="mb-2 text-sm text-(--comment-text-muted)"
    >
      {{ msg.form.replyingTo }}
      <span class="font-semibold text-(--comment-text)">{{ replyToName }}</span>
    </p>
    <form
      :id="fid('comment-form')"
      class="space-y-3"
      @submit.prevent="handleSubmit"
    >
      <div :id="fid('comment-form-content-container')">
        <label
          :id="fid('comment-form-content-label')"
          :for="fid('comment-content')"
          class="block"
        >
          <span class="sr-only">{{ msg.form.commentLabel }}</span>
          <textarea
            :id="fid('comment-content')"
            ref="contentRef"
            v-model="content"
            :rows="isExpanded ? 3 : 2"
            :placeholder="
              parentCommentId
                ? msg.form.replyPlaceholder
                : msg.form.commentPlaceholder
            "
            :maxlength="features.maxLength ?? undefined"
            :aria-describedby="
              features.maxLength ? fid('comment-form-char-count') : undefined
            "
            class="cmt-input"
            required
            @focus="expanded = true"
          ></textarea>
        </label>
        <p
          v-if="features.maxLength && isExpanded"
          :id="fid('comment-form-char-count')"
          class="mt-1 text-right text-xs text-(--comment-text-muted)"
          aria-live="polite"
        >
          {{ msg.form.charactersLeft(features.maxLength - content.length) }}
        </p>
      </div>

      <template v-if="isExpanded">
        <div
          v-if="isGuest"
          :id="fid('comment-form-guest-fields')"
          class="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <div :id="fid('comment-form-guest-name-container')">
            <label
              :id="fid('comment-form-guest-name-label')"
              :for="fid('guest-name')"
              class="block text-sm font-medium text-(--comment-text)"
            >
              {{ msg.form.name }}
              <input
                :id="fid('guest-name')"
                v-model="guestName"
                type="text"
                class="cmt-input mt-1"
                required
              />
            </label>
          </div>
          <div :id="fid('comment-form-guest-email-container')">
            <label
              :id="fid('comment-form-guest-email-label')"
              :for="fid('guest-email')"
              class="block text-sm font-medium text-(--comment-text)"
            >
              {{ msg.form.email }}
              <input
                :id="fid('guest-email')"
                v-model="guestEmail"
                type="email"
                class="cmt-input mt-1"
                :aria-describedby="fid('comment-form-guest-email-hint')"
                required
              />
            </label>
            <p
              :id="fid('comment-form-guest-email-hint')"
              class="mt-1 text-xs text-(--comment-text-muted)"
            >
              {{ msg.form.emailHint }}
            </p>
          </div>
        </div>

        <!-- Attachment pickers (signed-in, non-guest users only) -->
        <div
          v-if="canAttach"
          :id="fid('comment-form-attachments-container')"
          class="space-y-2"
        >
          <div
            :id="fid('comment-form-attachment-buttons')"
            class="flex flex-wrap gap-3"
          >
            <label
              :id="fid('comment-image-input-label')"
              :for="fid('comment-image-input')"
              class="inline-flex cursor-pointer items-center gap-1.5 text-sm text-(--comment-text-muted) hover:text-(--comment-primary)"
            >
              <CommentIcon name="camera" class="h-4 w-4 shrink-0" />
              <span>{{ msg.form.addPhoto }}</span>
              <input
                :id="fid('comment-image-input')"
                ref="imageInputRef"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                class="hidden"
                @change="onImagePick"
              />
            </label>
            <label
              :id="fid('comment-file-input-label')"
              :for="fid('comment-file-input')"
              class="inline-flex cursor-pointer items-center gap-1.5 text-sm text-(--comment-text-muted) hover:text-(--comment-primary)"
            >
              <CommentIcon name="paperclip" class="h-4 w-4 shrink-0" />
              <span>{{ msg.form.attachFile }}</span>
              <input
                :id="fid('comment-file-input')"
                ref="fileInputRef"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                class="hidden"
                @change="onFilePick"
              />
            </label>
          </div>

          <div
            v-if="selectedImage"
            :id="fid('comment-form-image-preview')"
            class="relative inline-block"
          >
            <img
              :id="fid('comment-form-image-preview-img')"
              :src="imagePreviewUrl"
              :alt="msg.form.previewAlt"
              class="max-h-40 rounded-lg object-cover"
            />
            <button
              :id="fid('comment-form-remove-image-button')"
              type="button"
              :aria-label="msg.form.removeImage"
              class="cmt-focus absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
              @click="removeImage"
            >
              ×
            </button>
          </div>

          <div
            v-if="selectedFile"
            :id="fid('comment-form-file-preview')"
            class="flex items-center gap-2 text-sm"
          >
            <span
              :id="fid('comment-form-file-name')"
              class="inline-flex items-center gap-1.5 text-(--comment-text-muted)"
            >
              <CommentIcon name="paperclip" class="h-4 w-4 shrink-0" />
              <span>{{ selectedFile.name }}</span>
            </span>
            <button
              :id="fid('comment-form-remove-file-button')"
              type="button"
              class="cmt-focus rounded-sm text-(--comment-danger-strong) hover:underline"
              @click="removeFile"
            >
              {{ msg.common.delete }}
            </button>
          </div>
        </div>
      </template>

      <CommentAlert
        v-if="submitError"
        :id="fid('comment-form-submit-error')"
        type="error"
      >
        {{ submitError }}
      </CommentAlert>

      <CommentAlert
        v-if="showModerationMessage"
        :id="fid('comment-form-moderation-alert')"
        type="warning"
      >
        {{ msg.form.sentForModeration }}
      </CommentAlert>

      <div
        v-if="isExpanded"
        :id="fid('comment-form-actions-container')"
        class="flex items-center justify-end"
      >
        <div
          :id="fid('comment-form-buttons-group')"
          class="flex items-center gap-2"
        >
          <button
            v-if="parentCommentId"
            :id="fid('comment-form-cancel-button')"
            type="button"
            class="cmt-btn cmt-btn--secondary"
            @click="emit('cancel')"
          >
            {{ msg.common.cancel }}
          </button>
          <button
            :id="
              fid(
                parentCommentId
                  ? 'comment-form-reply-button'
                  : 'comment-form-submit-button',
              )
            "
            type="submit"
            class="cmt-btn cmt-btn--primary"
            :disabled="
              isSubmitting ||
              !content.trim() ||
              (isGuest && (!guestName.trim() || !guestEmail.trim()))
            "
          >
            {{
              isSubmitting
                ? msg.form.submitting
                : parentCommentId
                  ? msg.common.reply
                  : msg.form.submit
            }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import CommentAlert from "./CommentAlert.vue";
import CommentIcon from "./CommentIcon.vue";
import { useCommentSectionContext } from "./context";
import SlotOutlet from "./SlotOutlet";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const props = defineProps<{
  parentCommentId?: string;
  /** Author being replied to, shown above a reply form. */
  replyToName?: string;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "success"): void;
}>();

const ctx = useCommentSectionContext();
const msg = computed(() => ctx.messages.value);
const features = computed(() => ctx.features.value);
const viewer = computed(() => ctx.tree.viewer.value);

const isGuest = computed(() => !!viewer.value?.isAnonymous);
// Without a session nobody can post; with guests disallowed, a guest session
// is not enough either. The host's #auth-prompt slot offers to sign in.
const needsSignIn = computed(
  () => !viewer.value?.userId || (isGuest.value && !features.value.allowGuests),
);
const canAttach = computed(() => features.value.attachments && !isGuest.value);

// Reply forms render many times per page, so their ids must be unique per
// parent comment (labels would otherwise target the first textarea).
const fid = (base: string) =>
  props.parentCommentId ? `${base}-${props.parentCommentId}` : base;

// A reply form picks up what was typed before another reply form replaced it.
const savedDraft = props.parentCommentId
  ? ctx.replyDrafts.get(props.parentCommentId)
  : undefined;

const content = ref(savedDraft?.content ?? "");
const guestName = ref(savedDraft?.guestName ?? "");
const guestEmail = ref(savedDraft?.guestEmail ?? "");
const showModerationMessage = ref(false);
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

const imageInputRef = ref<HTMLInputElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedImage = ref<File | null>(savedDraft?.image ?? null);
const selectedFile = ref<File | null>(savedDraft?.file ?? null);
const imagePreviewUrl = ref(
  savedDraft?.image ? URL.createObjectURL(savedDraft.image) : "",
);

const contentRef = ref<HTMLTextAreaElement | null>(null);
// The top-level form starts as a compact box and expands on first focus.
// Reply forms are always expanded.
const expanded = ref(false);
const hasDraft = computed(
  () =>
    !!content.value ||
    !!guestName.value ||
    !!guestEmail.value ||
    !!selectedImage.value ||
    !!selectedFile.value,
);
const isExpanded = computed(
  () => !!props.parentCommentId || expanded.value || hasDraft.value,
);

onMounted(() => {
  if (props.parentCommentId) contentRef.value?.focus();
});

// Mirrors a reply draft into the section while the form is open; the
// top-level form keeps its own state and is never closed by another form.
watch([content, guestName, guestEmail, selectedImage, selectedFile], () => {
  const id = props.parentCommentId;
  if (!id) return;
  if (!hasDraft.value) {
    ctx.replyDrafts.delete(id);
    return;
  }
  ctx.replyDrafts.set(id, {
    content: content.value,
    guestName: guestName.value,
    guestEmail: guestEmail.value,
    image: selectedImage.value,
    file: selectedFile.value,
  });
});

// A new draft supersedes the previous "sent for moderation" notice.
watch(content, (value) => {
  if (value) showModerationMessage.value = false;
});

const removeImage = () => {
  selectedImage.value = null;
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  imagePreviewUrl.value = "";
  if (imageInputRef.value) imageInputRef.value.value = "";
};

const removeFile = () => {
  selectedFile.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
};

const onImagePick = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > MAX_IMAGE_BYTES) {
    submitError.value = msg.value.form.photoTooLarge;
    removeImage();
    return;
  }
  submitError.value = null;
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
  selectedImage.value = file;
  imagePreviewUrl.value = URL.createObjectURL(file);
};

const onFilePick = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    submitError.value = msg.value.form.fileTooLarge;
    removeFile();
    return;
  }
  submitError.value = null;
  selectedFile.value = file;
};

onUnmounted(() => {
  if (imagePreviewUrl.value) URL.revokeObjectURL(imagePreviewUrl.value);
});

const handleSubmit = async () => {
  isSubmitting.value = true;
  submitError.value = null;
  showModerationMessage.value = false;
  try {
    const submitted = await ctx.tree.submitComment({
      content: content.value,
      parentCommentId: props.parentCommentId ?? null,
      ...(isGuest.value
        ? { guestName: guestName.value, guestEmail: guestEmail.value }
        : {
            imageFile: canAttach.value ? selectedImage.value : null,
            attachmentFile: canAttach.value ? selectedFile.value : null,
          }),
    });
    if (!submitted) {
      submitError.value = ctx.tree.error.value ?? msg.value.form.submitFailed;
      return;
    }
    showModerationMessage.value = isGuest.value;
    content.value = "";
    guestName.value = "";
    guestEmail.value = "";
    removeImage();
    removeFile();
    expanded.value = false;
    // Dropped here rather than by the draft watcher: the form is unmounted in
    // the same tick, which cancels that watcher before it runs.
    if (props.parentCommentId) ctx.replyDrafts.delete(props.parentCommentId);
    emit("success");
  } finally {
    isSubmitting.value = false;
  }
};
</script>
