<script setup>
import { onMounted, ref } from 'vue';
import { api, errorMessage } from '../api';
import { useSession } from '../stores/session';
import { now } from '../composables/useNow';
import { formatDateTime } from '../utils/time';
const session = useSession();
const items = ref([]), page = ref(1), total = ref(0), loading = ref(true), error = ref(''), busy = ref(false), notice = ref('');
async function load() {
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get('/reservations/mine', { params: { page: page.value } });
    items.value = data.items; total.value = data.total;
  } catch (e) { error.value = errorMessage(e); }
  finally { loading.value = false; }
}
async function act(row, action) {
  busy.value = true; notice.value = ''; error.value = '';
  try {
    await api.post(`/reservations/${row.id}/${action}`);
    notice.value = action === 'collect' ? 'Collection confirmed. Impact totals have been updated.' : 'Reservation cancelled. Available stock has been restored.';
    await load();
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
function status(row) { return row.status === 'reserved' && new Date(row.pickupEnd).getTime() <= now.value ? 'expired' : row.status; }
function canCollect(row) { return new Date(row.pickupStart).getTime() <= now.value && new Date(row.pickupEnd).getTime() > now.value; }
async function move(delta) { page.value += delta; await load(); }
onMounted(load);
</script>
<template>
  <div class="mx-auto" style="max-width: 1100px">
    <h1 class="h3">{{ session.isBakery ? 'Collections' : 'My reservations' }}</h1>
    <p class="text-body-secondary">{{ session.isBakery ? 'Confirm collection after handing over the food.' : 'Your reserved food and past collections, including cancellations and missed pickups.' }}</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button></div>
    <div v-if="notice" class="alert alert-success" role="status">{{ notice }}</div>
    <p v-if="loading" role="status">Loading reservations…</p>
    <template v-else>
      <div v-if="!items.length && !error" class="bg-white border rounded-4 p-4">No reservations yet. <RouterLink to="/browse">Browse food</RouterLink></div>
      <article v-for="row in items" :key="row.id" class="bg-white border rounded-4 p-3 mb-3" data-testid="reservation-row">
        <div class="d-flex justify-content-between gap-3"><h2 class="h5">{{ row.itemName }}</h2><span class="badge align-self-start" :class="status(row) === 'collected' ? 'text-bg-success' : 'text-bg-secondary'">{{ status(row) }}</span></div>
        <p class="mb-1">{{ session.isBakery ? row.recipientName : row.bakeryName }} · {{ row.quantity }} units · {{ row.weightKg.toFixed(2) }} kg</p>
        <p class="small mb-1">{{ row.address }}</p>
        <p class="small text-body-secondary mb-1">Reserved {{ new Date(row.createdAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' }) }}</p>
        <p class="small text-body-secondary">Pickup: {{ formatDateTime(row.pickupStart) }} – {{ formatDateTime(row.pickupEnd) }}</p>
        <p v-if="row.collectedAt" class="small">Collected {{ formatDateTime(row.collectedAt) }}</p>
        <div v-if="status(row) === 'reserved'" class="d-flex gap-2">
          <button v-if="session.isBakery" class="btn btn-primary btn-sm" :disabled="busy || !canCollect(row)" @click="act(row, 'collect')">Confirm collection</button>
          <button class="btn btn-outline-danger btn-sm" :disabled="busy" @click="act(row, 'cancel')">Cancel reservation</button>
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
