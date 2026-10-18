<script setup>
// Quantity + collection slot inputs, shared by the reservation form and "Change reservation".
defineProps({
  idPrefix: { type: String, required: true },
  slots: { type: Array, required: true }, // from openSlots()
  max: { type: Number, required: true },
  errors: { type: Object, default: () => ({}) },
});
const quantity = defineModel('quantity', { type: [Number, String], required: true });
const slotStart = defineModel('slotStart', { type: String, required: true });
</script>

<template>
  <div class="row g-3 mb-3">
    <div class="col-12 col-sm-4">
      <label :for="`${idPrefix}-quantity`" class="form-label fw-semibold">Quantity to reserve</label>
      <input :id="`${idPrefix}-quantity`" v-model="quantity" class="form-control" :class="{ 'is-invalid': errors.quantity }" type="number" min="1" :max="max" step="1" inputmode="numeric"
        :aria-invalid="!!errors.quantity" :aria-describedby="`${idPrefix}-quantity-err`" />
      <div :id="`${idPrefix}-quantity-err`" class="invalid-feedback">{{ errors.quantity }}</div>
    </div>
    <div class="col-12 col-sm-8">
      <label :for="`${idPrefix}-slot`" class="form-label fw-semibold">Collection slot</label>
      <select :id="`${idPrefix}-slot`" v-model="slotStart" class="form-select" :class="{ 'is-invalid': errors.slotStart }"
        :aria-invalid="!!errors.slotStart" :aria-describedby="`${idPrefix}-slot-err`">
        <option value="" disabled>Choose a slot</option>
        <option v-for="s in slots" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <div :id="`${idPrefix}-slot-err`" class="invalid-feedback">{{ errors.slotStart }}</div>
    </div>
  </div>
</template>
