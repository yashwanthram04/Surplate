<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import AddressSearch from '../components/AddressSearch.vue';
import FridgeBanner from '../components/FridgeBanner.vue';
import FridgeCard from '../components/FridgeCard.vue';
import FridgeMascot from '../components/FridgeMascot.vue';
import FridgeMagnets from '../components/FridgeMagnets.vue';
import FridgeMap from '../components/FridgeMap.vue';
import FridgeStickyBar from '../components/FridgeStickyBar.vue';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCountUp, useScrollSkew, useSmoothScroll, vMagnetic, vReveal } from '../composables/useFridgeMotion'; // ✨ NEW
import { useSession } from '../stores/session';
import { FRIDGE_STATUSES, displayStatus, statusMeta } from '../utils/fridge';

const session = useSession();
const blankFilters = () => ({ q: '', status: [], near: null, radiusKm: 5, sort: 'recent' });
const filters = ref(blankFilters());
const items = ref([]);
const loading = ref(true);
const error = ref('');
const hoverId = ref(null);
const view = ref('list'); // below the lg breakpoint the page shows either the list or the map

const addressText = ref('');
const geoError = ref('');
const locating = ref(false);

let requestId = 0;
async function load() {
  const mine = ++requestId; // ignore responses that arrive out of order
  const f = filters.value;
  const params = { sort: f.sort };
  if (f.q.trim()) params.q = f.q.trim();
  if (f.status.length) params.status = f.status.join(',');
  if (f.near) Object.assign(params, { lat: f.near.lat, lng: f.near.lng, radiusKm: f.radiusKm });
  try {
    const { data } = await api.get('/fridges', { params });
    if (mine !== requestId) return;
    items.value = data.items;
    error.value = '';
  } catch (err) {
    if (mine !== requestId) return;
    error.value = errorMessage(err);
  } finally {
    if (mine === requestId) loading.value = false;
  }
}

let debounce = null;
watch(filters, () => {
  clearTimeout(debounce);
  debounce = setTimeout(load, 250);
}, { deep: true });
load();
const refresh = setInterval(load, 60 * 1000); // pick up new status updates
onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearInterval(refresh);
});

const patch = (changes) => (filters.value = { ...filters.value, ...changes });
function toggleStatus(s) {
  const list = filters.value.status;
  patch({ status: list.includes(s) ? list.filter((x) => x !== s) : [...list, s] });
}
function setNear(near) {
  geoError.value = '';
  patch({ near, sort: near ? 'distance' : filters.value.sort === 'distance' ? 'recent' : filters.value.sort });
}
const onAddress = (r) => setNear({ lat: r.lat, lng: r.lng, label: r.address });
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
  filters.value = blankFilters();
}

useSmoothScroll();
const shownTotal = useCountUp(() => items.value.length);
// A stale fridge (stocked/low with no update for 48 hours) is not "ready": its food may be old.
const countShown = (...statuses) => items.value.filter((f) => statuses.includes(displayStatus(f))).length;
const shownStocked = useCountUp(() => countShown('stocked'));
const shownNeedy = useCountUp(() => countShown('low', 'empty'));
const shownStale = useCountUp(() => countShown('stale'));
// once the banner has scrolled away, a slim bar with the same counts slides in under the navbar
const heroCol = ref(null);
const barOn = ref(false);
let heroWatch = null;
onMounted(() => {
  heroWatch = ScrollTrigger.create({
    trigger: heroCol.value,
    start: 'bottom top+=96',
    onEnter: () => (barOn.value = true),
    onLeaveBack: () => (barOn.value = false),
  });
});
onBeforeUnmount(() => heroWatch?.kill());
const barStats = computed(() => [
  { value: shownTotal.value, label: 'shown' },
  { value: shownStocked.value, label: 'ready' },
  { value: shownNeedy.value, label: 'need a refill' },
  ...(shownStale.value ? [{ value: shownStale.value, label: 'need a check' }] : []),
]);
const cardGrid = ref(null);
useScrollSkew(cardGrid);
// The banner and sticky-bar mascot is always happy: it's the page's face. The counts beside it stay honest.
const heroMood = 'stocked';
</script>

<template>
  <div class="row g-4">
    <FridgeStickyBar :show="barOn" title="Community fridges" :mood="heroMood" :stats="barStats" />
    <div ref="heroCol" class="col-12">
      <FridgeBanner title="Community fridges" :mood="heroMood" :fridges="items">
        <p class="mb-3">Free food, any time of day. Take what you need, leave what you can. No listing or reservation needed.</p>
        <div class="d-inline-block">
          <RouterLink v-magnetic :to="{ name: 'fridge-new' }" class="btn btn-sticker" data-testid="add-fridge">
            <i class="bi bi-plus-lg me-2" aria-hidden="true"></i>Add a fridge
          </RouterLink>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><strong>{{ shownTotal }}</strong><span>Fridges shown</span></div>
          <div class="hero-stat"><strong>{{ shownStocked }}</strong><span>Ready to take from</span></div>
          <div class="hero-stat"><strong>{{ shownNeedy }}</strong><span>Need a refill</span></div>
          <div v-if="shownStale" class="hero-stat"><strong>{{ shownStale }}</strong><span>Need a check</span></div>
        </div>
      </FridgeBanner>
    </div>

    <div class="col-12"><FridgeMagnets /></div>

    <div class="col-12 d-lg-none">
      <div class="btn-group w-100" role="group" aria-label="Show list or map">
        <button type="button" class="btn" :class="view === 'list' ? 'btn-primary' : 'btn-outline-primary'" :aria-pressed="view === 'list'" @click="view = 'list'"><i class="bi bi-list-ul me-1" aria-hidden="true"></i>List</button>
        <button type="button" class="btn" :class="view === 'map' ? 'btn-primary' : 'btn-outline-primary'" :aria-pressed="view === 'map'" @click="view = 'map'"><i class="bi bi-map me-1" aria-hidden="true"></i>Map</button>
      </div>
    </div>

    <div class="col-12 col-lg-7 col-xxl-8 mt-lg-4 d-lg-block" :class="{ 'd-none': view === 'map' }">
      <section v-reveal class="bg-white border rounded-4 p-3 mb-3 fridge-filters" aria-label="Filters">
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md-8">
            <label for="fr-q" class="form-label small fw-semibold mb-1">Search</label>
            <input id="fr-q" type="search" class="form-control" placeholder="Name or address" :value="filters.q" @input="patch({ q: $event.target.value })" />
          </div>
          <div class="col-12 col-md-4">
            <label for="fr-sort" class="form-label small fw-semibold mb-1">Sort by</label>
            <select id="fr-sort" class="form-select" :value="filters.sort" @change="patch({ sort: $event.target.value })">
              <option value="recent">Recently updated</option>
              <option value="name">Name</option>
              <option value="distance" :disabled="!filters.near">Nearest</option>
            </select>
          </div>
        </div>

        <div class="mt-3">
          <div id="fr-status-label" class="small fw-semibold mb-1">Status</div>
          <div class="d-flex flex-wrap gap-1" role="group" aria-labelledby="fr-status-label">
            <template v-for="s in [...FRIDGE_STATUSES, 'stale', 'unknown']" :key="s">
              <input :id="`fr-status-${s}`" class="btn-check chip-check" type="checkbox" :checked="filters.status.includes(s)" @change="toggleStatus(s)" />
              <label class="btn btn-outline-secondary chip" :class="`chip-${s}`" :for="`fr-status-${s}`"><i class="bi me-1" :class="statusMeta(s).icon" aria-hidden="true"></i>{{ statusMeta(s).label }}</label>
            </template>
          </div>
        </div>

        <div class="mt-3">
          <label for="fr-near" class="form-label small fw-semibold mb-1">Near</label>
          <div class="row g-2">
            <div class="col-12 col-sm">
              <AddressSearch id="fr-near" v-model="addressText" placeholder="Address or postal code" @select="onAddress" />
            </div>
            <div class="col-auto">
              <button type="button" class="btn btn-outline-primary" :disabled="locating" @click="useMyLocation">
                <span v-if="locating" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                <i v-else class="bi bi-crosshair me-1" aria-hidden="true"></i>My location
              </button>
            </div>
            <div v-if="filters.near" class="col-auto d-flex align-items-center gap-2">
              <label for="fr-radius" class="small mb-0">within</label>
              <select id="fr-radius" class="form-select w-auto" :value="filters.radiusKm" @change="patch({ radiusKm: Number($event.target.value) })">
                <option v-for="r in [1, 2, 5, 10, 20]" :key="r" :value="r">{{ r }} km</option>
              </select>
              <button type="button" class="btn btn-sm btn-link" @click="clearNear">Clear</button>
            </div>
          </div>
          <div v-if="geoError" class="text-danger small mt-1" role="alert">{{ geoError }}</div>
        </div>

        <div v-if="filters.q || filters.status.length || filters.near" class="mt-3">
          <button type="button" class="btn btn-sm btn-link p-0" @click="clearAll"><i class="bi bi-x-circle me-1" aria-hidden="true"></i>Clear all filters</button>
        </div>
      </section>

      <div class="small text-body-secondary mb-2" aria-live="polite" data-testid="result-count">
        <template v-if="!loading">{{ items.length }} {{ items.length === 1 ? 'place' : 'places' }}</template>
      </div>

      <div v-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
        <span>{{ error }}</span>
        <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button>
      </div>

      <div v-if="loading" class="row g-3" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="col-12 col-md-6 col-xxl-4"><div class="listing-card placeholder-glow" style="height: 300px"><div class="placeholder w-100 h-100"></div></div></div>
      </div>

      <div v-else-if="!items.length && !error" class="text-center py-5 bg-white border rounded-4" data-testid="empty-state">
        <FridgeMascot mood="empty" :size="120" />
        <h2 class="h5">No fridges match</h2>
        <p class="text-body-secondary mb-3">Try widening your filters. Know a fridge that isn't here?</p>
        <RouterLink :to="{ name: 'fridge-new' }" class="btn btn-primary">Add it to the map</RouterLink>
      </div>

      <div v-else ref="cardGrid" class="row g-3">
        <div v-for="(f, i) in items" :key="f.id" v-reveal="i" class="col-12 col-md-6 col-xxl-4">
          <FridgeCard :fridge="f" :highlighted="hoverId === f.id" @hover="hoverId = $event" />
        </div>
      </div>
    </div>

    <div class="col-12 col-lg-5 col-xxl-4 mt-lg-4 d-lg-block" :class="{ 'd-none': view === 'list' }">
      <div class="map-sticky fridge-map-wrap">
        <FridgeMap :fridges="items" :highlight-id="hoverId" :center="filters.near" :radius-km="filters.near ? filters.radiusKm : 0" :active="view === 'map'" />
      </div>
    </div>
  </div>
</template>
