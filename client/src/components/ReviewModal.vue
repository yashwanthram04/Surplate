<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Motion } from 'motion-v';
import { useRouter } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import { useReviews } from '../stores/reviews';
import { useSession } from '../stores/session';
import { burst } from '../utils/confetti';
import { ACCURACY_LABELS, COMPLIMENTS, FOOD_LABELS, LIMITS, MOODS, defaultNickname, reviewErrors } from '../utils/reviews';
import StarRating from './StarRating.vue';
import ThankYouNote from './ThankYouNote.vue';

// "Say thanks": rate the food and the listing, write a short note and see it on a live preview of the sticky note
// before it goes on the bakery's wall. Charities can thank on behalf of the people they serve.
const props = defineProps({ pickup: { type: Object, required: true } });
const emit = defineEmits(['close']);

const session = useSession();
const reviews = useReviews();
const router = useRouter();
const isCharity = computed(() => session.isCharity);

const form = reactive({ foodRating: 0, accuracyRating: 0, note: '', nickname: '', onBehalf: false, onBehalfOf: '', peopleServed: '' });
const submitted = ref(false);
const serverErrors = reactive({});
const failure = ref('');
const busy = ref(false);
const posted = ref(null); // the saved note once it is on the wall
const submitBtn = ref(null);
const dialog = ref(null);

const clientErrors = computed(() => reviewErrors(form, { isCharity: isCharity.value }));
const err = (field) => serverErrors[field] || (submitted.value ? clientErrors.value[field] : '') || '';

const mood = computed(() => MOODS[Math.round((form.foodRating + form.accuracyRating) / (form.foodRating && form.accuracyRating ? 2 : 1))] ?? MOODS[0]);
const nicknameHint = computed(() => defaultNickname(session.user));
const preview = computed(() => ({
  id: 'preview', bakeryId: '', nickname: form.nickname.trim() || nicknameHint.value, note: form.note.trim() || 'Your note will appear here…',
  itemName: props.pickup.itemName, foodRating: form.foodRating, accuracyRating: form.accuracyRating, authorRole: session.user.role,
  onBehalfOf: isCharity.value && form.onBehalf ? form.onBehalfOf.trim() || 'the people we serve' : null,
  peopleServed: isCharity.value && form.onBehalf && form.peopleServed ? Number(form.peopleServed) : null,
  pinned: false, reply: null, mine: false, createdAt: new Date().toISOString(),
}));

// The ring around the character count: fills as the note grows, amber near the limit, red over it.
const RING = 2 * Math.PI * 11;
const used = computed(() => form.note.length);
const ringOffset = computed(() => RING * (1 - Math.min(1, used.value / LIMITS.noteMax)));
const ringTone = computed(() => (used.value > LIMITS.noteMax ? 'over' : used.value > LIMITS.noteMax * 0.85 ? 'near' : 'ok'));

function toggleCompliment(text) {
  const parts = form.note.split(/,\s*/).filter(Boolean);
  const at = parts.indexOf(text);
  if (at >= 0) parts.splice(at, 1);
  else if ([...parts, text].join(', ').length <= LIMITS.noteMax) parts.push(text);
  form.note = parts.join(', ');
}
const hasCompliment = (text) => form.note.split(/,\s*/).includes(text);

async function submit() {
  submitted.value = true;
  failure.value = '';
  for (const k of Object.keys(serverErrors)) delete serverErrors[k];
  if (Object.keys(clientErrors.value).length) return;
  busy.value = true;
  try {
    const { data } = await api.post('/reviews', {
      reservationId: props.pickup.reservationId, note: form.note, foodRating: form.foodRating, accuracyRating: form.accuracyRating, nickname: form.nickname,
      ...(isCharity.value && form.onBehalf ? { onBehalfOf: form.onBehalfOf, peopleServed: form.peopleServed === '' ? undefined : Number(form.peopleServed) } : {}),
    });
    posted.value = data;
    await nextTick();
    burst(dialog.value?.querySelector('[data-testid="posted-check"]'));
    reviews.posted(data);
  } catch (e) {
    Object.assign(serverErrors, fieldErrors(e));
    failure.value = Object.keys(fieldErrors(e)).length ? '' : errorMessage(e);
    if (e.response?.status === 409) reviews.refresh();
  } finally {
    busy.value = false;
  }
}

function seeWall() {
  emit('close');
  router.push({ name: 'bakery-wall', params: { id: posted.value.bakeryId } });
}

const onKey = (e) => e.key === 'Escape' && !busy.value && emit('close');
onMounted(async () => {
  document.addEventListener('keydown', onKey);
  await nextTick();
  dialog.value?.focus();
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="modal-backdrop-sp" @mousedown.self="!busy && emit('close')">
    <Motion
      :initial="{ opacity: 0, scale: 0.92, y: 24 }"
      :animate="{ opacity: 1, scale: 1, y: 0 }"
      :transition="{ type: 'spring', stiffness: 300, damping: 26 }"
      class="modal-card review-modal"
    >
      <div ref="dialog" class="p-3 p-md-4" role="dialog" aria-modal="true" aria-labelledby="review-title" tabindex="-1" data-testid="review-modal">
        <!-- success -->
        <div v-if="posted" class="text-center py-4 posted">
          <div class="posted-check" data-testid="posted-check" aria-hidden="true"><i class="bi bi-check-lg"></i></div>
          <h2 id="review-title" class="h4 mt-3">Thank you!</h2>
          <p class="text-body-secondary mb-4">Your note is now on <strong>{{ pickup.bakeryName }}</strong>’s Thank-you Wall, where their team will read it.</p>
          <div class="posted-note mx-auto mb-4"><ThankYouNote :note="posted" preview /></div>
          <div class="d-flex justify-content-center gap-2 flex-wrap">
            <button type="button" class="btn btn-primary" data-testid="see-wall" @click="seeWall"><i class="bi bi-chat-heart me-1" aria-hidden="true"></i>See it on the wall</button>
            <button type="button" class="btn btn-outline-secondary" @click="emit('close')">Close</button>
          </div>
        </div>

        <!-- form -->
        <form v-else novalidate @submit.prevent="submit">
          <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
            <div>
              <div class="section-kicker">Say thanks</div>
              <h2 id="review-title" class="h4 mb-0 font-display">How was your {{ pickup.itemName }}?</h2>
              <div class="small text-body-secondary">from {{ pickup.bakeryName }} · {{ pickup.quantity }} {{ pickup.quantity === 1 ? 'unit' : 'units' }}</div>
            </div>
            <span :key="mood" class="review-mood" aria-hidden="true">{{ mood }}</span>
          </div>

          <div v-if="failure" class="alert alert-danger py-2" role="alert">{{ failure }}</div>

          <div class="row g-4">
            <div class="col-12 col-lg-7">
              <div class="mb-3">
                <div id="food-label" class="form-label fw-semibold mb-1">How was the food?</div>
                <StarRating v-model="form.foodRating" label="Food rating" :labels="FOOD_LABELS" :invalid="!!err('foodRating')" />
                <div v-if="err('foodRating')" class="text-danger small mt-1" role="alert">{{ err('foodRating') }}</div>
              </div>
              <div class="mb-3">
                <div class="form-label fw-semibold mb-1">Was the listing accurate?</div>
                <StarRating v-model="form.accuracyRating" label="Listing accuracy rating" :labels="ACCURACY_LABELS" :invalid="!!err('accuracyRating')" />
                <div v-if="err('accuracyRating')" class="text-danger small mt-1" role="alert">{{ err('accuracyRating') }}</div>
              </div>

              <div class="mb-3">
                <div class="d-flex justify-content-between align-items-end">
                  <label for="review-note" class="form-label fw-semibold mb-1">Your thank-you note</label>
                  <span class="char-ring" :class="`is-${ringTone}`" :title="`${used} of ${LIMITS.noteMax} characters`" aria-hidden="true">
                    <svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" class="ring-track" /><circle cx="14" cy="14" r="11" class="ring-bar" :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" transform="rotate(-90 14 14)" /></svg>
                    <span>{{ LIMITS.noteMax - used }}</span>
                  </span>
                </div>
                <textarea id="review-note" v-model="form.note" class="form-control" :class="{ 'is-invalid': err('note') }" rows="3" placeholder="e.g. Still warm when I picked it up. Thank you!" :aria-invalid="!!err('note')" aria-describedby="note-err"></textarea>
                <div id="note-err" class="invalid-feedback">{{ err('note') }}</div>
                <div class="d-flex flex-wrap gap-1 mt-2" role="group" aria-label="Quick compliments">
                  <button v-for="c in COMPLIMENTS" :key="c" type="button" class="chip btn btn-sm" :class="hasCompliment(c) ? 'btn-primary' : 'btn-outline-secondary'" :aria-pressed="hasCompliment(c)" @click="toggleCompliment(c)">{{ c }}</button>
                </div>
              </div>

              <div class="mb-3">
                <label for="review-nickname" class="form-label fw-semibold mb-1">Name shown on the wall</label>
                <input id="review-nickname" v-model="form.nickname" class="form-control" :class="{ 'is-invalid': err('nickname') }" :placeholder="nicknameHint" :maxlength="LIMITS.nicknameMax + 10" autocomplete="nickname" aria-describedby="nick-hint" />
                <div class="invalid-feedback">{{ err('nickname') }}</div>
                <div id="nick-hint" class="form-text">Only this nickname is shown, never your account details.</div>
              </div>

              <div v-if="isCharity" class="mb-3 behalf-box">
                <div class="form-check form-switch">
                  <input id="review-behalf" v-model="form.onBehalf" class="form-check-input" type="checkbox" role="switch" />
                  <label for="review-behalf" class="form-check-label fw-semibold">Thank them on behalf of the people we serve</label>
                </div>
                <Transition name="slide-down">
                  <div v-if="form.onBehalf" class="row g-2 mt-1">
                    <div class="col-12 col-sm-8">
                      <label for="review-behalf-of" class="form-label small mb-1">Who are they?</label>
                      <input id="review-behalf-of" v-model="form.onBehalfOf" class="form-control form-control-sm" :class="{ 'is-invalid': err('onBehalfOf') }" placeholder="e.g. the families at our breakfast club" />
                      <div class="invalid-feedback">{{ err('onBehalfOf') }}</div>
                    </div>
                    <div class="col-12 col-sm-4">
                      <label for="review-people" class="form-label small mb-1">People served</label>
                      <input id="review-people" v-model="form.peopleServed" type="number" min="1" :max="LIMITS.peopleMax" class="form-control form-control-sm" :class="{ 'is-invalid': err('peopleServed') }" placeholder="e.g. 40" />
                      <div class="invalid-feedback">{{ err('peopleServed') }}</div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>

            <div class="col-12 col-lg-5">
              <div class="preview-pane">
                <div class="small fw-semibold text-body-secondary mb-2"><i class="bi bi-eye me-1" aria-hidden="true"></i>This is how it will look on the wall</div>
                <ThankYouNote :note="preview" preview />
              </div>
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2 mt-3">
            <button type="button" class="btn btn-outline-secondary" :disabled="busy" @click="emit('close')">Not now</button>
            <button ref="submitBtn" class="btn btn-primary" :disabled="busy" data-testid="send-thanks">
              <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span><i v-else class="bi bi-heart-fill me-1" aria-hidden="true"></i>Post to the wall
            </button>
          </div>
        </form>
      </div>
    </Motion>
  </div>
</template>
