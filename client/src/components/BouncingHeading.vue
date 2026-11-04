<script setup>
import { gsap } from 'gsap';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({ text: { type: String, required: true } });
const words = computed(() => props.text.trim().split(/\s+/).map((word) => [...word]));
const root = ref(null);
let context;
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function animate() {
  context?.revert();
  if (reducedMotion()) return;
  context = gsap.context((self) => {
    const chars = root.value.querySelectorAll('.ch');
    const random = gsap.utils.random;
    gsap.from(chars, { yPercent: -260, rotation: () => random(-70, 70), opacity: 0, duration: 1.1, ease: 'bounce.out', stagger: { each: 0.04, from: 'random' }, delay: 0.15, clearProps: 'transform,opacity' });
    gsap.timeline({ repeat: -1, repeatDelay: 3.8, delay: 2.8 })
      .to(chars, { y: -18, rotation: () => random(-12, 12), duration: 0.22, ease: 'power2.out', stagger: 0.045, yoyo: true, repeat: 1 });
    self.add('hover', (letter) => {
      gsap.timeline({ overwrite: 'auto' })
        .to(letter, { y: -22, scale: 1.3, rotation: random(-20, 20), color: '#ffd66b', duration: 0.18, ease: 'power2.out' })
        .to(letter, { y: 0, scale: 1, rotation: 0, color: '#fff', duration: 0.7, ease: 'elastic.out(1, 0.35)', clearProps: 'transform,color' });
    });
  }, root.value);
}
function hover(event) {
  if (!reducedMotion()) context?.hover(event.currentTarget);
}
onMounted(animate);
watch(() => props.text, animate, { flush: 'post' });
onBeforeUnmount(() => context?.revert());
</script>

<template>
  <h1 ref="root" class="banner-title" :aria-label="text">
    <span v-for="(word, wi) in words" :key="`${text}-${wi}`" class="title-word" aria-hidden="true"><span v-for="(letter, ci) in word" :key="ci" class="ch"><span class="ch-in" @mouseenter="hover">{{ letter }}</span></span><span v-if="wi < words.length - 1" class="word-space">{{ ' ' }}</span></span>
  </h1>
</template>

<style scoped>
h1.banner-title {
  font-family: var(--sp-display);
  font-size: clamp(2.5rem, 6vw, 4.4rem);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.01em;
  color: #fff;
  text-shadow: 0 5px 0 rgba(0, 0, 0, 0.14);
}
.title-word { display: inline-block; white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; }
.ch, .ch-in { display: inline-block; }
.ch-in { cursor: default; }
</style>
