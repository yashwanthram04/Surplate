<script setup>
// One card = one charity request.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { now } from '../composables/useNow';

const props = defineProps({
  need: { type: Object, required: true },
  isCharity: { type: Boolean, default: false },
  isBakery: { type: Boolean, default: false },
  editingNeedId: { type: [String, null], default: null },
  editQuantities: { type: Object, required: true },
  savingNeed: { type: Boolean, default: false },
  pledgeQuantities: { type: Object, required: true },
  pledging: { type: Boolean, default: false },
});

const emit = defineEmits(['start-edit', 'stop-edit', 'save-quantity', 'cancel-need', 'pledge']);

// The progress bar fills in once when the card appears, and glides whenever the pledged amount changes.
const filled = ref(0);
let frame = 0;
onMounted(() => {
  frame = requestAnimationFrame(() => (filled.value = props.need.percent));
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
watch(() => props.need.percent, (p) => (filled.value = p));

const isOpen = computed(() => props.need.status === 'open');
const statusLabel = computed(() => (props.need.status === 'open' ? (props.need.phase === 'overdue' ? 'Overdue' : 'Open') : props.need.status === 'fulfilled' ? 'Fulfilled' : 'Cancelled'));
const emoji = computed(() => (props.need.status === 'fulfilled' ? '🎉' : props.need.status === 'cancelled' ? '💔' : '🥖'));
const initial = computed(() => (props.need.charity?.name ?? '?').trim().charAt(0).toUpperCase());

// "Needed in 2 days": turns amber inside the last day so urgent requests stand out.
const due = computed(() => {
  if (!isOpen.value) return null;
  const ms = new Date(props.need.neededBy).getTime() - now.value;
  if (ms <= 0) return { text: 'Past due', urgent: true };
  const hours = ms / 3600000;
  if (hours < 1) return { text: `Needed in ${Math.max(1, Math.ceil(ms / 60000))} min`, urgent: true };
  if (hours < 48) return { text: `Needed in ${Math.round(hours)} h`, urgent: hours < 24 };
  return { text: `Needed in ${Math.round(hours / 24)} days`, urgent: false };
});
</script>

<template>
  <article class="need-card h-100" :class="[`is-${need.status}`, { 'is-urgent': due?.urgent }]">
    <!-- Top row: who is asking, and the status -->
    <div class="nc-head">
      <span class="nc-avatar" aria-hidden="true">{{ initial }}</span>
      <div class="nc-who">
        <div class="nc-charity">{{ need.charity?.name }}</div>
        <div v-if="due" class="nc-due"><i class="bi bi-clock" aria-hidden="true"></i> {{ due.text }}</div>
      </div>
      <span class="nc-status" :class="`st-${need.status}`"><i v-if="isOpen" class="dot" aria-hidden="true"></i>{{ statusLabel }}</span>
    </div>

    <h2 class="nc-title"><span class="nc-emoji" aria-hidden="true">{{ emoji }}</span>{{ need.title }}</h2>

    <p v-if="need.description" class="nc-desc">{{ need.description }}</p>

    <p v-if="need.status === 'cancelled'" class="text-danger fw-semibold small">This request was cancelled by the charity.</p>
    <p v-else-if="need.status === 'fulfilled'" class="text-success fw-semibold small">All requested food has been pledged!</p>

    <!-- Progress -->
    <div class="nc-progress">
      <div class="d-flex justify-content-between align-items-baseline mb-1">
        <span class="small">{{ need.quantityPledged }} of {{ need.quantityTarget }} pledged</span>
        <strong class="nc-percent">{{ need.percent }}%</strong>
      </div>
      <div
        class="meter"
        role="progressbar"
        :aria-valuenow="need.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="`${need.percent}% of requested food pledged`"
      >
        <div class="meter-fill" :style="{ width: `${filled}%` }"></div>
      </div>
      <div class="small mt-2"><strong>{{ need.quantityRemaining }}</strong> more needed</div>
    </div>

    <p class="nc-date small text-body-secondary">
      <i class="bi bi-calendar-event me-1" aria-hidden="true"></i>Needed by: {{ new Date(need.neededBy).toLocaleString() }}
    </p>

    <!-- Dietary tags -->
    <div v-if="need.dietaryTags?.length" class="d-flex flex-wrap gap-1 mb-3">
      <span v-for="tag in need.dietaryTags" :key="tag" class="tag-pill">{{ tag }}</span>
    </div>

    <!-- Charity only: which bakeries pledged, and where to collect -->
    <div v-if="isCharity && need.pledges?.length" class="pledge-list">
      <h3 class="h6">🥖 Bakeries who pledged</h3>
      <ul class="list-unstyled mb-0 small">
        <li v-for="p in need.pledges" :key="p.id" class="pledge-row">
          <div class="d-flex justify-content-between">
            <span>🍞 <strong>{{ p.bakery.name }}</strong></span>
            <strong>{{ p.quantity }} units</strong>
          </div>
          <div class="text-body-secondary">
            📍
            <span v-if="p.pickup?.address">
              Collect at {{ p.pickup.address }}<span v-if="p.pickup.postal">, {{ p.pickup.postal }}</span>
            </span>
            <span v-else>No pickup address saved yet</span>
          </div>
          <div v-if="p.pickup?.phone" class="text-body-secondary">📞 {{ p.pickup.phone }}</div>
        </li>
      </ul>
    </div>

    <!-- Charity buttons: edit quantity / cancel -->
    <div v-if="isCharity && need.status === 'open'" class="nc-actions">
      <div v-if="editingNeedId === need.id">
        <label :for="`edit-quantity-${need.id}`" class="form-label fw-semibold">Update quantity needed</label>

        <div class="input-group mb-2">
          <input :id="`edit-quantity-${need.id}`" v-model.number="editQuantities[need.id]" type="number" min="1" step="1" class="form-control" />
          <button class="btn btn-success" :disabled="savingNeed" @click="emit('save-quantity', need)">
            {{ savingNeed ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn btn-outline-secondary" :disabled="savingNeed" @click="emit('stop-edit')">Cancel edit</button>
        </div>
      </div>

      <div v-else class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-primary btn-sm" @click="emit('start-edit', need)">Edit quantity</button>
        <button class="btn btn-outline-danger btn-sm" @click="emit('cancel-need', need)">Cancel request</button>
      </div>
    </div>

    <!-- Bakery: pledge box -->
    <div v-if="isBakery && need.status === 'open' && need.quantityRemaining > 0" class="nc-actions">
      <label :for="`pledge-${need.id}`" class="form-label fw-semibold">How much can you give?</label>

      <div class="input-group">
        <input
          :id="`pledge-${need.id}`"
          v-model.number="pledgeQuantities[need.id]"
          type="number"
          min="1"
          :max="need.quantityRemaining"
          step="1"
          class="form-control"
          aria-label="Quantity of food to pledge"
        />
        <span class="input-group-text">units</span>
        <button class="btn btn-primary" :disabled="pledging" @click="emit('pledge', need)">
          {{ pledging ? 'Submitting…' : 'Submit pledge' }}
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.need-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #e8e4da;
  border-radius: 1.1rem;
  box-shadow: 0 1px 2px rgba(40, 60, 40, 0.04);
  overflow: hidden;
  transition: box-shadow 0.25s, transform 0.25s, border-color 0.25s;
}
/* a thin accent along the top: green when open, amber when it is running out of time */
.need-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: linear-gradient(90deg, var(--sp-green), #6cc08b);
}
.need-card.is-urgent::before { background: linear-gradient(90deg, var(--sp-amber), #f2b84b); }
.need-card.is-fulfilled { background: #f3faf5; border-color: #cfe7d7; }
.need-card.is-cancelled { background: #f6f4ef; border-style: dashed; color: #6b6a64; }
.need-card.is-cancelled::before { background: #cfcac0; }
.need-card.is-open:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 28px -12px rgba(40, 60, 40, 0.22);
  border-color: #d3e6d9;
}

.nc-head { display: flex; align-items: center; gap: 0.7rem; margin: 0.25rem 0 0.9rem; }
.nc-avatar {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  font: 600 1rem var(--sp-display);
  color: var(--sp-green-dark);
  background: var(--sp-green-soft);
}
.nc-who { flex: 1; min-width: 0; line-height: 1.25; }
.nc-charity { font-weight: 600; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-due { font-size: 0.78rem; color: #6b7a70; }
.is-urgent .nc-due { color: #a96300; font-weight: 600; }

.nc-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 99px;
}
.st-open { background: var(--sp-green-soft); color: var(--sp-green-dark); }
.st-fulfilled { background: var(--sp-green); color: #fff; }
.st-cancelled { background: #f3d9d5; color: #8e2a1f; }
.nc-status .dot { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--sp-green); animation: dot-pulse 1.8s ease-out infinite; }
.is-urgent .nc-status.st-open { background: #fff3d6; color: #7a4a00; }
.is-urgent .nc-status .dot { background: var(--sp-amber); }
@keyframes dot-pulse {
  0% { box-shadow: 0 0 0 0 rgba(47, 125, 79, 0.45); }
  80%, 100% { box-shadow: 0 0 0 7px rgba(47, 125, 79, 0); }
}

.nc-title { display: flex; gap: 0.5rem; align-items: baseline; font-size: 1.2rem; margin-bottom: 0.35rem; }
.nc-emoji { flex: none; transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
.need-card:hover .nc-emoji { transform: rotate(-12deg) scale(1.2); }
.nc-desc { color: #5f6a63; margin-bottom: 0.9rem; }

.nc-progress { margin: 0.4rem 0 0.9rem; }
.nc-percent { font: 600 1.05rem var(--sp-display); color: var(--sp-green-dark); }
.meter { height: 0.6rem; border-radius: 99px; background: #ece9e1; overflow: hidden; }
.meter-fill {
  position: relative;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--sp-green), #6cc08b);
  transition: width 1.1s cubic-bezier(0.22, 1, 0.36, 1);
}
/* a soft highlight sweeps along a filling bar so it reads as "in progress" */
.is-open .meter-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%);
  transform: translateX(-100%);
  animation: sweep 3.2s ease-in-out 1.2s infinite;
}
@keyframes sweep { 55%, 100% { transform: translateX(100%); } }
.is-urgent .meter-fill { background: linear-gradient(90deg, var(--sp-amber), #f2b84b); }
.is-cancelled .meter-fill { background: #cfcac0; }

.nc-date { margin-bottom: 0.8rem; }

.pledge-list { border-top: 1px dashed #d9d4c6; padding-top: 0.8rem; margin-top: 0.2rem; }
.pledge-row { padding: 0.5rem 0.65rem; margin-bottom: 0.45rem; border-radius: 0.7rem; background: #f6faf7; }
.pledge-row:last-child { margin-bottom: 0; }

.nc-actions { margin-top: auto; padding-top: 0.9rem; }

@media (prefers-reduced-motion: reduce) {
  .nc-status .dot,
  .is-open .meter-fill::after { animation: none; }
  .meter-fill,
  .need-card,
  .nc-emoji { transition: none; }
  .need-card.is-open:hover { transform: none; }
  .need-card:hover .nc-emoji { transform: none; }
}
</style>
