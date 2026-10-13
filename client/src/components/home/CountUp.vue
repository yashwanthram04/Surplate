<script setup>
import { useReducedMotion } from 'motion-v';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// A number that counts up to its value once it is on screen (and again, smoothly, if the value changes).
const props = defineProps({
  value: { type: Number, default: 0 },
  duration: { type: Number, default: 1600 },
});

const el = ref(null);
const shown = ref(0);
const reduceMotion = useReducedMotion();
let visible = false;
let frame = 0;
let observer = null;

function animateTo(target) {
  cancelAnimationFrame(frame);
  if (reduceMotion.value || !visible) {
    shown.value = target;
    return;
  }
  const from = shown.value;
  const started = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - started) / props.duration);
    shown.value = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))); // ease-out cubic
    if (p < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    shown.value = props.value;
    return;
  }
  observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    visible = true;
    observer.disconnect();
    animateTo(props.value);
  });
  observer.observe(el.value);
});
watch(() => props.value, (v) => visible && animateTo(v));
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
});

const text = computed(() => shown.value.toLocaleString('en-SG'));
</script>

<template>
  <!-- data-value carries the final number for tests and assistive tech while the visible digits animate -->
  <span ref="el" :data-value="value"><span aria-hidden="true">{{ text }}</span><span class="visually-hidden">{{ value.toLocaleString('en-SG') }}</span></span>
</template>
