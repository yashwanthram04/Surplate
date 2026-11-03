<script setup>
// One card = one charity request.

defineProps({
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
</script>

<template>
  <article
    class="need-card position-relative border rounded-4 p-3 p-md-4 h-100"
    :class="{
      'need-open': need.status === 'open',
      'bg-body-secondary opacity-75': need.status === 'cancelled' || need.status === 'fulfilled',
      'border-danger': need.status === 'cancelled',
      'border-success': need.status === 'fulfilled',
    }"
  >
    <!-- The bread that pins this card to the board -->
    <span class="bread-pin">🍞</span>

    <!-- Top row: status badge + charity name -->
    <div class="d-flex justify-content-between gap-2 mb-2">
      <span v-if="need.status === 'cancelled'" class="badge text-bg-danger">Cancelled</span>
      <span v-else-if="need.status === 'fulfilled'" class="badge text-bg-success">Fulfilled</span>
      <span v-else class="badge text-bg-light border">{{ need.phase || need.status }}</span>

      <span class="small text-body-secondary">{{ need.charity?.name }}</span>
    </div>

    <!-- Title: a different emoji for each status -->
    <h2 class="h5">
      <span v-if="need.status === 'open'">🥖</span>
      <span v-else-if="need.status === 'fulfilled'">🎉</span>
      <span v-else>💔</span>
      {{ need.title }}
    </h2>

    <p v-if="need.description" class="text-body-secondary">{{ need.description }}</p>

    <p v-if="need.status === 'cancelled'" class="text-danger fw-semibold">
      This request was cancelled by the charity.
    </p>
    <p v-else-if="need.status === 'fulfilled'" class="text-success fw-semibold">
      All requested food has been pledged!
    </p>

    <!-- Progress -->
    <div class="d-flex justify-content-between small mb-2">
      <span>{{ need.quantityPledged }} of {{ need.quantityTarget }} pledged</span>
      <span>{{ need.percent }}%</span>
    </div>

    <div
      class="progress mb-3"
      role="progressbar"
      :aria-valuenow="need.percent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="`${need.percent}% of requested food pledged`"
    >
      <div
        class="progress-bar"
        :class="{ 'bg-success': need.status === 'fulfilled', 'bg-danger': need.status === 'cancelled' }"
        :style="{ width: `${need.percent}%` }"
      ></div>
    </div>

    <p class="small mb-2"><strong>{{ need.quantityRemaining }}</strong> more needed</p>

    <p class="small text-body-secondary">
      Needed by: {{ new Date(need.neededBy).toLocaleString() }}
    </p>

    <!-- Dietary tags -->
    <div v-if="need.dietaryTags?.length" class="d-flex flex-wrap gap-1 mb-3">
      <span v-for="tag in need.dietaryTags" :key="tag" class="badge text-bg-light border">{{ tag }}</span>
    </div>

        <!-- Charity only: which bakeries pledged, and where to collect -->
    <div v-if="isCharity && need.pledges?.length" class="pledge-list mt-3">
      <h3 class="h6">🥖 Bakeries who pledged</h3>
      <ul class="list-unstyled mb-0 small">
        <li v-for="p in need.pledges" :key="p.id" class="mb-2">
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
    <div v-if="isCharity && need.status === 'open'" class="mt-3">
      <div v-if="editingNeedId === need.id">
        <label :for="`edit-quantity-${need.id}`" class="form-label fw-semibold">
          Update quantity needed
        </label>

        <div class="input-group mb-2">
          <input
            :id="`edit-quantity-${need.id}`"
            v-model.number="editQuantities[need.id]"
            type="number"
            min="1"
            step="1"
            class="form-control"
          />
          <button class="btn btn-success" :disabled="savingNeed" @click="emit('save-quantity', need)">
            {{ savingNeed ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn btn-outline-secondary" :disabled="savingNeed" @click="emit('stop-edit')">
            Cancel edit
          </button>
        </div>
      </div>

      <div v-else class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-primary btn-sm" @click="emit('start-edit', need)">
          Edit quantity
        </button>
        <button class="btn btn-outline-danger btn-sm" @click="emit('cancel-need', need)">
          Cancel request
        </button>
      </div>
    </div>

    <!-- Bakery: pledge box -->
    <div v-if="isBakery && need.status === 'open' && need.quantityRemaining > 0" class="mt-3">
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
/* The bread pin sits on the top edge of the card */
.bread-pin {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 1.9rem;
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4));
}

.need-open {
  background-color: #fff8ec;
  border: 2px solid #f0d9b5 !important; /* !important beats Bootstrap's .border */
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s;
}

/* The paper lifts up a little when you hover over it */
.need-open:hover {
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.4);
}

.need-open .progress-bar {
  background-color: #e0a64b;
}

.pledge-list {
  border-top: 2px dashed #f0d9b5;
  padding-top: 0.75rem;
}
</style>