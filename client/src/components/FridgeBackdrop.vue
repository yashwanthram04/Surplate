<script setup>
import { gsap } from 'gsap';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { prefersReducedMotion } from '../composables/useFridgeMotion';

const root = ref(null);
const bits = [
  { e: '🥖', l: 6, s: 1.9 }, { e: '🍎', l: 17, s: 1.5 }, { e: '🥗', l: 29, s: 2 }, { e: '🥐', l: 41, s: 1.6 },
  { e: '🍊', l: 53, s: 1.8 }, { e: '🥕', l: 64, s: 1.5 }, { e: '🧁', l: 76, s: 1.9 }, { e: '🍋', l: 88, s: 1.6 },
  { e: '🍞', l: 94, s: 1.4 }, { e: '🥬', l: 35, s: 1.4 },
];
let ctx = null;

onMounted(() => {
  if (prefersReducedMotion() || !root.value) return;
  ctx = gsap.context(() => {
    gsap.utils.toArray('.bd-blob').forEach((b, i) => {
      gsap.to(b, { x: `+=${gsap.utils.random(40, 90)}`, y: `+=${gsap.utils.random(30, 70)}`, scale: 1.18, duration: 8 + i * 2.5, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
    gsap.utils.toArray('.bd-bit').forEach((b) => {
      const dur = gsap.utils.random(20, 34);
      // each food rises from below the screen to above it, swaying, and starts at a random point so the screen is never empty
      gsap.fromTo(b, { y: '108vh', rotation: -18 }, { y: '-18vh', rotation: 18, duration: dur, ease: 'none', repeat: -1, delay: -gsap.utils.random(0, dur) });
      gsap.to(b, { x: `+=${gsap.utils.random(20, 50)}`, duration: gsap.utils.random(2.5, 4.5), ease: 'sine.inOut', yoyo: true, repeat: -1 });
    });
  }, root.value);
});
onBeforeUnmount(() => ctx?.revert());
</script>

<template>
  <div ref="root" class="fridge-backdrop" aria-hidden="true">
    <span class="bd-blob b1"></span>
    <span class="bd-blob b2"></span>
    <span class="bd-blob b3"></span>
    <span v-for="(b, i) in bits" :key="i" class="bd-bit" :style="{ left: `${b.l}%`, fontSize: `${b.s}rem` }">{{ b.e }}</span>
  </div>
</template>
