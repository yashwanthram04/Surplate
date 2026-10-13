<script setup>
import { RouterLink } from 'vue-router';
import { formatWindow } from '../utils/time';
import CountdownRing from './CountdownRing.vue';

defineProps({
  listing: { type: Object, required: true },
  highlighted: Boolean,
});
defineEmits(['hover']);
</script>

<template>
  <article
    class="listing-card h-100 d-flex flex-column position-relative"
    :class="{ 'is-highlighted': highlighted }"
    :data-testid="`listing-card`"
    @mouseenter="$emit('hover', listing.id)"
    @mouseleave="$emit('hover', null)"
    @focusin="$emit('hover', listing.id)"
    @focusout="$emit('hover', null)"
  >
    <div class="position-relative">
      <img v-if="listing.photoUrl" class="photo" :src="listing.photoUrl" :alt="`Photo of ${listing.itemName}`" loading="lazy" />
      <div v-else class="photo-placeholder" aria-hidden="true">🥖</div>
      <div class="ring-badge"><CountdownRing :start="listing.pickupStart" :end="listing.pickupEnd" :size="54" /></div>
    </div>

    <div class="p-3 d-flex flex-column flex-grow-1">
      <h2 class="h6 mb-0">
        <RouterLink :to="{ name: 'listing', params: { id: listing.id } }" class="stretched-link text-decoration-none text-body">
          {{ listing.itemName }}
        </RouterLink>
      </h2>
      <div class="small text-body-secondary mb-2">
        {{ listing.bakery.name }}<template v-if="listing.distanceKm != null"> · {{ listing.distanceKm }} km away</template>
      </div>

      <div class="d-flex flex-wrap gap-1 mb-2">
        <span v-if="!listing.visibleToIndividuals" class="tag-pill charity-pill" data-testid="charities-only"><i class="bi bi-shield-check" aria-hidden="true"></i> Charities only</span>
        <span v-for="t in listing.dietaryTags" :key="t" class="tag-pill">{{ t }}</span>
      </div>
      <div v-if="listing.allergens.length" class="allergen-text mb-2">
        <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> Contains {{ listing.allergens.join(', ') }}
      </div>

      <div class="mt-auto small">
        <div><i class="bi bi-clock me-1" aria-hidden="true"></i>{{ formatWindow(listing.pickupStart, listing.pickupEnd) }}</div>
        <div class="fw-semibold mt-1">
          <i class="bi bi-bag-heart me-1" aria-hidden="true"></i>{{ listing.quantityRemaining }} left
          <span v-if="listing.quantityRemaining < listing.quantity" class="text-body-secondary fw-normal">of {{ listing.quantity }}</span>
        </div>
      </div>
    </div>
  </article>
</template>
