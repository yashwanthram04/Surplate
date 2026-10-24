<script setup>
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

const emit = defineEmits([
    'start-edit',
    'stop-edit',
    'save-quantity',
    'cancel-need',
    'pledge',
]);
</script>

<template>
    <article
        class="border rounded-4 p-3 p-md-4 h-100"
        :class="{
        'bg-body-secondary opacity-75':
            need.status === 'cancelled' || need.status === 'fulfilled',
        'border-danger': need.status === 'cancelled',
        'border-success': need.status === 'fulfilled',
        }">
        
        <div class="d-flex justify-content-between gap-2 mb-2">
        <span v-if="need.status === 'cancelled'" class="badge text-bg-danger">
            Cancelled
        </span>
        
        <span v-else-if="need.status === 'fulfilled'" class="badge text-bg-success">
            Fulfilled
        </span>
        
        <span v-else class="badge text-bg-light border">
            {{ need.phase || need.status }}
        </span>

        <span class="small text-body-secondary">
            {{ need.charity?.name }}
        </span>
        </div>
        
        <h2 class="h5">{{ need.title }}</h2>

        <p v-if="need.description" class="text-body-secondary">
            {{ need.description }}
        </p>

        <p v-if="need.status === 'cancelled'" class="text-danger fw-semibold">
            This request was cancelled by the charity.
        </p>

        <p v-else-if="need.status === 'fulfilled'" class="text-success fw-semibold">
            All requested food has been pledged!
        </p>

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
            :class="{
            'bg-success': need.status === 'fulfilled',
            'bg-danger': need.status === 'cancelled',
            }"
            :style="{ width: `${need.percent}%` }"
        ></div>
    </div>

    <p class="small mb-2">
        <strong>{{ need.quantityRemaining }}</strong> more needed
    </p>

    <p class="small text-body-secondary">
        Needed by: {{ new Date(need.neededBy).toLocaleString() }}
    </p>

    <div v-if="need.dietaryTags?.length" class="d-flex flex-wrap gap-1 mb-3">
        <span
            v-for="tag in need.dietaryTags"
            :key="tag"
            class="badge text-bg-light border">
            {{ tag }}
        </span>
    </div>

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
                class="form-control"/>

            <button
                class="btn btn-success"
                :disabled="savingNeed"
                @click="emit('save-quantity', need)">
                {{ savingNeed ? 'Saving…' : 'Save' }}
            </button>

            <button
                class="btn btn-outline-secondary"
                :disabled="savingNeed"
                @click="emit('stop-edit')">
                Cancel edit
            </button>
        </div>
    </div>
    
    <div v-else class="d-flex flex-wrap gap-2">
        <button
            class="btn btn-outline-primary btn-sm"
            @click="emit('start-edit', need)">
            Edit quantity
        </button>

        <button
            class="btn btn-outline-danger btn-sm"
            @click="emit('cancel-need', need)">
            Cancel request
        </button>
    </div>
    </div>

    <div
        v-if="isBakery && need.status === 'open' && need.quantityRemaining > 0"
        class="mt-3">
        
        <label :for="`pledge-${need.id}`" class="form-label fw-semibold">
            How much can you give?
        </label>

        <div class="input-group">
            <input
            :id="`pledge-${need.id}`"
            v-model.number="pledgeQuantities[need.id]"
            type="number"
            min="1"
            :max="need.quantityRemaining"
            step="1"
            class="form-control"
            aria-label="Quantity of food to pledge"/>
            
        <span class="input-group-text">units</span>

        <button
            class="btn btn-primary"
            :disabled="pledging"
            @click="emit('pledge', need)">
            {{ pledging ? 'Submitting…' : 'Submit pledge' }}
        </button>
      </div>
    </div>
  </article>
</template>