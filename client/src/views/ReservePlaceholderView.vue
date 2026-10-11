<script setup>
import { RouterLink } from 'vue-router';

// Integration point for the Reservations feature: the listing detail page links here with
// the listing id. Replace this view with the reservation form (quantity + collection slot).
defineProps({ id: { type: String, required: true } });
</script>

<template>
  <div class="text-center py-5" data-testid="reserve-placeholder">
    <div class="display-5 mb-2">🛍️</div>
    <h1 class="h4">Reservations are coming soon</h1>
    <p class="text-body-secondary">You will be able to reserve a quantity and pick a collection slot here.</p>
    <RouterLink :to="{ name: 'listing', params: { id } }" class="btn btn-primary">Back to the listing</RouterLink>
  </div>
</template>
