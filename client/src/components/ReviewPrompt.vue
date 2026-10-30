<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useReviews } from '../stores/reviews';
import { useSession } from '../stores/session';
import ReviewModal from './ReviewModal.vue';

// A friendly banner under the navigation bar after a recipient has collected food: "How was your sourdough?".
// It also hosts the thank-you form, which any page can open through the reviews store.
const session = useSession();
const reviews = useReviews();
const route = useRoute();

// Dismissals only last for this browser tab: a thank-you is worth asking for again tomorrow.
const dismissed = ref(read());
function read() {
  try { return JSON.parse(sessionStorage.getItem('surplate:dismissed-thanks')) ?? []; } catch { return []; }
}
function dismiss(id) {
  dismissed.value = [...dismissed.value, id];
  try { sessionStorage.setItem('surplate:dismissed-thanks', JSON.stringify(dismissed.value)); } catch { /* ignore */ }
}

const next = computed(() => reviews.pending.find((p) => !dismissed.value.includes(p.reservationId)));
// No banner on the wall of the bakery in question (it has its own prompt) or while the form is open.
const show = computed(() => !!next.value && !reviews.current && route.name !== 'reservations');

watch(() => session.user?.id, () => reviews.refresh(), { immediate: true });
watch(() => route.fullPath, () => reviews.refresh());
const timer = setInterval(() => reviews.refresh(), 120000);
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <Transition name="prompt">
    <!-- a floating toast, so it never pushes the page content down -->
    <div v-if="show" class="thanks-prompt thanks-toast" role="region" aria-label="Say thanks" data-testid="review-prompt">
      <span class="thanks-prompt-emoji" aria-hidden="true">💛</span>
      <div class="me-auto">
        <strong>How was your {{ next.itemName }}?</strong>
        <span class="d-none d-sm-block small text-body-secondary">
          Tell {{ next.bakeryName }} in a few seconds: their team reads every note.<template v-if="reviews.count > 1"> ({{ reviews.count }} pickups waiting)</template>
        </span>
      </div>
      <button type="button" class="btn btn-primary btn-sm" data-testid="open-review" @click="reviews.open(next)">Say thanks</button>
      <button type="button" class="btn-close" aria-label="Dismiss for now" @click="dismiss(next.reservationId)"></button>
    </div>
  </Transition>
  <ReviewModal v-if="reviews.current" :key="reviews.current.reservationId" :pickup="reviews.current" @close="reviews.close()" />
</template>
