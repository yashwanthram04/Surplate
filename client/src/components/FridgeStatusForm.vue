<script setup>
import { reactive, ref } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import { MAX_PHOTO_BYTES } from '../constants';
import { FRIDGE_STATUSES, statusMeta } from '../utils/fridge';
import '../fridges.css';

// "Post a status update": stocked / low / empty, with an optional note and photo.
// Emits `posted` with the new update as returned by POST /api/fridges/:id/updates.
const props = defineProps({ fridgeId: { type: String, required: true } });
const emit = defineEmits(['posted']);

const form = reactive({ status: '', note: '' });
const photoFile = ref(null);
const photoProblem = ref('');
const photoInput = ref(null);
const errors = reactive({});
const formError = ref('');
const submitting = ref(false);

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
  if (!form.status) errors.status = 'Choose stocked, low or empty.';
  if (form.note.length > 300) errors.note = 'Note can be at most 300 characters.';
  if (photoProblem.value) errors.photo = photoProblem.value;
  if (Object.keys(errors).length) return;

  const fd = new FormData();
  fd.append('status', form.status);
  fd.append('note', form.note.trim());
  if (photoFile.value) fd.append('photo', photoFile.value);

  submitting.value = true;
  try {
    const { data } = await api.post(`/fridges/${props.fridgeId}/updates`, fd);
    Object.assign(form, { status: '', note: '' });
    photoFile.value = null;
    if (photoInput.value) photoInput.value.value = '';
    emit('posted', data);
  } catch (e) {
    Object.assign(errors, Object.fromEntries(Object.entries(fieldErrors(e))));
    if (!Object.keys(fieldErrors(e)).length) formError.value = errorMessage(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form novalidate data-testid="status-form" @submit.prevent="submit">
    <div v-if="formError" class="alert alert-danger py-2" role="alert">{{ formError }}</div>

    <fieldset class="mb-3">
      <legend class="form-label fw-semibold fs-6">How does it look right now?</legend>
      <div class="row g-2">
        <div v-for="s in FRIDGE_STATUSES" :key="s" class="col-4">
          <input :id="`status-${s}`" v-model="form.status" type="radio" name="fridge-status" class="btn-check" :value="s" />
          <label class="btn btn-outline-secondary status-choice w-100" :class="`status-${s}`" :for="`status-${s}`">
            <i class="bi d-block fs-5" :class="statusMeta(s).icon" aria-hidden="true"></i>{{ statusMeta(s).label }}
          </label>
        </div>
      </div>
      <div v-if="errors.status" class="text-danger small mt-1" role="alert">{{ errors.status }}</div>
    </fieldset>

    <div class="mb-3">
      <label for="update-note" class="form-label fw-semibold">What was dropped off? <span class="text-body-secondary fw-normal">(optional)</span></label>
      <textarea id="update-note" v-model="form.note" class="form-control" :class="{ 'is-invalid': errors.note }" rows="2" maxlength="300" placeholder="e.g. 12 croissants and a tray of egg tarts"></textarea>
      <div class="d-flex justify-content-between">
        <div class="invalid-feedback d-block">{{ errors.note }}</div>
        <div class="form-text ms-auto">{{ form.note.length }}/300</div>
      </div>
    </div>

    <div class="mb-3">
      <label for="update-photo" class="form-label fw-semibold">Photo <span class="text-body-secondary fw-normal">(optional)</span></label>
      <input id="update-photo" ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="form-control" :class="{ 'is-invalid': errors.photo }" @change="onPhoto" />
      <div class="invalid-feedback">{{ errors.photo }}</div>
      <div class="form-text">JPEG, PNG or WebP, up to 2 MB.</div>
    </div>

    <button type="submit" class="btn btn-primary w-100" :disabled="submitting" data-testid="submit-update">
      <span v-if="submitting" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Post update
    </button>
  </form>
</template>
