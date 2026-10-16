<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import ConfirmModal from '../components/ConfirmModal.vue';
import { now } from '../composables/useNow';
import { formatDateTime, formatRemaining } from '../utils/time';
import { formatSlot } from '../utils/slots';
import { STATUS_BADGE, spacedCode } from '../utils/reservations';

const VIEWS = [
  { id: 'open', label: 'To collect', empty: 'No open orders right now.' },
  { id: 'due', label: 'Due soon', empty: 'No orders are about to be released.' },
  { id: 'missed', label: 'No-shows', empty: 'No no-shows in the last 7 days.' },
];
const DUE_SOON_MINUTES = 30; // matches the server's "due" view
const view = ref('open'), counts = ref({});
const orders = ref([]), loading = ref(true), error = ref(''), notice = ref('');
const code = ref(''), found = ref(null), lookupError = ref(''), busy = ref(false);
const releasing = ref(null), releaseError = ref('');

let latest = 0;
async function load() {
  const mine = ++latest; // ignore a slower response for a filter the user has already left
  try {
    const { data } = await api.get('/reservations/orders', { params: { view: view.value } });
    if (mine !== latest) return;
    orders.value = data.items; counts.value = data.counts;
    error.value = '';
  } catch (e) { if (mine === latest) error.value = errorMessage(e); }
  finally { if (mine === latest) loading.value = false; }
}
function show(v) {
  if (view.value === v) return;
  view.value = v; orders.value = []; loading.value = true;
  load();
}
onMounted(load);
const refresh = setInterval(load, 30000); // new reservations and automatic releases
onBeforeUnmount(() => clearInterval(refresh));

const time = (d) => new Date(d).getTime();
// Open orders grouped by collection slot, earliest first.
const slots = computed(() => {
  const groups = new Map();
  for (const o of orders.value) {
    const key = `${o.slotStart}|${o.slotEnd}`;
    if (!groups.has(key)) groups.set(key, { key, start: o.slotStart, end: o.slotEnd, orders: [] });
    groups.get(key).orders.push(o);
  }
  return [...groups.values()];
});
function slotState(s) {
  if (time(s.end) <= now.value) return { text: 'Slot ended: waiting for grace period', cls: 'text-danger' };
  if (time(s.start) <= now.value) return { text: 'Collecting now', cls: 'text-success fw-semibold' };
  return { text: `Starts in ${formatRemaining(time(s.start) - now.value)}`, cls: 'text-body-secondary' };
}
const started = (o) => time(o.slotStart) <= now.value;
// Shown when an open order will be released automatically soon.
function releaseIn(o) {
  const left = time(o.missedAfter) - now.value;
  return left <= DUE_SOON_MINUTES * 60000 ? `Released automatically in ${formatRemaining(left)}` : '';
}

async function lookup() {
  lookupError.value = ''; found.value = null; notice.value = '';
  const typed = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (typed.length !== 6) { lookupError.value = 'Enter the 6-character code the customer shows you.'; return; }
  busy.value = true;
  try { found.value = (await api.get('/reservations/lookup', { params: { code: typed } })).data; }
  catch (e) { lookupError.value = errorMessage(e); }
  finally { busy.value = false; }
}
async function confirmCollection() {
  busy.value = true; lookupError.value = '';
  try {
    const { data } = await api.post(`/reservations/${found.value.id}/collect`, { code: found.value.code });
    found.value = data;
    notice.value = `Collection confirmed: ${data.quantity} × ${data.itemName} for ${data.recipientName}.`;
    code.value = '';
    await load();
  } catch (e) { lookupError.value = errorMessage(e); }
  finally { busy.value = false; }
}
async function release() {
  busy.value = true; releaseError.value = '';
  try {
    await api.post(`/reservations/${releasing.value.id}/release`);
    notice.value = `Released ${releasing.value.quantity} × ${releasing.value.itemName} as a no-show. It is back on the board and listed under No-shows.`;
    releasing.value = null;
    await load();
  } catch (e) { releaseError.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 1100px">
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
      <h1 class="h3">Orders</h1>
      <RouterLink to="/reservations" class="btn btn-outline-secondary btn-sm">Order history</RouterLink>
    </div>
    <p class="text-body-secondary">Ask the customer for their reservation code to confirm a collection. Orders not collected within 15 minutes after their slot are released automatically. You can release a no-show sooner once the slot has started.</p>
    <div v-if="notice" class="alert alert-success" role="status">{{ notice }}</div>

    <section class="bg-white border rounded-4 p-3 p-md-4 mb-4" aria-labelledby="code-title">
      <h2 id="code-title" class="h5">Confirm a collection</h2>
      <form class="d-flex flex-wrap gap-2 align-items-start" novalidate @submit.prevent="lookup">
        <div>
          <label for="reservation-code" class="visually-hidden">Reservation code</label>
          <input id="reservation-code" v-model="code" class="form-control form-control-lg font-monospace text-uppercase" style="max-width: 12rem"
            placeholder="ABC 123" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" />
        </div>
        <button class="btn btn-primary btn-lg" :disabled="busy">Find order</button>
      </form>
      <div v-if="lookupError" class="alert alert-danger mt-3 mb-0" role="alert">{{ lookupError }}</div>
      <div v-if="found" class="border rounded-3 p-3 mt-3" data-testid="lookup-result">
        <div class="d-flex justify-content-between gap-2">
          <strong>{{ found.quantity }} × {{ found.itemName }}</strong>
          <span class="badge align-self-start" :class="STATUS_BADGE[found.status]">{{ found.status }}</span>
        </div>
        <div>For {{ found.recipientName }} ({{ found.recipientRole }}) · code <span class="font-monospace text-nowrap">{{ spacedCode(found.code) }}</span></div>
        <div class="small text-body-secondary">Slot {{ formatSlot(found.slotStart, found.slotEnd) }}</div>
        <template v-if="found.status === 'reserved'">
          <p v-if="time(found.pickupStart) > now" class="small text-warning-emphasis mt-2 mb-0">The pickup window opens {{ formatDateTime(found.pickupStart) }}. You can confirm from then.</p>
          <button v-else class="btn btn-success mt-2" :disabled="busy" @click="confirmCollection">Confirm collection</button>
        </template>
        <p v-else-if="found.status === 'collected'" class="small mt-2 mb-0">Collected {{ formatDateTime(found.collectedAt) }}.</p>
      </div>
    </section>

    <div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter orders">
      <button v-for="v in VIEWS" :key="v.id" type="button" class="btn btn-sm" :class="view === v.id ? 'btn-primary' : 'btn-outline-secondary'"
        :aria-pressed="view === v.id" :data-testid="`orders-${v.id}`" @click="show(v.id)">
        {{ v.label }} <span class="badge rounded-pill ms-1" :class="view === v.id ? 'text-bg-light' : 'text-bg-secondary'">{{ counts[v.id] ?? '–' }}</span>
      </button>
    </div>
    <p v-if="view === 'due'" class="small text-body-secondary">Open orders that will be released back to the board within {{ DUE_SOON_MINUTES }} minutes if nobody collects them.</p>
    <p v-if="view === 'missed'" class="small text-body-secondary">Orders not collected in the last 7 days. The food went back on the board and the pickup counts against the customer's reliability score.</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button></div>
    <p v-if="loading" role="status">Loading orders…</p>
    <div v-else-if="!orders.length && !error" class="bg-white border rounded-4 p-4">{{ VIEWS.find((v) => v.id === view).empty }}</div>
    <ul v-else-if="view === 'missed'" class="list-unstyled bg-white border rounded-4 px-3 mb-3">
      <li v-for="o in orders" :key="o.id" class="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-bottom" data-testid="order-row">
        <span>
          <strong>{{ o.quantity }} × {{ o.itemName }}</strong> · {{ o.recipientName }} <span class="text-body-secondary small">({{ o.recipientRole }})</span>
          <span class="d-block small text-body-secondary">Slot {{ formatSlot(o.slotStart, o.slotEnd) }} · code <span class="font-monospace text-nowrap">{{ spacedCode(o.code) }}</span></span>
        </span>
        <span class="small text-danger">Released {{ o.releasedBy === 'bakery' ? 'by staff' : 'automatically' }} {{ formatDateTime(o.missedAt) }}</span>
      </li>
    </ul>
    <section v-for="s in (view === 'missed' ? [] : slots)" :key="s.key" class="bg-white border rounded-4 p-3 mb-3" data-testid="order-slot">
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
        <h3 class="h6 mb-0">{{ formatSlot(s.start, s.end) }}</h3>
        <span class="small" :class="slotState(s).cls">{{ slotState(s).text }}</span>
      </div>
      <ul class="list-unstyled mb-0">
        <li v-for="o in s.orders" :key="o.id" class="d-flex flex-wrap justify-content-between align-items-center gap-2 border-top py-2" data-testid="order-row">
          <span>
            <strong>{{ o.quantity }} × {{ o.itemName }}</strong> · {{ o.recipientName }} <span class="text-body-secondary small">({{ o.recipientRole }})</span>
            <span v-if="releaseIn(o)" class="d-block small text-danger" data-testid="release-countdown">{{ releaseIn(o) }}</span>
          </span>
          <button class="btn btn-outline-danger btn-sm" :disabled="busy || !started(o)" :title="started(o) ? '' : 'Available once the slot starts'" @click="releasing = o; releaseError = ''">Release no-show</button>
        </li>
      </ul>
    </section>

    <ConfirmModal v-if="releasing" title="Release this order?" confirm-text="Release to board" danger :busy="busy" :error="releaseError" @confirm="release" @cancel="releasing = null">
      {{ releasing.quantity }} × <strong>{{ releasing.itemName }}</strong> for {{ releasing.recipientName }} goes back on the board and counts as a missed pickup for them.
    </ConfirmModal>
  </div>
</template>
