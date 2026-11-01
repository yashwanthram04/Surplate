<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { now } from '../composables/useNow';
import { isStale, timeAgo } from '../utils/fridge';
import FridgeStatusBadge from './FridgeStatusBadge.vue';

const props = defineProps({
  fridge: { type: Object, required: true },
  highlighted: Boolean,
});
// true when the last update is under an hour old (shows a small pulsing green dot)
const isLive = computed(() => !!props.fridge.latestUpdateAt && now.value - new Date(props.fridge.latestUpdateAt).getTime() < 60 * 60 * 1000);
defineEmits(['hover']);
</script>

<template>
  <article
    class="listing-card fridge-card h-100 d-flex flex-column position-relative"
    :class="[`status-${fridge.latestStatus || 'unknown'}`, { 'is-highlighted': highlighted }]"
    data-testid="fridge-card"
    @mouseenter="$emit('hover', fridge.id)"
    @mouseleave="$emit('hover', null)"
    @focusin="$emit('hover', fridge.id)"
    @focusout="$emit('hover', null)"
  >
    <img v-if="fridge.photoUrl" class="photo" :src="fridge.photoUrl" :alt="`Photo of ${fridge.name}`" loading="lazy" />
    <div v-else class="photo-placeholder" aria-hidden="true">🧊</div>

    <div class="p-3 d-flex flex-column flex-grow-1">
      <h2 class="h6 mb-0">
        <RouterLink :to="{ name: 'fridge', params: { id: fridge.id } }" class="stretched-link text-decoration-none text-body">{{ fridge.name }}</RouterLink>
      </h2>
      <div class="small text-body-secondary mb-2">
        Community fridge<template v-if="fridge.distanceKm != null"> · {{ fridge.distanceKm }} km away</template>
      </div>

      <div class="d-flex flex-wrap align-items-center gap-1 mb-2">
        <FridgeStatusBadge :status="fridge.latestStatus" />
        <span v-if="fridge.openSpoiledReports" class="tag-pill charity-pill" data-testid="spoiled-pill"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> Spoiled food reported</span>
      </div>
      <p v-if="fridge.latestNote" class="fridge-note small mb-2">“{{ fridge.latestNote }}”</p>

      <div class="mt-auto small">
        <div data-testid="last-updated">
          <span v-if="isLive" class="live-dot" aria-hidden="true"></span><i v-else class="bi bi-clock me-1" aria-hidden="true"></i><!-- pulsing dot when fresh -->
          <template v-if="fridge.latestUpdateAt">
            Updated {{ timeAgo(fridge.latestUpdateAt, now) }}<span v-if="isStale(fridge.latestUpdateAt, now)" class="text-body-secondary"> · may be out of date</span>
          </template>
          <template v-else>No updates yet</template>
        </div>
        <div class="mt-1"><i class="bi bi-door-open me-1" aria-hidden="true"></i>{{ fridge.openingHours }}</div>
      </div>
    </div>
  </article>
</template>
