<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import AddressSearch from '../components/AddressSearch.vue';
import ListingMap from '../components/ListingMap.vue';
import { ALLERGENS, DIETARY_TAGS, MAX_PHOTO_BYTES } from '../constants';
import { useSession } from '../stores/session';
import { fromLocalInput, minutesFromNow, toLocalInput } from '../utils/time';

// One form for both "Post surplus food" (no id) and "Edit listing" (id from the route).
const props = defineProps({ id: { type: String, default: '' } });
const router = useRouter();
const session = useSession();
const editing = computed(() => !!props.id);

const form = reactive({
  itemName: '',
  description: '',
  quantity: '',
  weightGramsPerUnit: '',
  dietaryTags: [],
  allergens: [],
  visibleToIndividuals: false, // Used only for older listings without a priority timestamp.
  pickupStart: toLocalInput(new Date()),
  pickupEnd: toLocalInput(minutesFromNow(120)),
  bestBefore: toLocalInput(minutesFromNow(360)),
  address: '',
  postal: '',
  lat: null,
  lng: null,
});
const photoFile = ref(null);
const photoPreview = ref('');
const existingPhoto = ref('');
const originalTimes = {};
const photoProblem = ref('');
const pickedAddress = ref('');

const loading = ref(editing.value);
const loadError = ref('');
const notOwner = ref(false);
const submitting = ref(false);
const submitted = ref(false);
const touched = reactive({});
const formError = ref('');
const serverErrors = reactive({}); // field -> { message, at } (hidden again once the field changes)

// ---- loading an existing listing -------------------------------------------------------
async function loadExisting() {
  try {
    const { data } = await api.get(`/listings/${props.id}`);
    if (data.phase === 'ended') {
      loadError.value = 'This pickup window has closed, so it can no longer be edited. Re-post it from My listings instead.';
      return;
    }
    Object.assign(form, {
      itemName: data.itemName,
      description: data.description,
      priorityUntil: data.priorityUntil,
      quantity: data.quantity,
      weightGramsPerUnit: data.weightGramsPerUnit ?? '',
      dietaryTags: [...data.dietaryTags],
      allergens: [...data.allergens],
      visibleToIndividuals: data.visibleToIndividuals,
      pickupStart: toLocalInput(data.pickupStart),
      pickupEnd: toLocalInput(data.pickupEnd),
      bestBefore: toLocalInput(data.bestBefore),
      address: data.address,
      postal: data.postal,
      lat: data.lat,
      lng: data.lng,
    });
    Object.assign(originalTimes, { pickupStart: data.pickupStart, pickupEnd: data.pickupEnd, bestBefore: data.bestBefore });
    pickedAddress.value = data.address;
    existingPhoto.value = data.photoUrl || '';
    notOwner.value = data.bakery.id !== session.user?.id;
  } catch (err) {
    loadError.value = err.response?.status === 404 ? 'This listing no longer exists.' : errorMessage(err);
  } finally {
    loading.value = false;
  }
}
if (editing.value) {
  loadExisting();
} else if (session.user?.lat != null) {
  // New listing: start from the bakery's saved pickup address (they can still change it).
  const u = session.user;
  Object.assign(form, { address: u.address, postal: u.postal, lat: u.lat, lng: u.lng });
  pickedAddress.value = u.address;
}

// ---- validation (mirrors server/src/utils/validate.js; the server stays the authority) ---
const clientErrors = computed(() => {
  const e = {};
  const name = form.itemName.trim();
  if (name.length < 2 || name.length > 80) e.itemName = 'Item name must be 2–80 characters.';
  if (form.description.length > 500) e.description = 'Description can be at most 500 characters.';
  const q = Number(form.quantity);
  if (form.quantity === '' || !Number.isInteger(q) || q < 1 || q > 500) e.quantity = 'Enter a whole number from 1 to 500.';

  const weight = Number(form.weightGramsPerUnit);
  if (!Number.isInteger(weight) || weight < 1 || weight > 100000) e.weightGramsPerUnit = 'Enter a whole weight from 1 to 100000 grams per unit.';

  const start = new Date(form.pickupStart);
  const end = new Date(form.pickupEnd);
  const best = new Date(form.bestBefore);
  if (!form.pickupStart || isNaN(start)) e.pickupStart = 'Pickup start time is required.';
  if (!form.pickupEnd || isNaN(end)) e.pickupEnd = 'Pickup end time is required.';
  else if (!e.pickupStart && end <= start) e.pickupEnd = 'Pickup must end after it starts.';
  else if (end <= new Date()) e.pickupEnd = 'Pickup window must end in the future.';
  else if (!e.pickupStart && end - start > 24 * 3600 * 1000) e.pickupEnd = 'Pickup window can be at most 24 hours.';
  if (!form.bestBefore || isNaN(best)) e.bestBefore = 'Best-before time is required.';
  else if (!e.pickupEnd && best < end) e.bestBefore = 'Best-before must not be earlier than the end of the pickup window.';

  if (form.lat == null || form.lng == null) e.address = 'Choose a pickup address from the search results.';
  if (!editing.value && !photoFile.value) e.photo = 'Add a photo of the food.';
  if (photoProblem.value) e.photo = photoProblem.value;
  return e;
});

const snapshot = (field) => (field === 'photo' ? photoFile.value?.name ?? '' : field === 'address' ? `${form.address}|${form.lat}` : JSON.stringify(form[field]));
/** Error message to show for a field: server message while the field is unchanged, else client rule once touched/submitted. */
function err(field) {
  const s = serverErrors[field];
  if (s && s.at === snapshot(field)) return s.message;
  return submitted.value || touched[field] ? clientErrors.value[field] || '' : '';
}
const touch = (field) => (touched[field] = true);
const cls = (field) => ({ 'is-invalid': !!err(field) });

// ---- address (OneMap) ---------------------------------------------------------------
function onAddress(r) {
  pickedAddress.value = r.address;
  Object.assign(form, { address: r.address, postal: r.postal, lat: r.lat, lng: r.lng });
}
// Typing after picking an address invalidates the chosen coordinates.
watch(() => form.address, (v) => {
  if (v !== pickedAddress.value) Object.assign(form, { lat: null, lng: null });
});
const previewListing = computed(() => (form.lat != null ? [{ id: 'preview', itemName: form.address, lat: form.lat, lng: form.lng }] : []));

// ---- photo ---------------------------------------------------------------------------
function onPhoto(e) {
  const file = e.target.files?.[0];
  touch('photo');
  photoProblem.value = '';
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = '';
  photoFile.value = null;
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) photoProblem.value = 'Photo must be a JPEG, PNG or WebP image.';
  else if (file.size > MAX_PHOTO_BYTES) photoProblem.value = 'Photo must be 2 MB or smaller.';
  photoFile.value = file;
  if (!photoProblem.value) photoPreview.value = URL.createObjectURL(file);
}
onBeforeUnmount(() => photoPreview.value && URL.revokeObjectURL(photoPreview.value));

function toggle(list, value) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  else list.push(value);
}
function setEndAfter(hours) {
  const start = new Date(form.pickupStart);
  const base = isNaN(start) ? new Date() : start;
  form.pickupEnd = toLocalInput(new Date(base.getTime() + hours * 3600 * 1000));
  touch('pickupEnd');
}

// ---- submit ----------------------------------------------------------------------------
async function submit() {
  submitted.value = true;
  formError.value = '';
  if (Object.keys(clientErrors.value).length) return focusFirstError();

  const fd = new FormData();
  fd.append('itemName', form.itemName.trim());
  fd.append('description', form.description.trim());
  fd.append('quantity', form.quantity);
  fd.append('weightGramsPerUnit', form.weightGramsPerUnit);
  form.dietaryTags.forEach((t) => fd.append('dietaryTags', t));
  form.allergens.forEach((a) => fd.append('allergens', a));
  fd.append('visibleToIndividuals', form.visibleToIndividuals);
  // datetime-local displays minutes. Keep the original seconds when the user did not edit a time.
  for (const field of ['pickupStart', 'pickupEnd', 'bestBefore']) {
    fd.append(field, originalTimes[field] && form[field] === toLocalInput(originalTimes[field]) ? originalTimes[field] : fromLocalInput(form[field]));
  }
  fd.append('address', form.address);
  fd.append('postal', form.postal);
  fd.append('lat', form.lat);
  fd.append('lng', form.lng);
  if (photoFile.value) fd.append('photo', photoFile.value);

  submitting.value = true;
  try {
    const { data } = editing.value ? await api.put(`/listings/${props.id}`, fd) : await api.post('/listings', fd);
    router.push({ name: 'listing', params: { id: data.id }, query: editing.value ? { updated: 1 } : { posted: 1 } });
  } catch (e) {
    const fields = fieldErrors(e);
    if (Object.keys(fields).length) {
      for (const [field, message] of Object.entries(fields)) serverErrors[field] = { message, at: snapshot(field) };
      formError.value = 'Some details need fixing. See the highlighted fields.';
      focusFirstError();
    } else {
      formError.value = errorMessage(e);
    }
  } finally {
    submitting.value = false;
  }
}
async function focusFirstError() {
  await nextTick();
  const el = document.querySelector('.is-invalid, [aria-invalid="true"]');
  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el?.focus?.({ preventScroll: true });
}
</script>

<template>
    <div class="mx-auto" style="max-width: 1100px">
      <RouterLink :to="editing ? { name: 'listing', params: { id } } : '/browse'" class="text-decoration-none small"><i class="bi bi-arrow-left" aria-hidden="true"></i> Back</RouterLink>
      <h1 class="h3 mt-2">{{ editing ? 'Edit listing' : 'Post surplus food' }}</h1>

      <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>
      <div v-else-if="loadError" class="alert alert-warning" role="alert">{{ loadError }} <RouterLink to="/my-listings" class="alert-link">My listings</RouterLink></div>
      <div v-else-if="notOwner" class="alert alert-warning" role="alert">You can only edit listings posted by your own bakery.</div>

      <form v-else class="row g-4" novalidate data-testid="listing-form" @submit.prevent="submit">
        <div v-if="formError" class="col-12"><div class="alert alert-danger mb-0" role="alert" data-testid="form-error">{{ formError }}</div></div>

        <div class="col-12 col-lg-7">
          <div class="bg-white border rounded-4 p-3 p-md-4">
            <div class="mb-3">
              <label for="itemName" class="form-label fw-semibold">What are you offering?</label>
              <input id="itemName" v-model="form.itemName" class="form-control" :class="cls('itemName')" maxlength="80" placeholder="e.g. Assorted croissants" :aria-invalid="!!err('itemName')" aria-describedby="itemName-err" />
              <div id="itemName-err" class="invalid-feedback">{{ err('itemName') }}</div>
            </div>

            <div class="mb-3">
              <label for="description" class="form-label fw-semibold">Description <span class="text-body-secondary fw-normal">(optional)</span></label>
              <textarea id="description" v-model="form.description" class="form-control" :class="cls('description')" rows="3" placeholder="Flavours, how it is packed, anything the collector should know" :aria-invalid="!!err('description')" aria-describedby="description-err"></textarea>
              <div class="d-flex justify-content-between">
                <div id="description-err" class="invalid-feedback d-block">{{ err('description') }}</div>
                <div class="form-text ms-auto">{{ form.description.length }}/500</div>
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-12 col-sm-4">
                <label for="quantity" class="form-label fw-semibold">Quantity</label>
                <input id="quantity" v-model="form.quantity" type="number" min="1" max="500" step="1" inputmode="numeric" class="form-control" :class="cls('quantity')" :aria-invalid="!!err('quantity')" aria-describedby="quantity-err" />
                <div id="quantity-err" class="invalid-feedback">{{ err('quantity') }}</div>
              </div>
            </div>

            <div class="mb-3">
              <label for="weightGramsPerUnit" class="form-label fw-semibold">Weight per unit (grams)</label>
              <input id="weightGramsPerUnit" v-model="form.weightGramsPerUnit" type="number" min="1" max="100000" step="1" class="form-control" :class="cls('weightGramsPerUnit')" :aria-invalid="!!err('weightGramsPerUnit')" aria-describedby="weight-error" />
              <div id="weight-error" class="invalid-feedback">{{ err('weightGramsPerUnit') }}</div>
              <div class="form-text">Weight of one reservable item or pack, used to estimate collected kilograms.</div>
            </div>
            <fieldset class="mb-3">
              <legend class="form-label fw-semibold fs-6">Dietary tags</legend>
              <div class="d-flex flex-wrap gap-1">
                <template v-for="t in DIETARY_TAGS" :key="t">
                  <input :id="`diet-${t}`" class="btn-check chip-check" type="checkbox" :checked="form.dietaryTags.includes(t)" @change="toggle(form.dietaryTags, t)" />
                  <label class="btn btn-outline-secondary chip" :for="`diet-${t}`">{{ t }}</label>
                </template>
              </div>
            </fieldset>

            <fieldset class="mb-3">
              <legend class="form-label fw-semibold fs-6">Contains allergens</legend>
              <div class="d-flex flex-wrap gap-1">
                <template v-for="a in ALLERGENS" :key="a">
                  <input :id="`allergen-${a}`" class="btn-check chip-check allergen" type="checkbox" :checked="form.allergens.includes(a)" @change="toggle(form.allergens, a)" />
                  <label class="btn btn-outline-secondary chip" :for="`allergen-${a}`">{{ a }}</label>
                </template>
              </div>
              <div class="form-text">Collectors rely on this, so please tick everything that applies.</div>
            </fieldset>

            <div class="row g-3">
              <div class="col-12 col-sm-6">
                <label for="pickupStart" class="form-label fw-semibold">Pickup opens</label>
                <input id="pickupStart" v-model="form.pickupStart" type="datetime-local" class="form-control" :class="cls('pickupStart')" :aria-invalid="!!err('pickupStart')" aria-describedby="pickupStart-err" />
                <div id="pickupStart-err" class="invalid-feedback">{{ err('pickupStart') }}</div>
              </div>
              <div class="col-12 col-sm-6">
                <label for="pickupEnd" class="form-label fw-semibold">Pickup closes</label>
                <input id="pickupEnd" v-model="form.pickupEnd" type="datetime-local" class="form-control" :class="cls('pickupEnd')" :aria-invalid="!!err('pickupEnd')" aria-describedby="pickupEnd-err" />
                <div id="pickupEnd-err" class="invalid-feedback">{{ err('pickupEnd') }}</div>
                <div class="d-flex gap-1 mt-1" role="group" aria-label="Quick pickup length">
                  <button v-for="h in [1, 2, 3]" :key="h" type="button" class="btn btn-sm btn-outline-secondary py-0" @click="setEndAfter(h)">+{{ h }}h</button>
                </div>
              </div>
              <div class="col-12 col-sm-6">
                <label for="bestBefore" class="form-label fw-semibold">Best before</label>
                <input id="bestBefore" v-model="form.bestBefore" type="datetime-local" class="form-control" :class="cls('bestBefore')" :aria-invalid="!!err('bestBefore')" aria-describedby="bestBefore-err" />
                <div id="bestBefore-err" class="invalid-feedback">{{ err('bestBefore') }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="bg-white border rounded-4 p-3 p-md-4 mb-4">
            <label for="photo" class="form-label fw-semibold">Photo</label>
            <img v-if="photoPreview" :src="photoPreview" class="photo-preview d-block mb-2" alt="Preview of the chosen photo" />
            <img v-else-if="existingPhoto" :src="existingPhoto" class="photo-preview d-block mb-2" alt="Current photo" />
            <input id="photo" type="file" accept="image/jpeg,image/png,image/webp" class="form-control" :class="cls('photo')" :aria-invalid="!!err('photo')" aria-describedby="photo-err" @change="onPhoto" />
            <div id="photo-err" class="invalid-feedback">{{ err('photo') }}</div>
            <div class="form-text">JPEG, PNG or WebP, up to 2 MB.<template v-if="editing"> Leave empty to keep the current photo.</template></div>
          </div>

          <div class="bg-white border rounded-4 p-3 p-md-4 mb-4">
            <div class="fw-semibold mb-2">Charity priority</div>
            <p class="small text-body-secondary mb-0">New listings are reserved for verified charities during a short priority period, then open to everyone. Editing does not restart the clock.</p>
            <template v-if="editing && !form.priorityUntil">
              <div class="form-check form-switch mt-2"><input id="visibleToIndividuals" v-model="form.visibleToIndividuals" class="form-check-input" type="checkbox" /><label for="visibleToIndividuals" class="form-check-label">Also share this older listing with individuals</label></div>
            </template>
          </div>

          <div class="bg-white border rounded-4 p-3 p-md-4">
            <label for="address" class="form-label fw-semibold">Pickup address</label>
            <AddressSearch id="address" v-model="form.address" placeholder="Search an address or postal code" :invalid="!!err('address')" @select="onAddress" />
            <div v-if="err('address')" class="text-danger small mt-1" role="alert" data-testid="address-error">{{ err('address') }}</div>
            <div class="form-text">Looked up with OneMap, so collectors can find you on the map.</div>
            <div v-if="previewListing.length" class="mt-3" style="height: 220px"><ListingMap :listings="previewListing" :linkable="false" /></div>
          </div>
        </div>

        <div class="col-12 d-flex gap-2 justify-content-end">
          <RouterLink :to="editing ? { name: 'listing', params: { id } } : '/browse'" class="btn btn-outline-secondary">Cancel</RouterLink>
          <button type="submit" class="btn btn-primary px-4" :disabled="submitting" data-testid="submit-listing">
            <span v-if="submitting" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            {{ editing ? 'Save changes' : 'Post listing' }}
          </button>
        </div>
      </form>
    </div>
</template>
