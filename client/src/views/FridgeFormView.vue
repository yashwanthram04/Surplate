<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import AddressSearch from '../components/AddressSearch.vue';
import FridgeMap from '../components/FridgeMap.vue';
import { MAX_PHOTO_BYTES } from '../constants';
import { useFormErrors } from '../composables/useFormErrors';
import { useSession } from '../stores/session';
import { KIND_LABELS } from '../utils/fridge';

// One form for both "Add a fridge or pantry" (no id) and "Edit" (id from the route).
// Any logged-in user can add one; only its creator (or an admin) can edit it.
const props = defineProps({ id: { type: String, default: '' } });
const router = useRouter();
const session = useSession();
const editing = computed(() => !!props.id);

const form = reactive({ name: '', kind: 'fridge', description: '', openingHours: '', address: '', postal: '', lat: null, lng: null });
const pickedAddress = ref('');
const photoFile = ref(null);
const photoPreview = ref('');
const existingPhoto = ref('');
const photoProblem = ref('');

const loading = ref(editing.value);
const loadError = ref('');
const notAllowed = ref(false);
const submitting = ref(false);
const formError = ref('');

// ---- loading an existing fridge ------------------------------------------------------------
async function loadExisting() {
  try {
    const { data } = await api.get(`/fridges/${props.id}`);
    Object.assign(form, { name: data.name, kind: data.kind, description: data.description, openingHours: data.openingHours, address: data.address, postal: data.postal, lat: data.lat, lng: data.lng });
    pickedAddress.value = data.address;
    existingPhoto.value = data.photoUrl || '';
    notAllowed.value = !(session.isAdmin || data.createdBy.id === session.user?.id);
  } catch (err) {
    loadError.value = err.response?.status === 404 ? 'This fridge no longer exists.' : errorMessage(err);
  } finally {
    loading.value = false;
  }
}
if (editing.value) loadExisting();

// ---- validation (mirrors server/src/utils/validateFridge.js; the server stays the authority) ---
const clientErrors = computed(() => {
  const e = {};
  const name = form.name.trim();
  if (name.length < 2 || name.length > 80) e.name = 'Name must be 2–80 characters.';
  if (form.description.length > 500) e.description = 'Description can be at most 500 characters.';
  const hours = form.openingHours.trim();
  if (hours.length < 2 || hours.length > 200) e.openingHours = 'Enter the opening hours, e.g. "24 hours" or "Mon–Sat 8am–9pm".';
  if (form.lat == null || form.lng == null) e.address = 'Choose an address from the search results.';
  if (photoProblem.value) e.photo = photoProblem.value;
  return e;
});
const { submitted, err, cls, setServer } = useFormErrors(form, clientErrors);
const serverPhoto = ref(''); // a photo error sent back by the server (the shared helper doesn't cover the file input)
const photoError = computed(() => photoProblem.value || serverPhoto.value);

// ---- address (OneMap) ----------------------------------------------------------------------
function onAddress(r) {
  pickedAddress.value = r.address;
  Object.assign(form, { address: r.address, postal: r.postal, lat: r.lat, lng: r.lng });
}
// Typing after picking an address invalidates the chosen coordinates.
watch(() => form.address, (v) => {
  if (v !== pickedAddress.value) Object.assign(form, { lat: null, lng: null });
});
const previewFridges = computed(() => (form.lat != null ? [{ id: 'preview', name: form.name || form.address, lat: form.lat, lng: form.lng, latestStatus: 'unknown' }] : []));

// ---- photo (optional) ----------------------------------------------------------------------
function onPhoto(e) {
  const file = e.target.files?.[0];
  photoProblem.value = '';
  serverPhoto.value = '';
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = '';
  photoFile.value = null;
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) photoProblem.value = 'Photo must be a JPEG, PNG or WebP image.';
  else if (file.size > MAX_PHOTO_BYTES) photoProblem.value = 'Photo must be 2 MB or smaller.';
  else {
    photoFile.value = file;
    photoPreview.value = URL.createObjectURL(file);
  }
}
onBeforeUnmount(() => photoPreview.value && URL.revokeObjectURL(photoPreview.value));

// ---- submit --------------------------------------------------------------------------------
async function submit() {
  submitted.value = true;
  formError.value = '';
  if (Object.keys(clientErrors.value).length) return focusFirstError();

  const fd = new FormData();
  for (const k of ['name', 'kind', 'openingHours', 'address', 'postal', 'lat', 'lng']) fd.append(k, form[k]);
  fd.append('description', form.description.trim());
  if (photoFile.value) fd.append('photo', photoFile.value);

  submitting.value = true;
  try {
    const { data } = editing.value ? await api.put(`/fridges/${props.id}`, fd) : await api.post('/fridges', fd);
    router.push({ name: 'fridge', params: { id: data.id }, query: editing.value ? { updated: 1 } : { added: 1 } });
  } catch (e) {
    const fields = fieldErrors(e);
    if (Object.keys(fields).length) {
      const { photo, ...rest } = fields;
      setServer(rest);
      if (photo) serverPhoto.value = photo;
      formError.value = 'Some details need fixing. See the highlighted fields.';
      focusFirstError();
    } else {
      formError.value = errorMessage(e);
    }
  } finally {
    submitting.value = false;
  }
}
function focusFirstError() {
  setTimeout(() => {
    const el = document.querySelector('.is-invalid, [aria-invalid="true"]');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus?.({ preventScroll: true });
  }, 0);
}
</script>

<template>
  <div class="mx-auto" style="max-width: 1100px">
    <RouterLink :to="editing ? { name: 'fridge', params: { id } } : { name: 'fridges' }" class="text-decoration-none small"><i class="bi bi-arrow-left" aria-hidden="true"></i> Back</RouterLink>
    <h1 class="h3 mt-2">{{ editing ? 'Edit fridge or pantry' : 'Add a fridge or pantry' }}</h1>
    <p v-if="!editing" class="text-body-secondary">Know a community fridge or pantry where anyone can take or leave food? Add it so others can find it.</p>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>
    <div v-else-if="loadError" class="alert alert-warning" role="alert">{{ loadError }} <RouterLink :to="{ name: 'fridges' }" class="alert-link">Back to the map</RouterLink></div>
    <div v-else-if="notAllowed" class="alert alert-warning" role="alert">Only the person who added this fridge, or an admin, can edit it.</div>

    <form v-else class="row g-4" novalidate data-testid="fridge-form" @submit.prevent="submit">
      <div v-if="formError" class="col-12"><div class="alert alert-danger mb-0" role="alert" data-testid="form-error">{{ formError }}</div></div>

      <div class="col-12 col-lg-7">
        <div class="bg-white border rounded-4 p-3 p-md-4">
          <div class="mb-3">
            <label for="name" class="form-label fw-semibold">Name</label>
            <input id="name" v-model="form.name" class="form-control" :class="cls('name')" maxlength="80" placeholder="e.g. Tiong Bahru Community Fridge" :aria-invalid="!!err('name')" aria-describedby="name-err" />
            <div id="name-err" class="invalid-feedback">{{ err('name') }}</div>
          </div>

          <fieldset class="mb-3">
            <legend class="form-label fw-semibold fs-6">Type</legend>
            <div class="d-flex flex-wrap gap-1">
              <template v-for="(label, k) in KIND_LABELS" :key="k">
                <input :id="`kind-${k}`" v-model="form.kind" class="btn-check chip-check" type="radio" name="kind" :value="k" />
                <label class="btn btn-outline-secondary chip" :for="`kind-${k}`">{{ label }}</label>
              </template>
            </div>
          </fieldset>

          <div class="mb-3">
            <label for="openingHours" class="form-label fw-semibold">Opening hours</label>
            <input id="openingHours" v-model="form.openingHours" class="form-control" :class="cls('openingHours')" maxlength="200" placeholder='e.g. 24 hours, or Mon–Sat 8am–9pm' :aria-invalid="!!err('openingHours')" aria-describedby="hours-err" />
            <div id="hours-err" class="invalid-feedback">{{ err('openingHours') }}</div>
            <button type="button" class="btn btn-sm btn-outline-secondary py-0 mt-1" @click="form.openingHours = '24 hours'">24 hours</button>
          </div>

          <div class="mb-0">
            <label for="description" class="form-label fw-semibold">Notes <span class="text-body-secondary fw-normal">(optional)</span></label>
            <textarea id="description" v-model="form.description" class="form-control" :class="cls('description')" rows="3" placeholder="Where exactly is it? Any rules? Who looks after it?" :aria-invalid="!!err('description')" aria-describedby="description-err"></textarea>
            <div class="d-flex justify-content-between">
              <div id="description-err" class="invalid-feedback d-block">{{ err('description') }}</div>
              <div class="form-text ms-auto">{{ form.description.length }}/500</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-5">
        <div class="bg-white border rounded-4 p-3 p-md-4 mb-4">
          <label for="address" class="form-label fw-semibold">Address</label>
          <AddressSearch id="address" v-model="form.address" placeholder="Search an address or postal code" :invalid="!!err('address')" @select="onAddress" />
          <div v-if="err('address')" class="text-danger small mt-1" role="alert" data-testid="address-error">{{ err('address') }}</div>
          <div class="form-text">Looked up with OneMap, so people can find it on the map.</div>
          <div v-if="previewFridges.length" class="mt-3" style="height: 220px"><FridgeMap :fridges="previewFridges" :linkable="false" /></div>
        </div>

        <div class="bg-white border rounded-4 p-3 p-md-4">
          <label for="photo" class="form-label fw-semibold">Photo <span class="text-body-secondary fw-normal">(optional)</span></label>
          <img v-if="photoPreview" :src="photoPreview" class="photo-preview d-block mb-2" alt="Preview of the chosen photo" />
          <img v-else-if="existingPhoto" :src="existingPhoto" class="photo-preview d-block mb-2" alt="Current photo" />
          <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" class="form-control" :class="{ 'is-invalid': !!photoError }" :aria-invalid="!!photoError" aria-describedby="photo-err" @change="onPhoto" />
          <div id="photo-err" class="invalid-feedback">{{ photoError }}</div>
          <div class="form-text">JPEG, PNG or WebP, up to 2 MB.<template v-if="editing"> Leave empty to keep the current photo.</template></div>
        </div>
      </div>

      <div class="col-12 d-flex gap-2 justify-content-end">
        <RouterLink :to="editing ? { name: 'fridge', params: { id } } : { name: 'fridges' }" class="btn btn-outline-secondary">Cancel</RouterLink>
        <button type="submit" class="btn btn-primary px-4" :disabled="submitting" data-testid="submit-fridge">
          <span v-if="submitting" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>{{ editing ? 'Save changes' : 'Add to the map' }}
        </button>
      </div>
    </form>
  </div>
</template>
