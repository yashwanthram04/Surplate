<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import StarRating from '../components/StarRating.vue';
import { useSession } from '../stores/session';
import { formatSlot } from '../utils/slots';
import { burst } from '../utils/confetti';
import { LIMITS, PUNCTUALITY_LABELS, initialOf, timeAgo } from '../utils/reviews';

// Bakery staff rate the customers they handed food to: how punctual were they? Ratings feed the customer's
// reliability score. Each card flies off the list once rated, and a progress bar fills as the queue empties.
const session = useSession();
const items = ref([]);
const total = ref(0); // how many were waiting when the page opened, for the progress bar
const loading = ref(true);
const error = ref('');
const drafts = reactive({});
const rated = ref(0);

const progress = computed(() => (total.value ? Math.round((rated.value / total.value) * 100) : 100));
// Created when the list loads (never while rendering), one per customer.
const draft = (id) => drafts[id];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/reviews/to-rate');
    for (const i of data.items) drafts[i.reservationId] = { punctuality: 0, comment: '', busy: false, error: '', done: false };
    items.value = data.items;
    total.value = data.items.length;
    rated.value = 0;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function submit(item, event) {
  const d = draft(item.reservationId);
  d.error = '';
  if (!d.punctuality) { d.error = 'Choose a star rating first.'; return; }
  if (d.comment.trim().length > LIMITS.commentMax) { d.error = `Keep the comment under ${LIMITS.commentMax} characters.`; return; }
  d.busy = true;
  try {
    await api.post('/reviews/rate', { reservationId: item.reservationId, punctuality: d.punctuality, comment: d.comment });
    d.done = true;
    rated.value++;
    burst(event.target, { emojis: ['⭐', '✨', '👍'], count: 10, spread: 130 });
    setTimeout(() => (items.value = items.value.filter((i) => i.reservationId !== item.reservationId)), 650);
  } catch (e) {
    d.error = fieldErrors(e).punctuality || fieldErrors(e).comment || errorMessage(e);
    if (e.response?.status === 409) setTimeout(() => (items.value = items.value.filter((i) => i.reservationId !== item.reservationId)), 1500);
  } finally {
    d.busy = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="mx-auto" style="max-width: 820px">
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
      <h1 class="h3 mb-1">Rate your customers</h1>
      <RouterLink :to="{ name: 'bakery-wall', params: { id: session.user.id } }" class="btn btn-outline-secondary btn-sm"><i class="bi bi-chat-heart me-1" aria-hidden="true"></i>Your Thank-you Wall</RouterLink>
    </div>
    <p class="text-body-secondary">Were they on time for their slot? Your rating counts for 20% of the customer’s reliability score, and helps other bakeries know who to count on. Only collected pickups from the last 30 days can be rated.</p>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button></div>
    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <template v-else-if="!error">
      <div v-if="total" class="rate-progress mb-3" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Customers rated">
        <div :style="{ width: `${progress}%` }"></div>
        <span>{{ rated }} of {{ total }} rated</span>
      </div>

      <div v-if="!items.length" class="text-center py-5 bg-white border rounded-4" data-testid="all-rated">
        <div class="display-5 mb-2 pop" aria-hidden="true">✨</div>
        <h2 class="h5">{{ total ? 'All caught up!' : 'Nobody to rate right now' }}</h2>
        <p class="text-body-secondary mb-0">{{ total ? 'Thank you: that helps everyone on Surplate know who is reliable.' : 'Customers appear here after you confirm their collection.' }}</p>
      </div>

      <TransitionGroup name="rate" tag="div" class="rate-list d-grid gap-3">
        <article v-for="item in items" :key="item.reservationId" class="rate-card" :class="{ 'is-done': draft(item.reservationId).done }" data-testid="rate-card">
          <div class="d-flex align-items-center gap-3 mb-2">
            <span class="note-avatar lg" aria-hidden="true">{{ initialOf(item.recipientName) }}</span>
            <div class="me-auto">
              <div class="fw-semibold">{{ item.recipientName }} <span class="badge text-bg-light border fw-normal">{{ item.recipientRole }}</span></div>
              <div class="small text-body-secondary">{{ item.quantity }} × {{ item.itemName }} · slot {{ formatSlot(item.slotStart, item.slotEnd) }} · collected {{ timeAgo(item.collectedAt) }}</div>
            </div>
          </div>
          <div v-if="draft(item.reservationId).done" class="text-success fw-semibold py-2"><i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>Rated, thank you!</div>
          <form v-else novalidate @submit.prevent="submit(item, $event)">
            <div class="form-label small fw-semibold mb-1">How punctual were they?</div>
            <StarRating v-model="draft(item.reservationId).punctuality" :label="`Punctuality for ${item.recipientName}`" :labels="PUNCTUALITY_LABELS" />
            <div class="mt-2">
              <label :for="`c-${item.reservationId}`" class="visually-hidden">Comment (optional)</label>
              <input :id="`c-${item.reservationId}`" v-model="draft(item.reservationId).comment" class="form-control form-control-sm" placeholder="Optional comment, e.g. “Right on time, very polite”" :maxlength="LIMITS.commentMax + 20" />
            </div>
            <div v-if="draft(item.reservationId).error" class="text-danger small mt-1" role="alert">{{ draft(item.reservationId).error }}</div>
            <div class="d-flex justify-content-end mt-2">
              <button class="btn btn-primary btn-sm" :disabled="draft(item.reservationId).busy" data-testid="submit-rating">
                <span v-if="draft(item.reservationId).busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Submit rating
              </button>
            </div>
          </form>
        </article>
      </TransitionGroup>
    </template>
  </div>
</template>
