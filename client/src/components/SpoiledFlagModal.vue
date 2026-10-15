<script setup>
import { computed, reactive, ref } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import { MAX_PHOTO_BYTES } from '../constants';
import { timeAgo } from '../utils/fridge';
import ConfirmModal from './ConfirmModal.vue';

// "Flag spoiled food": tells the supplier(s) who dropped it off. Built on ConfirmModal.
// `update` is optional: pass the drop-off being flagged to notify just that supplier.
// Emits `done` with { suppliersNotified } after the server accepts the report.
const props = defineProps({
  fridgeId: { type: String, required: true },
  fridgeName: { type: String, required: true },
  update: { type: Object, default: null },
});
const emit = defineEmits(['done', 'cancel']);

const form = reactive({ items: '', note: '' });
const photoFile = ref(null);
const photoProblem = ref('');
const errors = reactive({});
const formError = ref('');
const busy = ref(false);

// Say up front who will be told, so nobody is surprised.
const audience = computed(() => {
  if (!props.update) return 'Bakeries that posted an update here in the last 3 days will be told. If there are none, the Surplate admins will see your report.';
  if (props.update.author.role === 'bakery') return `${props.update.author.name}, who posted this drop-off ${timeAgo(props.update.createdAt)}, will be told.`;
  return `${props.update.author.name} is not a bakery, so the Surplate admins will see your report instead.`;
});

function onPhoto(e) {
  const file = e.target.files?.[0];
  photoProblem.value = '';
  photoFile.value = null;
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) photoProblem.value = 'Photo must be a JPEG, PNG or WebP image.';
  else if (file.size > MAX_PHOTO_BYTES) photoProblem.value = 'Photo must be 2 MB or smaller.';
  else photoFile.value = file;
}

async function submit() {
  formError.value = '';
  Object.keys(errors).forEach((k) => delete errors[k]);
  const items = form.items.trim();
  if (items.length < 2 || items.length > 200) errors.items = 'Say what is spoiled (2–200 characters).';
  if (form.note.length > 300) errors.note = 'Note can be at most 300 characters.';
  if (photoProblem.value) errors.photo = photoProblem.value;
  if (Object.keys(errors).length) return;

  const fd = new FormData();
  fd.append('items', items);
  fd.append('note', form.note.trim());
  if (props.update) fd.append('updateId', props.update.id);
  if (photoFile.value) fd.append('photo', photoFile.value);

  busy.value = true;
  try {
    const { data } = await api.post(`/fridges/${props.fridgeId}/spoiled`, fd);
    emit('done', data);
  } catch (e) {
    Object.assign(errors, fieldErrors(e));
    if (!Object.keys(fieldErrors(e)).length) formError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <ConfirmModal :title="`Flag spoiled food at ${fridgeName}`" confirm-text="Send report" danger :busy="busy" :error="formError" @confirm="submit" @cancel="emit('cancel')">
    <p class="small text-body-secondary" data-testid="flag-audience">{{ audience }}</p>

    <div class="mb-3">
      <label for="spoiled-items" class="form-label fw-semibold">What is spoiled?</label>
      <input id="spoiled-items" v-model="form.items" class="form-control" :class="{ 'is-invalid': errors.items }" maxlength="200" placeholder="e.g. Sourdough loaves" />
      <div class="invalid-feedback">{{ errors.items }}</div>
    </div>
    <div class="mb-3">
      <label for="spoiled-note" class="form-label fw-semibold">Details <span class="text-body-secondary fw-normal">(optional)</span></label>
      <textarea id="spoiled-note" v-model="form.note" class="form-control" :class="{ 'is-invalid': errors.note }" rows="2" maxlength="300" placeholder="Mould, bad smell, past its date…"></textarea>
      <div class="invalid-feedback">{{ errors.note }}</div>
    </div>
    <div>
      <label for="spoiled-photo" class="form-label fw-semibold">Photo <span class="text-body-secondary fw-normal">(optional)</span></label>
      <input id="spoiled-photo" type="file" accept="image/jpeg,image/png,image/webp" class="form-control" :class="{ 'is-invalid': errors.photo }" @change="onPhoto" />
      <div class="invalid-feedback">{{ errors.photo }}</div>
    </div>
  </ConfirmModal>
</template>
