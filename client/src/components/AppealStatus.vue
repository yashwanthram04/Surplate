<script setup>
import { computed, ref, watch } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import { now } from '../composables/useNow';
import { LIMITS } from '../utils/reviews';
import { formatDateTime, formatRemaining } from '../utils/time';

// Everything about a reservation block in one place: when it should lift, the appeal form, and the answer.
// Used on the reservation notice and on the account page.
const props = defineProps({ reliability: { type: Object, required: true }, appeal: { type: Object, default: null } });
const emit = defineEmits(['appealed']);

const latest = ref(props.appeal);
watch(() => props.appeal, (a) => (latest.value = a));

const blocked = computed(() => props.reliability.level === 'blocked');
const liftsIn = computed(() => (props.reliability.blockedUntil ? new Date(props.reliability.blockedUntil).getTime() - now.value : null));
const pending = computed(() => latest.value?.status === 'pending');
const declined = computed(() => latest.value?.status === 'denied');
const waivedUntil = computed(() => props.reliability.waivedUntil);
// A declined appeal can be repeated after a cool-off (the server enforces the same wait).
const retryIn = computed(() => (declined.value && latest.value.decidedAt ? new Date(latest.value.decidedAt).getTime() + LIMITS.appealRetryHours * 3600000 - now.value : 0));
const canAppeal = computed(() => blocked.value && !pending.value && retryIn.value <= 0);

const open = ref(false);
const reason = ref('');
const busy = ref(false);
const error = ref('');
const submitted = ref(false);
const reasonError = computed(() => {
  const n = reason.value.trim().length;
  return n < LIMITS.appealMin ? `Tell us what happened in at least ${LIMITS.appealMin} characters.` : n > LIMITS.appealMax ? `Keep it under ${LIMITS.appealMax} characters.` : '';
});

async function send() {
  submitted.value = true;
  error.value = '';
  if (reasonError.value) return;
  busy.value = true;
  try {
    latest.value = (await api.post('/appeals', { reason: reason.value })).data;
    open.value = false;
    reason.value = '';
    submitted.value = false;
    emit('appealed', latest.value);
  } catch (e) {
    error.value = fieldErrors(e).reason || errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="blocked || waivedUntil || pending" class="appeal-status" data-testid="appeal-status">
    <!-- the block, and how long it lasts -->
    <div v-if="blocked" class="block-banner">
      <span class="block-shield" aria-hidden="true"><i class="bi bi-shield-lock-fill"></i></span>
      <div>
        <strong>Reservations paused</strong>
        <span class="d-block small">
          This is temporary.
          <template v-if="liftsIn && liftsIn > 0">It should lift in <strong data-testid="lifts-in">{{ formatRemaining(liftsIn) }}</strong> as your missed pickups age out.</template>
          <template v-else>It lifts as your missed pickups age out.</template>
        </span>
      </div>
    </div>

    <div v-if="waivedUntil" class="small mt-2" data-testid="appeal-approved">
      <i class="bi bi-unlock-fill me-1" aria-hidden="true"></i><strong>Your appeal was approved.</strong> You can reserve again until {{ formatDateTime(waivedUntil) }}. Collect on time to keep it that way.
    </div>
    <div v-else-if="pending" class="small mt-2" data-testid="appeal-pending">
      <span class="spinner-grow spinner-grow-sm me-1 text-warning" aria-hidden="true"></span><strong>Appeal under review.</strong> An admin will look at it soon.
    </div>
    <div v-else-if="declined && blocked" class="small mt-2" data-testid="appeal-denied">
      <i class="bi bi-x-circle-fill me-1 text-danger" aria-hidden="true"></i><strong>Your last appeal was declined.</strong>
      <span v-if="latest.adminNote"> “{{ latest.adminNote }}”</span>
      <span v-if="retryIn > 0" class="d-block text-body-secondary" data-testid="appeal-retry">You can appeal again in {{ formatRemaining(retryIn) }}.</span>
    </div>

    <template v-if="canAppeal">
      <button v-if="!open" type="button" class="btn btn-sm btn-outline-danger mt-2" data-testid="appeal-open" @click="open = true">
        <i class="bi bi-megaphone me-1" aria-hidden="true"></i>Appeal this block
      </button>
      <Transition name="slide-down">
        <form v-if="open" class="appeal-form mt-2" novalidate @submit.prevent="send">
          <label for="appeal-reason" class="form-label small fw-semibold mb-1">What happened?</label>
          <textarea id="appeal-reason" v-model="reason" class="form-control form-control-sm" :class="{ 'is-invalid': submitted && (reasonError || error) }" rows="3"
            placeholder="e.g. I was unwell on those days and couldn't let anyone know." :maxlength="LIMITS.appealMax + 50"></textarea>
          <div class="invalid-feedback">{{ error || reasonError }}</div>
          <div class="d-flex justify-content-between align-items-center mt-1">
            <small :class="reason.trim().length >= LIMITS.appealMin ? 'text-success' : 'text-body-secondary'">{{ reason.trim().length }}/{{ LIMITS.appealMax }}</small>
            <span class="d-flex gap-1">
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="open = false">Cancel</button>
              <button class="btn btn-sm btn-danger" :disabled="busy" data-testid="appeal-send">
                <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Send appeal
              </button>
            </span>
          </div>
        </form>
      </Transition>
    </template>
  </div>
</template>
