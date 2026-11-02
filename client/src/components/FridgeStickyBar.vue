<script setup>
import { gsap } from 'gsap';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { prefersReducedMotion } from '../composables/useFridgeMotion';
import FridgeMascot from './FridgeMascot.vue';

// The slim bar the banner "shrinks into" once it scrolls away: mini mascot, title and the three counts.
// It repeats what the banner says, so screen readers skip it.
const props = defineProps({
  show: Boolean,
  title: { type: String, required: true },
  mood: { type: String, default: 'stocked' },
  stats: { type: Array, required: true }, // [{ value, label }]
});

const bar = ref(null);
const top = ref(64);
const measure = () => (top.value = document.querySelector('.navbar')?.offsetHeight ?? 64);

function toggle(on) {
  document.documentElement.classList.toggle('fridge-bar-on', on);
  if (!bar.value) return;
  if (prefersReducedMotion()) {
    gsap.set(bar.value, { autoAlpha: on ? 1 : 0, yPercent: 0 });
    return;
  }
  gsap.killTweensOf(bar.value.querySelectorAll('*'));
  if (on) {
    gsap
      .timeline({ overwrite: true })
      .to(bar.value, { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'back.out(1.6)' })
      .from(bar.value.querySelector('.fsb-mascot'), { scale: 0.3, rotation: -25, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, 0.1)
      .from(bar.value.querySelectorAll('.fsb-stat'), { y: -10, opacity: 0, duration: 0.35, ease: 'power2.out', stagger: 0.06, clearProps: 'all' }, 0.15);
  } else {
    gsap.to(bar.value, { autoAlpha: 0, yPercent: -110, duration: 0.3, ease: 'power2.in', overwrite: true });
  }
}

onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  gsap.set(bar.value, { autoAlpha: 0, yPercent: -110 });
  if (props.show) toggle(true);
});
watch(() => props.show, toggle);
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  document.documentElement.classList.remove('fridge-bar-on');
  if (bar.value) gsap.killTweensOf(bar.value);
});
</script>

<template>
  <div ref="bar" class="fridge-sticky-bar" :style="{ top: `${top}px` }" aria-hidden="true">
    <div class="container-fluid px-3 px-lg-4">
      <div class="fsb-inner">
        <FridgeMascot class="fsb-mascot" :mood="mood" :size="34" />
        <span class="fsb-title">{{ title }}</span>
        <span class="fsb-stats">
          <span v-for="s in stats" :key="s.label" class="fsb-stat"><strong>{{ s.value }}</strong>{{ s.label }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
