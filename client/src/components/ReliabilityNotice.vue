<script setup>
import { computed } from 'vue';
// The recipient's reliability score (GET /api/reservations/reliability) and what it allows.
const props = defineProps({ reliability: { type: Object, required: true } });
const r = computed(() => props.reliability);
const tone = computed(() => ({ good: 'alert-light border', limited: 'alert-warning', blocked: 'alert-danger' })[r.value.level]);
</script>

<template>
  <div class="alert" :class="tone" role="status" data-testid="reliability">
    <strong>Reliability score: {{ r.score }}%</strong>
    <span class="text-body-secondary"> · {{ r.recent ? `${r.collected} of ${r.recent} recent ${r.recent === 1 ? 'pickup' : 'pickups'} collected` : 'no finished pickups yet' }}</span>
    <div class="small mt-1">
      <template v-if="r.level === 'blocked'">You can't reserve right now because of missed pickups. Missed pickups stop counting after {{ r.rules.days }} days.</template>
      <template v-else-if="r.level === 'limited'">You can hold {{ r.maxActive }} reservation at a time until your score is back to {{ r.rules.limitedBelow }}% or more.</template>
      <template v-else>Collect within your slot to keep it up. Missed pickups lower your score and can limit reservations.</template>
    </div>
  </div>
</template>
