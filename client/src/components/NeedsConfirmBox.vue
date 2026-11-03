<script setup>
// A small "Are you sure?" box that we draw ourselves,
// so the browser's "localhost:5173 says..." popup is not needed.
// It only DRAWS the box. The parent decides what "yes" and "no" do.
defineProps({
  show: { type: Boolean, default: false }, // true = the box is visible
  title: { type: String, required: true },
  message: { type: String, default: '' },
  yesText: { type: String, default: 'Yes' },
  noText: { type: String, default: 'No' },
});

const emit = defineEmits(['yes', 'no']);
</script>

<template>
  <div
    v-if="show"
    class="modal d-block"
    style="background: rgba(0, 0, 0, 0.5)"
    role="dialog"
    aria-modal="true"
  >
    <div class="confirm-dialog modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-body">
          <h2 class="h5">{{ title }}</h2>
          <p class="mb-0">{{ message }}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" @click="emit('no')">
            {{ noText }}
          </button>
          <button type="button" class="btn btn-danger" @click="emit('yes')">
            {{ yesText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The box pops in: starts small and see-through, grows to normal size */
.confirm-dialog {
  animation: pop-in 0.3s ease-out;
}

@keyframes pop-in {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .confirm-dialog { animation: none; }
}
</style>