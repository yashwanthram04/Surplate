<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import ReliabilityNotice from '../components/ReliabilityNotice.vue';
import ReservationFields from '../components/ReservationFields.vue';
import { useSession } from '../stores/session';
import { now } from '../composables/useNow';
import { formatDateTime } from '../utils/time';
import { formatSlot, openSlots } from '../utils/slots';
import { STATUS_BADGE, reservationErrors, spacedCode } from '../utils/reservations';
const session = useSession();
const route = useRoute();
const items = ref([]), page = ref(1), total = ref(0), loading = ref(true), error = ref(''), busy = ref(false), notice = ref('');
const reliability = ref(null);
const justReserved = computed(() => items.value.find((r) => r.id === route.query.reserved && r.status === 'reserved'));

async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/reservations/mine', { params: { page: page.value } });
    items.value = data.items; total.value = data.total;
    if (!session.isBakery) reliability.value = (await api.get('/reservations/reliability')).data;
  } catch (e) { error.value = errorMessage(e); }
  finally { loading.value = false; }
}
async function cancel(row) {
  busy.value = true; notice.value = ''; error.value = '';
  try {
    await api.post(`/reservations/${row.id}/cancel`);
    notice.value = 'Reservation cancelled. The food is back on the board.';
    await load();
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
    await load();
  } catch (e) { editing.serverErrors = fieldErrors(e); editing.error = errorMessage(e); }
  finally { busy.value = false; }
}

const time = (ms) => new Date(ms).getTime();
function status(row) { return row.status === 'reserved' && time(row.missedAfter) <= now.value ? 'missed' : row.status; }
const canChange = (row) => status(row) === 'reserved' && time(row.slotEnd) > now.value;
async function move(delta) { page.value += delta; await load(); }
onMounted(load);
</script>
<template>
  <div class="mx-auto" style="max-width: 1100px">
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
      <h1 class="h3">{{ session.isBakery ? 'Order history' : 'My reservations' }}</h1>
      <RouterLink v-if="session.isBakery" to="/orders" class="btn btn-outline-primary btn-sm">Open orders</RouterLink>
    </div>
    <p class="text-body-secondary">{{ session.isBakery ? 'Every reservation for your listings, including collections, cancellations and missed pickups.' : 'Show your code at the counter during your collection slot. You can change a reservation until its slot ends.' }}</p>
    <div v-if="justReserved" class="alert alert-success" role="status" data-testid="reserved-banner">
      Reserved! Your code is <strong class="font-monospace fs-5">{{ spacedCode(justReserved.code) }}</strong>. Collect {{ formatSlot(justReserved.slotStart, justReserved.slotEnd) }}.
    </div>
    <ReliabilityNotice v-if="reliability" :reliability="reliability" />
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button></div>
    <div v-if="notice" class="alert alert-success" role="status">{{ notice }}</div>
    <p v-if="loading" role="status">Loading reservations…</p>
    <template v-else>
      <div v-if="!items.length && !error" class="bg-white border rounded-4 p-4">No reservations yet. <RouterLink v-if="!session.isBakery" to="/browse">Browse food</RouterLink></div>
      <article v-for="row in items" :key="row.id" class="bg-white border rounded-4 p-3 mb-3" data-testid="reservation-row">
        <div class="d-flex justify-content-between gap-3">
          <h2 class="h5">{{ row.itemName }}</h2>
          <span class="badge align-self-start" :class="STATUS_BADGE[status(row)]">{{ status(row) }}</span>
        </div>
        <p class="mb-1">{{ session.isBakery ? row.recipientName : row.bakeryName }} · {{ row.quantity }} units · {{ row.weightKg.toFixed(2) }} kg</p>
        <p class="small mb-1">{{ row.address }}</p>
        <p class="small mb-1"><strong>Collection slot:</strong> {{ formatSlot(row.slotStart, row.slotEnd) }}</p>
        <p v-if="row.code && status(row) === 'reserved'" class="mb-1">Reservation code: <strong class="font-monospace fs-5" data-testid="reservation-code">{{ spacedCode(row.code) }}</strong></p>
        <p class="small text-body-secondary mb-1">Reserved {{ formatDateTime(row.createdAt) }}</p>
        <p v-if="row.collectedAt" class="small mb-1">Collected {{ formatDateTime(row.collectedAt) }}</p>
        <p v-if="status(row) === 'missed'" class="small text-danger mb-1">
          Not collected<template v-if="row.missedAt">: released {{ row.releasedBy === 'bakery' ? 'by the bakery' : 'automatically' }} {{ formatDateTime(row.missedAt) }}</template>. The food went back on the board.
        </p>

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
        <div v-else-if="!session.isBakery && status(row) === 'reserved'" class="d-flex gap-2 mt-2">
          <button v-if="canChange(row)" class="btn btn-outline-primary btn-sm" :disabled="busy" @click="startEdit(row)">Change</button>
          <button class="btn btn-outline-danger btn-sm" :disabled="busy" @click="cancel(row)">Cancel reservation</button>
        </div>
      </article>
      <nav v-if="total > 20" class="d-flex align-items-center gap-3" aria-label="Reservation pages">
        <button class="btn btn-outline-secondary" :disabled="page === 1 || busy" @click="move(-1)">Previous</button>
        <span>Page {{ page }} of {{ Math.ceil(total / 20) }}</span>
        <button class="btn btn-outline-secondary" :disabled="page * 20 >= total || busy" @click="move(1)">Next</button>
      </nav>
    </template>
  </div>
</template>
