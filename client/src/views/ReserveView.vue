<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import ReliabilityNotice from '../components/ReliabilityNotice.vue';
import ReservationFields from '../components/ReservationFields.vue';
import { now } from '../composables/useNow';
import { formatWindow } from '../utils/time';
import { openSlots } from '../utils/slots';
import { reservationErrors } from '../utils/reservations';
const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const listing = ref(null), reliability = ref(null), loading = ref(true), busy = ref(false), error = ref(''), submitted = ref(false);
const form = reactive({ quantity: 1, slotStart: '' });
const serverErrors = ref({});

const slots = computed(() => (listing.value ? openSlots(listing.value, now.value) : []));
const max = computed(() => Math.min(500, listing.value?.quantityRemaining ?? 0));
const errors = computed(() => ({ ...(submitted.value ? reservationErrors(form, { max: max.value, slots: slots.value }) : {}), ...serverErrors.value }));
const reliabilityStops = computed(() => reliability.value && (reliability.value.level === 'blocked' || (reliability.value.maxActive !== null && reliability.value.active >= reliability.value.maxActive)));
const unavailable = computed(() => !listing.value || listing.value.phase === 'ended' || max.value < 1 || !listing.value.weightGramsPerUnit || !slots.value.length);

async function loadListing() {
  try {
    listing.value = (await api.get(`/listings/${props.id}`)).data;
    if (!slots.value.some((s) => s.value === form.slotStart)) form.slotStart = slots.value[0]?.value ?? '';
  } catch (e) { error.value = errorMessage(e); }
}
onMounted(async () => {
  await Promise.all([loadListing(), api.get('/reservations/reliability').then(({ data }) => (reliability.value = data)).catch(() => {})]);
  loading.value = false;
});
// Keep the stock figure current while the form is open.
const refresh = setInterval(loadListing, 15000);
onBeforeUnmount(() => clearInterval(refresh));

async function reserve() {
  submitted.value = true; serverErrors.value = {}; error.value = '';
  if (Object.keys(errors.value).length) return;
  busy.value = true;
  try {
    const { data } = await api.post('/reservations', { listingId: props.id, quantity: Number(form.quantity), slotStart: form.slotStart });
    router.push({ name: 'reservations', query: { reserved: data.id } });
  } catch (e) {
    serverErrors.value = fieldErrors(e);
    error.value = errorMessage(e);
    loadListing(); // stock may have changed under us
  } finally { busy.value = false; }
}
</script>
<template>
  <div class="mx-auto" style="max-width: 640px">
    <RouterLink :to="{ name: 'listing', params: { id } }">Back to listing</RouterLink>
    <h1 class="h3 mt-3">Reserve food</h1>
    <p v-if="loading" role="status">Loading listing…</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <ReliabilityNotice v-if="reliability" :reliability="reliability" />
    <form v-if="listing" class="bg-white border rounded-4 p-4" novalidate @submit.prevent="reserve">
      <h2 class="h4">{{ listing.itemName }}</h2>
      <p class="mb-1">{{ listing.bakery.name }} · {{ listing.address }}</p>
      <p class="mb-1">Pickup window: {{ formatWindow(listing.pickupStart, listing.pickupEnd) }} · {{ listing.slotMinutes }}-minute slots</p>
      <p><strong data-testid="reserve-available">{{ listing.quantityRemaining }}</strong> available · {{ listing.weightGramsPerUnit || 'Unknown' }} g per unit</p>
      <div v-if="unavailable" class="alert alert-warning">This listing is fully reserved, closed, or needs its unit weight added by the bakery.</div>
      <ReservationFields v-else v-model:quantity="form.quantity" v-model:slot-start="form.slotStart" id-prefix="reserve" :slots="slots" :max="max" :errors="errors" />
      <p class="small text-body-secondary">Show your reservation code at the counter during your slot. If you don't collect within 15 minutes after your slot ends, the food goes back on the board and counts as a missed pickup.</p>
      <button class="btn btn-primary" :disabled="busy || unavailable || reliabilityStops">{{ busy ? 'Reserving…' : 'Confirm reservation' }}</button>
    </form>
  </div>
</template>
