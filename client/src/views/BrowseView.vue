<script setup>
import BouncingHeading from '../components/BouncingHeading.vue';
import SiteBanner from '../components/SiteBanner.vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import { now } from '../composables/useNow';
import { useEntrance, useListMotion } from '../composables/useMotion';
import ListingCard from '../components/ListingCard.vue';
import ListingFilters from '../components/ListingFilters.vue';
import ListingMap from '../components/ListingMap.vue';
import { useSession } from '../stores/session';

const session = useSession();
const filters = ref({ q: '', dietary: [], avoid: [], openNow: false, endingSoon: false, near: null, radiusKm: 5, sort: 'ending' });
const items = ref([]);
const loading = ref(true);
const error = ref('');
const hoverId = ref(null);
const view = ref('list'); // below the lg breakpoint the page shows either the list or the map
const mapPanel = ref(null);
watch(view, async (mode) => {
  if (mode !== 'map') return;
  await nextTick();
  mapPanel.value?.scrollIntoView({ block: 'center', behavior: 'instant' });
});

// Listings whose pickup window has just closed disappear from the board right away,
// without waiting for the next refresh.
const visible = computed(() => items.value.filter((l) => new Date(l.pickupEnd).getTime() > now.value));

// Motion: the page settles in, new cards rise one after another, and the cards that stay glide to their new
// places. The glide watches the ids (not the array), so the once-a-second clock tick does not retrigger it.
const page = ref(null);
const grid = ref(null);
useEntrance(page);
const order = computed(() => visible.value.map((l) => l.id).join(','));
const cardMotion = useListMotion(grid, order);

let requestId = 0;
async function load() {
  const mine = ++requestId; // ignore responses that arrive out of order
  const f = filters.value;
  const params = { sort: f.sort };
  if (f.q.trim()) params.q = f.q.trim();
  if (f.dietary.length) params.dietary = f.dietary.join(',');
  if (f.avoid.length) params.avoid = f.avoid.join(',');
  if (f.openNow) params.openNow = true;
  if (f.endingSoon) params.endingSoon = true;
  if (f.near) Object.assign(params, { lat: f.near.lat, lng: f.near.lng, radiusKm: f.radiusKm });
  try {
    const { data } = await api.get('/listings', { params });
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
watch(
  filters,
  () => {
    clearTimeout(debounce);
    debounce = setTimeout(load, 250);
  },
  { deep: true }
);
load();
const refresh = setInterval(load, 15 * 1000); // pick up new listings and stock changes (reservations, releases)
onBeforeUnmount(() => {
  clearTimeout(debounce);
  clearInterval(refresh);
});
</script>

<template>
  <div ref="page" class="row g-4">
    <div class="col-12" data-enter>
      <SiteBanner icon="bi-basket2-fill">
        <BouncingHeading class="h3 mb-1" text="Rescue surplus food" />
        <p class="text-body-secondary mb-0">Good food from local bakeries, free to collect.</p>
        <!-- Charities-only listings are hidden from everyone except verified charities, so say so instead of leaving people guessing -->
        <div v-if="!session.hasFullAccess" class="small text-body-secondary mt-2" data-testid="partial-view-note">
          <i class="bi bi-info-circle me-1" aria-hidden="true"></i>
          Verified charities get priority access.
          <template v-if="session.isCharity">Your verification is pending.</template>
        </div>
      </SiteBanner>
    </div>

    <!-- List / map toggle for small screens -->
    <div class="col-12 d-lg-none">
      <div class="btn-group w-100" role="group" aria-label="Show list or map">
        <button type="button" class="btn" :class="view === 'list' ? 'btn-primary' : 'btn-outline-primary'" :aria-pressed="view === 'list'" @click="view = 'list'">
          <i class="bi bi-list-ul me-1" aria-hidden="true"></i>List
        </button>
        <button type="button" class="btn" :class="view === 'map' ? 'btn-primary' : 'btn-outline-primary'" :aria-pressed="view === 'map'" @click="view = 'map'">
          <i class="bi bi-map me-1" aria-hidden="true"></i>Map
        </button>
      </div>
    </div>

    <div class="col-12 col-lg-7 col-xxl-8 mt-lg-4 d-lg-block" :class="{ 'd-none': view === 'map' }">
      <div data-enter><ListingFilters v-model="filters" /></div>

      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="small text-body-secondary" aria-live="polite" data-testid="result-count">
          <template v-if="!loading">{{ visible.length }} {{ visible.length === 1 ? 'listing' : 'listings' }} available</template>
        </div>
      </div>

      <div v-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
        <span>{{ error }}</span>
        <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button>
      </div>

      <div v-if="loading" class="row g-3" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="col-12 col-md-6 col-xxl-4">
          <div class="listing-card placeholder-glow" style="height: 300px"><div class="placeholder w-100 h-100"></div></div>
        </div>
      </div>

      <div v-else-if="!visible.length && !error" class="text-center py-5 bg-white border rounded-4" data-testid="empty-state">
        <div class="display-5 mb-2">🥖</div>
        <h2 class="h5">Nothing available right now</h2>
        <p class="text-body-secondary mb-0">Try widening your filters, or check back soon. Bakeries post throughout the day.</p>
      </div>

      <!-- cards rise in one after another, and glide to their new place when a filter changes the list (see useListMotion) -->
      <TransitionGroup v-else ref="grid" tag="div" :css="false" appear class="row g-3 position-relative" @before-enter="cardMotion.onBeforeEnter" @enter="cardMotion.onEnter" @leave="cardMotion.onLeave">
        <div v-for="(l, i) in visible" :key="l.id" class="col-12 col-md-6 col-xxl-4" :data-index="i">
          <ListingCard :listing="l" :highlighted="hoverId === l.id" @hover="hoverId = $event" />
        </div>
      </TransitionGroup>
    </div>

    <div ref="mapPanel" class="col-12 col-lg-5 col-xxl-4 mt-lg-4 d-lg-block" :class="{ 'd-none': view === 'list' }">
      <div class="map-sticky">
        <ListingMap :listings="visible" :highlight-id="hoverId" :center="filters.near" :radius-km="filters.near ? filters.radiusKm : 0" :active="view === 'map'" />
      </div>
    </div>
  </div>
</template>
