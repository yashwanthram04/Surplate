<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { scoreTone } from '../utils/reviews';
import CountUp from './home/CountUp.vue';

// A ring that sweeps up to a 0-100 score, changes colour with it (green 80+, amber 50-79, red below) and counts the
// number up. With no score yet (a new bakery) it shows a sparkle instead of a number.
const props = defineProps({
  score: { type: Number, default: null },
  size: { type: Number, default: 132 },
  label: { type: String, default: '' },
});

const R = 46;
const C = 2 * Math.PI * R;
const drawn = ref(0); // starts empty, then transitions to the score once mounted
const tone = computed(() => scoreTone(props.score));
const offset = computed(() => C * (1 - drawn.value / 100));
const description = computed(() => (props.score == null ? `${props.label || 'Score'}: not enough ratings yet` : `${props.label || 'Score'}: ${props.score} out of 100`));

onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => (drawn.value = props.score ?? 0))));
watch(() => props.score, (v) => (drawn.value = v ?? 0));
</script>

<template>
  <figure class="gauge" :class="`gauge-${tone}`" :style="{ width: `${size}px` }" role="img" :aria-label="description" data-testid="gauge">
    <div class="gauge-dial" :style="{ width: `${size}px`, height: `${size}px` }">
      <span class="gauge-halo" aria-hidden="true"></span>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="gauge-track" cx="60" cy="60" :r="R" />
        <circle class="gauge-arc" cx="60" cy="60" :r="R" :stroke-dasharray="C" :stroke-dashoffset="offset" transform="rotate(-90 60 60)" />
      </svg>
      <div class="gauge-center" :style="{ fontSize: `${size * 0.26}px` }">
        <span v-if="score != null" class="gauge-num"><CountUp :value="score" :duration="1500" /><small>%</small></span>
        <i v-else class="bi bi-stars gauge-new" aria-hidden="true"></i>
      </div>
    </div>
    <figcaption v-if="label" class="gauge-label">{{ label }}</figcaption>
  </figure>
</template>
