<script setup>
import { computed, ref } from 'vue';
import { ALLERGENS, DIETARY_TAGS } from '../constants';
import AddressSearch from './AddressSearch.vue';

// v-model is the whole filter object; BrowseView watches it and refetches without a page reload.
const filters = defineModel({ type: Object, required: true });

const addressText = ref('');
const geoError = ref('');
const locating = ref(false);

const activeCount = computed(() => {
  const f = filters.value;
  return (f.q ? 1 : 0) + f.dietary.length + f.avoid.length + (f.openNow ? 1 : 0) + (f.endingSoon ? 1 : 0) + (f.near ? 1 : 0);
});

function patch(changes) {
  filters.value = { ...filters.value, ...changes };
}
function toggle(key, value) {
  const list = filters.value[key];
  patch({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
}

function setNear(near) {
  geoError.value = '';
  patch({ near, sort: near ? 'distance' : filters.value.sort === 'distance' ? 'ending' : filters.value.sort });
}
function onAddress(r) {
  setNear({ lat: r.lat, lng: r.lng, label: r.address });
}
function clearNear() {
  addressText.value = '';
  setNear(null);
}
function useMyLocation() {
  geoError.value = '';
  if (!navigator.geolocation) {
    geoError.value = 'Your browser does not support location.';
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false;
      addressText.value = 'My location';
      setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My location' });
    },
    () => {
      locating.value = false;
      geoError.value = 'We could not get your location. Allow location access, or search for an address instead.';
    },
    { timeout: 10000 }
  );
}

function clearAll() {
  addressText.value = '';
  geoError.value = '';
  filters.value = { q: '', dietary: [], avoid: [], openNow: false, endingSoon: false, near: null, radiusKm: 5, sort: 'ending' };
}
</script>

<template>
  <section class="bg-white border rounded-4 p-3 mb-3" aria-label="Filters">
    <div class="row g-2 align-items-end">
      <div class="col-12 col-md-6">
        <label for="f-q" class="form-label small fw-semibold mb-1">Search</label>
        <input
          id="f-q"
          type="search"
          class="form-control"
          placeholder="Croissants, bakery name…"
          :value="filters.q"
          @input="patch({ q: $event.target.value })"
        />
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <label for="f-sort" class="form-label small fw-semibold mb-1">Sort by</label>
        <select id="f-sort" class="form-select" :value="filters.sort" @change="patch({ sort: $event.target.value })">
          <option value="ending">Ending soonest</option>
          <option value="newest">Newest</option>
          <option value="distance" :disabled="!filters.near">Nearest</option>
        </select>
      </div>
      <div class="col-12 col-sm-6 col-md-3 d-flex flex-column gap-1 pb-1">
        <div class="form-check form-switch mb-0">
          <input id="f-open" class="form-check-input" type="checkbox" role="switch" :checked="filters.openNow" @change="patch({ openNow: $event.target.checked })" />
          <label class="form-check-label small" for="f-open">Open for pickup now</label>
        </div>
        <div class="form-check form-switch mb-0">
          <input id="f-soon" class="form-check-input" type="checkbox" role="switch" :checked="filters.endingSoon" @change="patch({ endingSoon: $event.target.checked })" />
          <label class="form-check-label small" for="f-soon">Ending soon (&lt; 2 h)</label>
        </div>
      </div>
    </div>

    <div class="mt-3">
      <div class="small fw-semibold mb-1" id="diet-label">Dietary</div>
      <div class="d-flex flex-wrap gap-1" role="group" aria-labelledby="diet-label">
        <template v-for="t in DIETARY_TAGS" :key="t">
          <input :id="`f-diet-${t}`" class="btn-check chip-check" type="checkbox" :checked="filters.dietary.includes(t)" @change="toggle('dietary', t)" />
          <label class="btn btn-outline-secondary chip" :for="`f-diet-${t}`">{{ t }}</label>
        </template>
      </div>
    </div>

    <details class="mt-3">
      <summary class="small fw-semibold" style="cursor: pointer">
        Avoid allergens<span v-if="filters.avoid.length" class="badge text-bg-warning ms-1">{{ filters.avoid.length }}</span>
      </summary>
      <div class="d-flex flex-wrap gap-1 mt-2">
        <template v-for="a in ALLERGENS" :key="a">
          <input :id="`f-avoid-${a}`" class="btn-check chip-check allergen" type="checkbox" :checked="filters.avoid.includes(a)" @change="toggle('avoid', a)" />
          <label class="btn btn-outline-secondary chip" :for="`f-avoid-${a}`">no {{ a }}</label>
        </template>
      </div>
    </details>

    <div class="mt-3">
      <label for="f-near" class="form-label small fw-semibold mb-1">Near</label>
      <div class="row g-2">
        <div class="col-12 col-sm">
          <AddressSearch id="f-near" v-model="addressText" placeholder="Address or postal code" @select="onAddress" />
        </div>
        <div class="col-auto">
          <button type="button" class="btn btn-outline-primary" :disabled="locating" @click="useMyLocation">
            <span v-if="locating" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            <i v-else class="bi bi-crosshair me-1" aria-hidden="true"></i>My location
          </button>
        </div>
        <div v-if="filters.near" class="col-auto d-flex align-items-center gap-2">
          <label for="f-radius" class="small mb-0">within</label>
          <select id="f-radius" class="form-select w-auto" :value="filters.radiusKm" @change="patch({ radiusKm: Number($event.target.value) })">
            <option v-for="r in [1, 2, 5, 10, 20]" :key="r" :value="r">{{ r }} km</option>
          </select>
          <button type="button" class="btn btn-sm btn-link" @click="clearNear">Clear</button>
        </div>
      </div>
      <div v-if="geoError" class="text-danger small mt-1" role="alert">{{ geoError }}</div>
    </div>

    <div v-if="activeCount" class="mt-3">
      <button type="button" class="btn btn-sm btn-link p-0" @click="clearAll"><i class="bi bi-x-circle me-1" aria-hidden="true"></i>Clear all filters ({{ activeCount }})</button>
    </div>
  </section>
</template>
