<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import { useSession } from '../stores/session';
import { TIERS, scoreTone, timeAgo } from '../utils/reviews';
import AppealStatus from './AppealStatus.vue';
import ReliabilityGauge from './ReliabilityGauge.vue';
import StarRating from './StarRating.vue';

// "My reliability" on the account page. Recipients see how their score is built (pickups + punctuality ratings from
// bakeries) and any block or appeal; bakeries see the reputation their recipients' reviews give them.
const session = useSession();
const data = ref(null);
const error = ref('');
const ready = ref(false); // flips on after the first paint so the bars grow from zero

async function load() {
  try {
    data.value = (await api.get('/reviews/me')).data;
  } catch (e) {
    error.value = errorMessage(e);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => (ready.value = true)));
}
onMounted(load);

const isBakery = computed(() => session.isBakery);
const rep = computed(() => data.value?.reputation);
const rel = computed(() => data.value?.reliability);
const tier = computed(() => TIERS[rep.value?.tier] ?? TIERS.new);

// The parts of a recipient's score, with the weight each carries.
const parts = computed(() => {
  if (!rel.value) return [];
  const p = rel.value.punctuality;
  return [
    { key: 'pickups', label: 'Pickups collected', weight: 80, value: rel.value.pickupScore, note: rel.value.recent ? `${rel.value.collected} of ${rel.value.recent} recent pickups` : 'No finished pickups yet' },
    { key: 'punctuality', label: 'Punctuality (from bakeries)', weight: 20, value: p?.counted ? p.percent : null,
      note: p ? (p.counted ? `${p.average}/5 from ${p.count} ratings` : `${p.count} of 3 ratings so far`) : 'Not rated yet' },
  ];
});
</script>

<template>
  <section class="reliability-panel bg-white border rounded-4 p-3 p-md-4 mb-4" aria-labelledby="reliability-title" data-testid="reliability-panel">
    <h2 id="reliability-title" class="h5 mb-3">{{ isBakery ? 'Your reputation' : 'Your reliability' }}</h2>
    <div v-if="error" class="alert alert-danger py-2" role="alert">{{ error }}</div>
    <div v-else-if="!data" class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <!-- bakery -->
    <div v-else-if="isBakery" class="d-flex flex-wrap align-items-center gap-4">
      <ReliabilityGauge :score="rep.score" :size="118" label="Reliability" />
      <div class="flex-grow-1">
        <span class="tier-badge" :class="`tier-${rep.tier}`" data-testid="tier"><i class="bi" :class="tier.icon" aria-hidden="true"></i> {{ tier.label }}</span>
        <p class="small text-body-secondary mt-2 mb-2">
          <template v-if="rep.score == null">You need {{ rep.rules.minReviews }} thank-you notes before a score shows: you have {{ rep.thankYouCount }}.</template>
          <template v-else>Built from your recipients' notes: {{ Math.round(rep.rules.accuracyWeight * 100) }}% how accurate your listings were, {{ 100 - Math.round(rep.rules.accuracyWeight * 100) }}% how good the food was.</template>
        </p>
        <div class="d-flex flex-wrap gap-3 small">
          <span>Food <StarRating :model-value="rep.foodAverage ?? 0" readonly size="sm" label="Average food rating" /> <strong>{{ rep.foodAverage ?? '–' }}</strong></span>
          <span>Accuracy <StarRating :model-value="rep.accuracyAverage ?? 0" readonly size="sm" label="Average accuracy rating" /> <strong>{{ rep.accuracyAverage ?? '–' }}</strong></span>
        </div>
        <RouterLink :to="{ name: 'bakery-wall', params: { id: session.user.id } }" class="btn btn-sm btn-outline-primary mt-3"><i class="bi bi-chat-heart me-1" aria-hidden="true"></i>Open your Thank-you Wall ({{ rep.thankYouCount }})</RouterLink>
      </div>
    </div>

    <!-- recipient -->
    <template v-else>
      <div class="d-flex flex-wrap align-items-center gap-4">
        <ReliabilityGauge :score="rel.score" :size="118" label="Reliability" />
        <div class="flex-grow-1" style="min-width: 220px">
          <div v-for="p in parts" :key="p.key" class="part mb-3">
            <div class="d-flex justify-content-between small"><span class="fw-semibold">{{ p.label }} <span class="text-body-secondary fw-normal">· {{ p.weight }}% of score</span></span><span>{{ p.value == null ? '–' : `${p.value}%` }}</span></div>
            <div class="meter" :class="`meter-${scoreTone(p.value)}`" role="img" :aria-label="`${p.label}: ${p.value == null ? 'not enough data' : p.value + '%'}`"><div :style="{ width: ready && p.value != null ? `${p.value}%` : '0%' }"></div></div>
            <div class="small text-body-secondary">{{ p.note }}</div>
          </div>
        </div>
      </div>
      <AppealStatus :reliability="rel" :appeal="data.appeal" class="mt-3" />
      <div v-if="data.ratings.length" class="mt-3">
        <h3 class="h6">Recent ratings from bakeries</h3>
        <ul class="list-unstyled mb-0 small">
          <li v-for="r in data.ratings" :key="r.id" class="d-flex flex-wrap align-items-center gap-2 py-1 border-top">
            <StarRating :model-value="r.punctuality" readonly size="sm" label="Punctuality" />
            <span><strong>{{ r.bakeryName }}</strong><span v-if="r.comment"> · “{{ r.comment }}”</span></span>
            <span class="ms-auto text-body-secondary">{{ timeAgo(r.createdAt) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
