<script setup>
import { computed } from 'vue';
import AppealStatus from './AppealStatus.vue'; // REVIEWS FEATURE
import ReliabilityGauge from './ReliabilityGauge.vue'; // REVIEWS FEATURE
// The recipient's reliability score (GET /api/reservations/reliability) and what it allows.
const props = defineProps({ reliability: { type: Object, required: true } });
const r = computed(() => props.reliability);
const tone = computed(() => ({ good: 'alert-light border', limited: 'alert-warning', blocked: 'alert-danger' })[r.value.level]);
</script>

<template>
  <div class="alert reliability-notice" :class="tone" role="status" data-testid="reliability">
    <!-- REVIEWS FEATURE: the score as an animated gauge, with the punctuality ratings and any block appeal -->
    <ReliabilityGauge :score="r.score" :size="84" />
    <div class="flex-grow-1">
      <strong>Reliability score: {{ r.score }}%</strong>
      <span class="text-body-secondary"> · {{ r.recent ? `${r.collected} of ${r.recent} recent ${r.recent === 1 ? 'pickup' : 'pickups'} collected` : 'no finished pickups yet' }}</span>
      <div class="small mt-1">
        <template v-if="r.level === 'blocked'">You can't reserve right now because of missed pickups. Missed pickups stop counting after {{ r.rules.days }} days.</template>
        <template v-else-if="r.level === 'limited'">You can hold {{ r.maxActive }} reservation at a time until your score is back to {{ r.rules.limitedBelow }}% or more.</template>
        <template v-else>Collect within your slot to keep it up. Missed pickups lower your score and can limit reservations.</template>
      </div>
      <div v-if="r.punctuality" class="small mt-1 text-body-secondary" data-testid="punctuality-note">
        <i class="bi bi-stopwatch me-1" aria-hidden="true"></i>Bakeries rate your punctuality {{ r.punctuality.average }}/5 ({{ r.punctuality.count }}
        {{ r.punctuality.count === 1 ? 'rating' : 'ratings' }}<template v-if="!r.punctuality.counted">, counted once you have 3</template>).
      </div>
      <AppealStatus :reliability="r" :appeal="r.appeal ?? null" />
    </div>
  </div>
</template>
