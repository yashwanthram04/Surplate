<script setup>
import { computed } from 'vue';
import { statusMeta } from '../utils/fridge';
import '../fridges.css';

const props = defineProps({
  status: { type: String, default: 'unknown' }, // stocked | low | empty | unknown
  large: Boolean,
});
const meta = computed(() => statusMeta(props.status));
</script>

<template>
  <span class="fridge-badge" :class="[`status-${status}`, { lg: large }]" data-testid="fridge-status">
    <i class="bi" :class="meta.icon" aria-hidden="true"></i>{{ meta.label }}
  </span>
</template>
