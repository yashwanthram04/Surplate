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
    <div class="mb-4">
        <h2 class="h5 mb-3">My Pledges</h2>

    <div v-if="pledgeEditError" class="alert alert-danger" role="alert">
        {{ pledgeEditError }}
    </div>

    <div v-if="pledgeEditSuccess" class="alert alert-success" role="status">
        {{ pledgeEditSuccess }}
    </div>

    <div v-if="myPledges.length === 0" class="text-body-secondary">
        You haven't made any pledges yet.
    </div>

    <div
        v-for="pledge in myPledges"
        :key="pledge.id"
        class="card mb-2">
        
        <div class="card-body">
        <h3 class="h6">{{ pledge.needTitle }}</h3>

        <p class="mb-2">
            Quantity pledged: <strong>{{ pledge.quantity }}</strong>
        </p>

        <p class="small text-body-secondary mb-2">
            Status: {{ pledge.status }}
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
