<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue';

defineProps({
  title: { type: String, required: true },
  confirmText: { type: String, default: 'Confirm' },
  danger: Boolean,
  busy: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['confirm', 'cancel']);

const cancelBtn = ref(null);
const onKey = (e) => e.key === 'Escape' && emit('cancel');
onMounted(async () => {
  document.addEventListener('keydown', onKey);
  await nextTick();
  cancelBtn.value?.focus();
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="modal-backdrop-sp" @mousedown.self="emit('cancel')">
    <div class="modal-card p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h2 id="confirm-title" class="h5">{{ title }}</h2>
      <div class="mb-3"><slot /></div>
      <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
      <div class="d-flex justify-content-end gap-2">
        <button ref="cancelBtn" type="button" class="btn btn-outline-secondary" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" :disabled="busy" @click="emit('confirm')">
          <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>{{ confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
