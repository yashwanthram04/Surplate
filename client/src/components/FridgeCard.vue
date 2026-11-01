<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { vTilt } from '../composables/useFridgeMotion';
import { now } from '../composables/useNow';
import { isStale, timeAgo } from '../utils/fridge';
import FridgeMascot from './FridgeMascot.vue';
import FridgeStatusBadge from './FridgeStatusBadge.vue';

const props = defineProps({
  fridge: { type: Object, required: true },
  highlighted: Boolean,
});
defineEmits(['hover']);

const isLive = computed(() => !!props.fridge.latestUpdateAt && now.value - new Date(props.fridge.latestUpdateAt).getTime() < 60 * 60 * 1000);
</script>

<template>
  <article
    v-tilt
    class="listing-card fridge-card h-100 d-flex flex-column position-relative"
    :class="[`status-${fridge.latestStatus || 'unknown'}`, { 'is-highlighted': highlighted }]"
    data-testid="fridge-card"
    @mouseenter="$emit('hover', fridge.id)"
    @mouseleave="$emit('hover', null)"
    @focusin="$emit('hover', fridge.id)"
    @focusout="$emit('hover', null)"
  >
    <div class="fridge-card-media">
      <img v-if="fridge.photoUrl" class="photo" :src="fridge.photoUrl" :alt="`Photo of ${fridge.name}`" loading="lazy" />
      <div v-else class="photo-placeholder" aria-hidden="true"><FridgeMascot :mood="fridge.latestStatus || 'unknown'" :size="104" /></div>
      <FridgeStatusBadge class="card-status-chip" :status="fridge.latestStatus" />
    </div>

    <div class="p-3 d-flex flex-column flex-grow-1">
      <h2 class="h6 mb-0">
        <RouterLink :to="{ name: 'fridge', params: { id: fridge.id } }" class="stretched-link text-decoration-none text-body">{{ fridge.name }}</RouterLink>
      </h2>
      <div class="small text-body-secondary mb-2">
        Community fridge<template v-if="fridge.distanceKm != null"> · {{ fridge.distanceKm }} km away</template>
      </div>

      <div v-if="fridge.openSpoiledReports" class="d-flex flex-wrap align-items-center gap-1 mb-2">
        <span class="tag-pill charity-pill" data-testid="spoiled-pill"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> Spoiled food reported</span>
      </div>
      <p v-if="fridge.latestNote" class="fridge-note small mb-2">“{{ fridge.latestNote }}”</p>

      <div class="mt-auto small">
        <div data-testid="last-updated">
          <span v-if="isLive" class="live-dot" aria-hidden="true"></span><i v-else class="bi bi-clock me-1" aria-hidden="true"></i>
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
