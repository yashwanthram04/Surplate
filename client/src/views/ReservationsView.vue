<script setup>
import BouncingHeading from '../components/BouncingHeading.vue';
import SiteBanner from '../components/SiteBanner.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import ReliabilityNotice from '../components/ReliabilityNotice.vue';
import ReservationFields from '../components/ReservationFields.vue';
import { useSession } from '../stores/session';
import { useReviews } from '../stores/reviews'; // REVIEWS FEATURE
import { now } from '../composables/useNow';
import { formatDateTime } from '../utils/time';
import { formatSlot, openSlots } from '../utils/slots';
import { STATUS_BADGE, reservationErrors, spacedCode } from '../utils/reservations';
import { collapseOut, dropIn, expandIn, popIn, riseIn } from '../utils/motion';
const session = useSession();
const reviews = useReviews(); // REVIEWS FEATURE
const route = useRoute();
const items = ref([]), page = ref(1), total = ref(0), loading = ref(true), error = ref(''), busy = ref(false), notice = ref('');
const reliability = ref(null);
const FILTERS = [['', 'All'], ['pending', 'Pending'], ['collected', 'Collected'], ['missed', 'Missed'], ['cancelled', 'Cancelled']];
const statusFilter = ref('');
const EMPTY_TEXT = { pending: 'No pending reservations.', collected: 'Nothing collected yet.', missed: 'No missed pickups. Nice!', cancelled: 'No cancelled reservations.' };
const justReserved = computed(() => items.value.find((r) => r.id === route.query.reserved && r.status === 'reserved'));

// quiet: refresh in place (after cancel/change) so the list animates the change instead of reloading.
async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/reservations/mine', { params: { page: page.value, ...(statusFilter.value ? { status: statusFilter.value } : {}) } });
    items.value = data.items; total.value = data.total;
    if (!session.isBakery) reliability.value = (await api.get('/reservations/reliability')).data;
    reviews.refresh(); // REVIEWS FEATURE: which collected pickups still need a thank-you
  } catch (e) { error.value = errorMessage(e); }
  finally { loading.value = false; }
}
async function cancel(row) {
  busy.value = true; notice.value = ''; error.value = '';
  try {
    await api.post(`/reservations/${row.id}/cancel`);
    notice.value = 'Reservation cancelled. The food is back on the board.';
    await load({ quiet: true });
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}

// ---- change quantity / slot (until the slot ends) ----
const editing = reactive({ id: '', listing: null, quantity: 1, slotStart: '', submitted: false, serverErrors: {}, error: '' });
const editSlots = computed(() => (editing.listing ? openSlots(editing.listing, now.value) : []));
const editRow = computed(() => items.value.find((r) => r.id === editing.id));
const editMax = computed(() => Math.min(500, (editRow.value?.quantity ?? 0) + (editing.listing?.quantityRemaining ?? 0)));
const editErrors = computed(() => ({ ...(editing.submitted ? reservationErrors(editing, { max: editMax.value, slots: editSlots.value }) : {}), ...editing.serverErrors }));
async function startEdit(row) {
  Object.assign(editing, { id: row.id, listing: null, quantity: row.quantity, slotStart: new Date(row.slotStart).toISOString(), submitted: false, serverErrors: {}, error: '' });
  try { editing.listing = (await api.get(`/listings/${row.listingId}`)).data; }
  catch (e) { editing.error = errorMessage(e); }
}
async function saveEdit() {
  editing.submitted = true; editing.serverErrors = {}; editing.error = '';
  if (Object.keys(editErrors.value).length) return;
  busy.value = true;
  try {
    await api.patch(`/reservations/${editing.id}`, { quantity: Number(editing.quantity), slotStart: editing.slotStart });
    editing.id = '';
    notice.value = 'Reservation updated.';
    await load({ quiet: true });
  } catch (e) { editing.serverErrors = fieldErrors(e); editing.error = errorMessage(e); }
  finally { busy.value = false; }
}

const time = (ms) => new Date(ms).getTime();
function status(row) { return row.status === 'reserved' && time(row.missedAfter) <= now.value ? 'missed' : row.status; }
const canChange = (row) => status(row) === 'reserved' && time(row.slotEnd) > now.value;
async function setFilter(value) {
  if (value === statusFilter.value) return;
  statusFilter.value = value; page.value = 1;
  await load({ quiet: true });
}
async function move(delta) { page.value += delta; await load(); }
onMounted(load);
</script>
<template>
  <div class="mx-auto" style="max-width: 1100px">
    <SiteBanner compact icon="bi-bag-heart-fill">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <BouncingHeading class="h3" :text="session.isBakery ? 'Order history' : 'My reservations'" />
        <RouterLink v-if="session.isBakery" to="/orders" class="btn btn-outline-primary btn-sm">Open orders</RouterLink>
      </div>
      <p class="text-body-secondary">{{ session.isBakery ? 'Every reservation for your listings, including collections, cancellations and missed pickups.' : 'Show your code at the counter during your collection slot. You can change a reservation until its slot ends.' }}</p>
    </SiteBanner>
    <Transition appear :css="false" @enter="dropIn">
      <div v-if="justReserved" class="alert alert-success" role="status" data-testid="reserved-banner">
        <i class="bi bi-bag-check-fill me-1 d-inline-block" data-anim="icon" aria-hidden="true"></i>
        Reserved! Your code is <strong class="font-monospace fs-5"><span class="visually-hidden">{{ spacedCode(justReserved.code) }}</span><span class="code-flip" aria-hidden="true"><span v-for="(c, i) in spacedCode(justReserved.code)" :key="i" class="d-inline-block" data-anim="char">{{ c === ' ' ? '\u00a0' : c }}</span></span></strong>. Collect {{ formatSlot(justReserved.slotStart, justReserved.slotEnd) }}.
      </div>
    </Transition>
    <ReliabilityNotice v-if="reliability" :reliability="reliability" />
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button></div>
    <Transition :css="false" @enter="dropIn">
      <div v-if="notice" :key="notice" class="alert alert-success" role="status">{{ notice }}</div>
    </Transition>
    <p v-if="loading" role="status">Loading reservations…</p>
    <template v-else>
      <div class="status-filter d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by status">
        <button v-for="[value, label] in FILTERS" :key="value" type="button" class="btn btn-sm rounded-pill"
          :class="statusFilter === value ? 'btn-primary' : 'btn-outline-secondary'" :aria-pressed="statusFilter === value"
          :data-testid="`filter-${value || 'all'}`" @click="setFilter(value)">{{ label }}</button>
      </div>
      <div v-if="!items.length && !error" class="bg-white border rounded-4 p-4" data-testid="reservations-empty">
        <template v-if="statusFilter">{{ EMPTY_TEXT[statusFilter] }} <button type="button" class="btn btn-link p-0 align-baseline" @click="setFilter('')">Show all</button></template>
        <template v-else>No reservations yet. <RouterLink v-if="!session.isBakery" to="/browse">Browse food</RouterLink></template>
      </div>
      <TransitionGroup appear :css="false" @enter="riseIn" @leave="collapseOut">
      <article v-for="(row, index) in items" :key="row.id" :data-index="index" class="bg-white border rounded-4 p-3 mb-3 res-row" :class="{ 'res-dim': ['missed', 'cancelled'].includes(status(row)) }" data-testid="reservation-row">
        <div class="res-photo" aria-hidden="true">
          <img v-if="row.photoUrl" :src="row.photoUrl" alt="" loading="lazy" />
          <span v-else>🥖</span>
        </div>
        <div class="res-body">
        <div class="d-flex justify-content-between gap-3">
          <h2 class="h5">{{ row.itemName }}</h2>
          <Transition :css="false" @enter="popIn">
            <span :key="status(row)" class="badge align-self-start" :class="STATUS_BADGE[status(row)]">{{ status(row) }}</span>
          </Transition>
        </div>
        <p class="mb-1">{{ session.isBakery ? row.recipientName : row.bakeryName }} · {{ row.quantity }} units · {{ row.weightKg.toFixed(2) }} kg</p>
        <p class="small mb-1">{{ row.address }}</p>
        <p class="small mb-1"><strong>Collection slot:</strong> {{ formatSlot(row.slotStart, row.slotEnd) }}</p>
        <p v-if="row.code && status(row) === 'reserved'" class="mb-1">Reservation code: <strong class="font-monospace fs-5" data-testid="reservation-code">{{ spacedCode(row.code) }}</strong></p>
        <p class="small text-body-secondary mb-1">Reserved {{ formatDateTime(row.createdAt) }}</p>
        <p v-if="row.collectedAt" class="small mb-1">Collected {{ formatDateTime(row.collectedAt) }}</p>
        <!-- >>> REVIEWS FEATURE (start): thank the bakery for a collected pickup; bakeries rate the customer -->
        <button v-if="!session.isBakery && row.status === 'collected' && reviews.isPending(row.id)" type="button" class="btn btn-sm btn-outline-primary mt-1" data-testid="say-thanks"
          @click="reviews.open({ reservationId: row.id, bakeryName: row.bakeryName, itemName: row.itemName, quantity: row.quantity })">
          <span class="thanks-prompt-emoji fs-6" aria-hidden="true">💛</span> Say thanks
        </button>
        <RouterLink v-else-if="session.isBakery && row.status === 'collected'" to="/ratings" class="btn btn-sm btn-outline-primary mt-1">Rate this customer</RouterLink>
        <!-- <<< REVIEWS FEATURE (end) -->
        <p v-if="status(row) === 'missed'" class="small text-danger mb-1">
          Not collected<template v-if="row.missedAt">: released {{ row.releasedBy === 'bakery' ? 'by the bakery' : 'automatically' }} {{ formatDateTime(row.missedAt) }}</template>. The food went back on the board.
        </p>

        <Transition :css="false" @enter="expandIn" @leave="collapseOut">
        <form v-if="editing.id === row.id" class="border-top pt-3 mt-2" novalidate @submit.prevent="saveEdit">
          <div v-if="editing.error" class="alert alert-danger py-2" role="alert">{{ editing.error }}</div>
          <p v-if="!editing.listing && !editing.error" role="status">Loading…</p>
          <template v-if="editing.listing">
            <p class="small text-body-secondary">You hold {{ row.quantity }}; {{ editing.listing.quantityRemaining }} more available.</p>
            <ReservationFields v-model:quantity="editing.quantity" v-model:slot-start="editing.slotStart" :id-prefix="`edit-${row.id}`" :slots="editSlots" :max="editMax" :errors="editErrors" />
          </template>
          <div class="d-flex gap-2">
            <button class="btn btn-primary btn-sm" :disabled="busy || !editing.listing">Save changes</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" @click="editing.id = ''">Keep as is</button>
          </div>
        </form>
        </Transition>
        <div v-if="editing.id !== row.id && !session.isBakery && status(row) === 'reserved'" class="d-flex gap-2 mt-2">
          <button v-if="canChange(row)" class="btn btn-outline-primary btn-sm" :disabled="busy" @click="startEdit(row)">Change</button>
          <button class="btn btn-outline-danger btn-sm" :disabled="busy" @click="cancel(row)">Cancel reservation</button>
        </div>
        </div>
      </article>
      </TransitionGroup>
      <nav v-if="total > 20" class="d-flex align-items-center gap-3" aria-label="Reservation pages">
        <button class="btn btn-outline-secondary" :disabled="page === 1 || busy" @click="move(-1)">Previous</button>
        <span>Page {{ page }} of {{ Math.ceil(total / 20) }}</span>
        <button class="btn btn-outline-secondary" :disabled="page * 20 >= total || busy" @click="move(1)">Next</button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.code-flip { perspective: 400px; }
.res-row { display: flex; gap: 1rem; align-items: flex-start; }
.res-body { flex: 1; min-width: 0; }
.res-photo { flex: none; width: 6.5rem; height: 6.5rem; border-radius: 0.9rem; overflow: hidden; background: var(--bs-tertiary-bg, #f1f3f0);
  display: grid; place-items: center; font-size: 2.4rem; }
.res-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.res-dim .res-photo img { filter: grayscale(0.85); opacity: 0.7; }
@media (max-width: 480px) { .res-photo { width: 4.5rem; height: 4.5rem; font-size: 1.8rem; } }
</style>
