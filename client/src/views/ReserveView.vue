<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { api, errorMessage } from '../api';
import { formatWindow } from '../utils/time';
const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const listing = ref(null), quantity = ref(1), loading = ref(true), busy = ref(false), error = ref('');
const available = computed(() => listing.value?.phase !== 'ended' && listing.value?.quantityRemaining > 0 && listing.value?.weightGramsPerUnit);
onMounted(async () => {
  try { listing.value = (await api.get(`/listings/${props.id}`)).data; }
  catch (e) { error.value = errorMessage(e); }
  finally { loading.value = false; }
});
async function reserve() {
  busy.value = true; error.value = '';
  try {
    await api.post('/reservations', { listingId: props.id, quantity: Number(quantity.value) });
    router.push('/reservations');
  } catch (e) { error.value = errorMessage(e); }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="mx-auto" style="max-width: 600px">
    <RouterLink to="/browse">Back to browse</RouterLink>
    <h1 class="h3 mt-3">Reserve food</h1>
    <p v-if="loading" role="status">Loading listing…</p>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <form v-if="listing" class="bg-white border rounded-4 p-4" @submit.prevent="reserve">
      <h2 class="h4">{{ listing.itemName }}</h2>
      <p>{{ listing.bakery.name }} · {{ listing.address }}</p>
      <p>Pickup: {{ formatWindow(listing.pickupStart, listing.pickupEnd) }}</p>
      <p>{{ listing.quantityRemaining }} available · {{ listing.weightGramsPerUnit || 'Unknown' }} g per unit</p>
      <div v-if="!available" class="alert alert-warning">This listing is unavailable or needs its unit weight added by the bakery.</div>
      <label for="reserve-quantity" class="form-label">Quantity to reserve</label>
      <input id="reserve-quantity" v-model="quantity" class="form-control mb-3" type="number" min="1" :max="listing.quantityRemaining" step="1" required />
      <p class="small text-body-secondary">Collect during the pickup window. Your collection counts towards impact once the bakery confirms the handover.</p>
      <button class="btn btn-primary" :disabled="busy || !available">{{ busy ? 'Reserving…' : 'Confirm reservation' }}</button>
    </form>
  </div>
</template>
