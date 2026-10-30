<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import CountUp from '../components/home/CountUp.vue';
import ReliabilityGauge from '../components/ReliabilityGauge.vue';
import StarRating from '../components/StarRating.vue';
import ThankYouNote from '../components/ThankYouNote.vue';
import { useReviews } from '../stores/reviews';
import { useSession } from '../stores/session';
import { burst } from '../utils/confetti';
import { TIERS, scoreTone } from '../utils/reviews';

// A bakery's public Thank-you Wall: its reliability, the totals, and every note recipients have left, pinned
// ones first. The bakery's own staff see pin and reply controls on each note.
const props = defineProps({ id: { type: String, required: true } });
const session = useSession();
const reviews = useReviews();

const bakery = ref(null);
const reputation = ref(null);
const notes = ref([]);
const page = ref(1);
const total = ref(0);
const pageSize = ref(12);
const pinLimit = ref(3);
const loading = ref(true);
const loadingMore = ref(false);
const notFound = ref(false);
const error = ref('');
const filter = ref('all');
const busy = ref(false);
const actionError = ref('');
const toRate = ref(0);
const barsReady = ref(false);

const isOwner = computed(() => session.user?.id === props.id && session.isBakery);
const tier = computed(() => TIERS[reputation.value?.tier] ?? TIERS.new);
const pinsLeft = computed(() => pinLimit.value - notes.value.filter((n) => n.pinned).length);
const waiting = computed(() => reviews.pending.find((p) => p.bakeryId === props.id));
const hasMore = computed(() => notes.value.length < total.value);

const FILTERS = computed(() => [
  { key: 'all', label: 'All notes', count: notes.value.length },
  { key: 'pinned', label: 'Pinned', count: notes.value.filter((n) => n.pinned).length },
  { key: 'charity', label: 'From charities', count: notes.value.filter((n) => n.authorRole === 'charity').length },
]);
const shown = computed(() => notes.value.filter((n) => (filter.value === 'pinned' ? n.pinned : filter.value === 'charity' ? n.authorRole === 'charity' : true)));
const maxStar = computed(() => Math.max(1, ...Object.values(reputation.value?.stars ?? {})));

async function load() {
  loading.value = true;
  notFound.value = false;
  error.value = '';
  barsReady.value = false;
  filter.value = 'all';
  try {
    const { data } = await api.get(`/reviews/bakery/${props.id}`, { params: { page: 1 } });
    bakery.value = data.bakery;
    reputation.value = data.reputation;
    notes.value = data.items;
    page.value = data.page;
    total.value = data.total;
    pageSize.value = data.pageSize;
    pinLimit.value = data.pinLimit;
    document.title = `${data.bakery.name}’s Thank-you Wall – Surplate`;
    if (isOwner.value) loadToRate();
  } catch (e) {
    if (e.response?.status === 404) notFound.value = true;
    else error.value = errorMessage(e);
  } finally {
    loading.value = false;
    await nextTick();
    requestAnimationFrame(() => requestAnimationFrame(() => (barsReady.value = true)));
  }
}
async function loadToRate() {
  try { toRate.value = (await api.get('/reviews/to-rate')).data.count; } catch { /* the button just shows no count */ }
}
async function more() {
  loadingMore.value = true;
  try {
    const { data } = await api.get(`/reviews/bakery/${props.id}`, { params: { page: page.value + 1 } });
    const seen = new Set(notes.value.map((n) => n.id));
    notes.value = [...notes.value, ...data.items.filter((n) => !seen.has(n.id))];
    page.value = data.page;
  } catch (e) {
    actionError.value = errorMessage(e);
  } finally {
    loadingMore.value = false;
  }
}

// ---- staff actions ----------------------------------------------------------------------------
/** Pinned notes first (newest pin on top), then everything else newest first. */
function place(updated) {
  const rest = notes.value.filter((n) => n.id !== updated.id);
  const pinned = [...(updated.pinned ? [updated] : []), ...rest.filter((n) => n.pinned)];
  const others = [...rest.filter((n) => !n.pinned), ...(updated.pinned ? [] : [updated])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  notes.value = [...pinned, ...others];
}
async function togglePin(note, event) {
  busy.value = true;
  actionError.value = '';
  try {
    const { data } = await api.patch(`/reviews/${note.id}/pin`, { pinned: !note.pinned });
    place(data);
    if (data.pinned) burst(event?.target, { emojis: ['📌', '✨', '💛'], count: 12, spread: 140 });
  } catch (e) {
    actionError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
async function reply(note, text, done) {
  busy.value = true;
  actionError.value = '';
  try {
    const { data } = await api.put(`/reviews/${note.id}/reply`, { text });
    notes.value = notes.value.map((n) => (n.id === data.id ? data : n));
    done();
  } catch (e) {
    actionError.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}

watch(() => props.id, load);
onMounted(load);
</script>

<template>
  <div class="mx-auto wall" style="max-width: 1150px">
    <RouterLink to="/browse" class="text-decoration-none small"><i class="bi bi-arrow-left" aria-hidden="true"></i> Browse food</RouterLink>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <div v-else-if="notFound" class="text-center py-5" data-testid="not-found">
      <div class="display-5 mb-2" aria-hidden="true">🥖</div>
      <h1 class="h4">We couldn’t find that bakery</h1>
      <RouterLink to="/browse" class="btn btn-primary mt-2">Browse available food</RouterLink>
    </div>

    <div v-else-if="error" class="alert alert-danger mt-3" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button></div>

    <template v-else-if="bakery">
      <!-- hero -->
      <header class="wall-hero mt-3">
        <span class="blob blob-a" aria-hidden="true"></span>
        <span class="blob blob-b" aria-hidden="true"></span>
        <div class="row g-4 align-items-center position-relative">
          <div class="col-12 col-md">
            <div class="section-kicker">Thank-you Wall</div>
            <h1 class="font-display wall-title" data-testid="wall-title">{{ bakery.name }}</h1>
            <div v-if="bakery.address" class="text-body-secondary mb-3"><i class="bi bi-geo-alt me-1" aria-hidden="true"></i>{{ bakery.address }}</div>
            <span class="tier-badge" :class="`tier-${reputation.tier}`" data-testid="tier"><i class="bi" :class="tier.icon" aria-hidden="true"></i> {{ tier.label }}</span>
            <div v-if="isOwner" class="d-flex flex-wrap gap-2 mt-3">
              <RouterLink to="/ratings" class="btn btn-primary lift" data-testid="rate-customers-link">
                <i class="bi bi-stopwatch me-1" aria-hidden="true"></i>Rate customers<span v-if="toRate" class="badge text-bg-light ms-2" data-testid="to-rate-count">{{ toRate }}</span>
              </RouterLink>
              <span class="small text-body-secondary align-self-center">Pin up to {{ pinLimit }} favourites and reply to any note.</span>
            </div>
          </div>
          <div class="col-12 col-md-auto d-flex justify-content-center">
            <ReliabilityGauge :score="reputation.score" :size="150" label="Bakery reliability" />
          </div>
        </div>
      </header>

      <!-- numbers -->
      <div class="row g-3 mt-1">
        <div class="col-6 col-lg-3"><div class="wall-stat"><div class="wall-stat-number"><CountUp :value="reputation.thankYouCount" /></div><div class="small text-body-secondary">thank-you notes</div></div></div>
        <div class="col-6 col-lg-3"><div class="wall-stat"><div class="wall-stat-number"><CountUp :value="reputation.peopleServed" /></div><div class="small text-body-secondary">people reached through charities</div></div></div>
        <div class="col-6 col-lg-3">
          <div class="wall-stat"><div class="wall-stat-number" data-testid="food-average">{{ reputation.foodAverage ?? '–' }}</div>
            <StarRating :model-value="reputation.foodAverage ?? 0" readonly size="sm" label="Average food rating" /><div class="small text-body-secondary">food</div></div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="wall-stat"><div class="wall-stat-number">{{ reputation.accuracyAverage ?? '–' }}</div>
            <StarRating :model-value="reputation.accuracyAverage ?? 0" readonly size="sm" label="Average accuracy rating" /><div class="small text-body-secondary">listings as described</div></div>
        </div>
      </div>

      <div class="row g-3 mt-1">
        <div class="col-12 col-lg-5">
          <div class="bg-white border rounded-4 p-3 h-100">
            <h2 class="h6 mb-3">Food ratings</h2>
            <div v-for="s in [5, 4, 3, 2, 1]" :key="s" class="d-flex align-items-center gap-2 mb-1 small">
              <span class="text-nowrap" style="width: 2.2rem">{{ s }} <i class="bi bi-star-fill text-warning" aria-hidden="true"></i></span>
              <div class="meter flex-grow-1" :class="`meter-${s >= 4 ? 'good' : s === 3 ? 'warn' : 'bad'}`" role="img" :aria-label="`${reputation.stars[s]} ${s}-star ratings`"><div :style="{ width: barsReady ? `${(reputation.stars[s] / maxStar) * 100}%` : '0%', transitionDelay: `${(5 - s) * 90}ms` }"></div></div>
              <span class="text-end" style="width: 1.6rem">{{ reputation.stars[s] }}</span>
            </div>
          </div>
        </div>
        <div class="col-12 col-lg-7">
          <div class="bg-white border rounded-4 p-3 h-100 small">
            <h2 class="h6">How the reliability score works</h2>
            <p class="mb-1">It comes from the notes recipients leave after collecting: <strong>{{ Math.round(reputation.rules.accuracyWeight * 100) }}%</strong> how accurate the listing was and <strong>{{ 100 - Math.round(reputation.rules.accuracyWeight * 100) }}%</strong> how good the food was, each from 1 to 5 stars.</p>
            <p class="mb-0 text-body-secondary">A score appears after {{ reputation.rules.minReviews }} notes. <span :class="`score-${scoreTone(reputation.score)}`">80+ is green</span>, 50–79 amber, below 50 red.</p>
          </div>
        </div>
      </div>

      <!-- a recipient with a pickup from this bakery waiting for a note -->
      <div v-if="waiting" class="thanks-prompt mt-3" data-testid="wall-prompt">
        <span class="thanks-prompt-emoji" aria-hidden="true">💛</span>
        <div class="me-auto"><strong>You collected {{ waiting.itemName }} here.</strong><span class="d-block small text-body-secondary">Leave a thank-you and it appears on this wall.</span></div>
        <button type="button" class="btn btn-primary btn-sm" @click="reviews.open(waiting)">Say thanks</button>
      </div>

      <!-- the wall -->
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-4 mb-3">
        <h2 class="h4 font-display mb-0">What people are saying</h2>
        <div class="d-flex flex-wrap gap-1" role="group" aria-label="Filter notes">
          <button v-for="f in FILTERS" :key="f.key" type="button" class="chip btn btn-sm" :class="filter === f.key ? 'btn-primary' : 'btn-outline-secondary'" :aria-pressed="filter === f.key" :data-testid="`filter-${f.key}`" @click="filter = f.key">
            {{ f.label }} <span class="opacity-75">{{ f.count }}</span>
          </button>
        </div>
      </div>
      <div v-if="actionError" class="alert alert-danger py-2" role="alert">{{ actionError }}</div>

      <div v-if="!notes.length" class="wall-empty text-center py-5" data-testid="empty-wall">
        <div class="floaty" aria-hidden="true"><span>💛</span><span>🥐</span><span>💛</span></div>
        <h3 class="h5 mt-3">No thank-yous yet</h3>
        <p class="text-body-secondary mb-0">Notes appear here after people collect food from {{ bakery.name }}.</p>
      </div>
      <p v-else-if="!shown.length" class="text-body-secondary py-4 text-center">No notes match this filter yet.</p>

      <TransitionGroup v-else name="note" tag="div" class="wall-grid">
        <ThankYouNote v-for="(n, i) in shown" :key="n.id" :note="n" :index="i" :manage="isOwner" :pins-left="pinsLeft" :busy="busy" @pin="togglePin" @reply="reply" />
      </TransitionGroup>

      <div v-if="hasMore" class="text-center mt-4">
        <button type="button" class="btn btn-outline-primary" :disabled="loadingMore" data-testid="more-notes" @click="more">
          <span v-if="loadingMore" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Show more notes ({{ total - notes.length }} more)
        </button>
      </div>
    </template>
  </div>
</template>
