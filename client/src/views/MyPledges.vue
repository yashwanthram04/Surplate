<script setup>
defineProps({
    myPledges: { type: Array, required: true },
    editingPledgeId: { type: [String, null], default: null },
    editPledgeQuantity: { type: Number, default: 1 },
    savingPledge: { type: Boolean, default: false },
    pledgeEditError: { type: String, default: '' },
    pledgeEditSuccess: { type: String, default: '' },
    withdrawingPledgeId: { type: String, default: null },
});

const emit = defineEmits([
  'start-edit',
  'stop-edit',
  'save-quantity',
  'update:editPledgeQuantity',
  'withdraw'
]);

</script>

<template>
    <div class="pledges-panel">
        <h2 class="h5 mb-3"><span aria-hidden="true">🤝</span> My Pledges</h2>

    <div v-if="pledgeEditError" class="alert alert-danger" role="alert">
        {{ pledgeEditError }}
    </div>

    <div v-if="pledgeEditSuccess" class="alert alert-success" role="status">
        {{ pledgeEditSuccess }}
    </div>

    <div v-if="myPledges.length === 0" class="text-body-secondary small">
        You haven't made any pledges yet.
    </div>

    <div
        v-for="pledge in myPledges"
        :key="pledge.id"
        class="pledge-item">

        <div>
        <h3 class="h6">{{ pledge.needTitle }}</h3>

        <p class="mb-2">
            Quantity pledged: <strong>{{ pledge.quantity }}</strong>
        </p>

        <p class="small text-body-secondary mb-2">
            Status: <span class="pledge-status">{{ pledge.status }}</span>
        </p>

        <div v-if="pledge.status === 'pledged'">
            <div v-if="editingPledgeId === pledge.id">
                <label :for="`edit-pledge-${pledge.id}`" class="form-label">
                    New quantity
                </label>
                
                <div class="input-group">
                    <input
                        :id="`edit-pledge-${pledge.id}`"
                        :value="editPledgeQuantity"
                        @input="emit('update:editPledgeQuantity', Number($event.target.value))"
                        type="number"
                        min="1"
                        step="1"
                        class="form-control"/>
                        
                    <button
                        class="btn btn-success"
                        :disabled="savingPledge"
                        @click="emit('save-quantity', pledge)">
                        {{ savingPledge ? 'Saving…' : 'Save' }}
                    </button>

                    <button
                        class="btn btn-outline-secondary"
                        :disabled="savingPledge"
                        @click="emit('stop-edit')">
                        Cancel
                    </button>
            </div>
        </div>

        <button
            v-else
            class="btn btn-outline-primary btn-sm me-2"
            @click="emit('start-edit', pledge)">
            Edit quantity
        </button>

        <button
            class="btn btn-outline-danger btn-sm"
            :disabled="withdrawingPledgeId === pledge.id"
            @click="emit('withdraw', pledge)">
            {{ withdrawingPledgeId === pledge.id ? 'Withdrawing…' : 'Withdraw' }}
        </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pledges-panel {
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #e8e4da;
  border-radius: 1.1rem;
  box-shadow: 0 1px 2px rgba(40, 60, 40, 0.04);
}
.pledge-item {
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.6rem;
  background: #f6faf7;
  border: 1px solid #e1eee6;
  border-radius: 0.8rem;
  transition: transform 0.2s, box-shadow 0.2s;
}
.pledge-item:last-child { margin-bottom: 0; }
.pledge-item:hover { transform: translateY(-2px); box-shadow: 0 8px 16px -10px rgba(40, 60, 40, 0.35); }
.pledge-status {
  display: inline-block;
  padding: 0.05rem 0.55rem;
  border-radius: 99px;
  font-weight: 600;
  background: var(--sp-green-soft);
  color: var(--sp-green-dark);
}
@media (prefers-reduced-motion: reduce) {
  .pledge-item { transition: none; }
  .pledge-item:hover { transform: none; }
}
</style>
