<script setup>
import { computed, ref } from 'vue';

// Two modes. Interactive (default): a radio group of five stars: hover previews, a click sends a wave of pops
// along the stars, arrow keys work. Readonly: shows any value from 0 to 5, including averages like 4.6.
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  readonly: Boolean,
  size: { type: String, default: 'lg' }, // sm | md | lg
  label: { type: String, default: '' },
  labels: { type: Array, default: () => [] }, // text per star count, index = stars
  invalid: Boolean,
  showLabel: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue']);

const hover = ref(0);
const wave = ref(0); // bumping it remounts the stars so their pop animation plays again
const shown = computed(() => hover.value || props.modelValue);
const fill = computed(() => `${Math.max(0, Math.min(5, props.modelValue)) * 20}%`);

function set(n) {
  if (props.readonly) return;
  emit('update:modelValue', n);
  wave.value++;
}
function onKey(e) {
  const keys = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
  let next = props.modelValue;
  if (e.key in keys) next = Math.min(5, Math.max(1, (props.modelValue || 0) + keys[e.key]));
  else if (e.key === 'Home') next = 1;
  else if (e.key === 'End') next = 5;
  else return;
  e.preventDefault();
  set(next);
  e.currentTarget.parentElement.querySelector(`[data-star="${next}"]`)?.focus();
}
</script>

<template>
  <div v-if="readonly" class="stars stars-ro" :class="`stars-${size}`" role="img" :aria-label="`${label ? label + ': ' : ''}${modelValue} out of 5 stars`">
    <div class="stars-base" aria-hidden="true"><i v-for="n in 5" :key="n" class="bi bi-star-fill"></i></div>
    <div class="stars-fill" aria-hidden="true" :style="{ width: fill }"><i v-for="n in 5" :key="n" class="bi bi-star-fill"></i></div>
  </div>

  <div v-else class="stars-wrap">
    <div class="stars" :class="[`stars-${size}`, { invalid }]" role="radiogroup" :aria-label="label" @mouseleave="hover = 0">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        role="radio"
        class="star-btn"
        :data-star="n"
        :aria-checked="modelValue === n"
        :aria-label="`${n} ${n === 1 ? 'star' : 'stars'}${labels[n] ? ', ' + labels[n] : ''}`"
        :tabindex="modelValue === n || (!modelValue && n === 1) ? 0 : -1"
        @mouseenter="hover = n"
        @focus="hover = 0"
        @click="set(n)"
        @keydown="onKey"
      >
        <i :key="`${n}-${wave}`" class="bi star-glyph" :class="[n <= shown ? 'bi-star-fill is-on' : 'bi-star', { 'is-wave': wave > 0 && n <= modelValue && !hover }]" :style="{ '--i': n }"></i>
      </button>
    </div>
    <div v-if="showLabel" class="star-label" :class="{ 'is-empty': !shown }" aria-live="polite">{{ labels[shown] || 'Tap a star' }}</div>
  </div>
</template>
