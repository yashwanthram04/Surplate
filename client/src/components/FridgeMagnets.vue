<script setup>
import { gsap } from 'gsap';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { prefersReducedMotion } from '../composables/useFridgeMotion';
import FridgeMascot from './FridgeMascot.vue';
import '../fridges.css';

// A strip of fridge door with toy letter magnets, food magnets and a polaroid stuck on it.
// They drop in and snap on, wobble when hovered, and can be dragged with a mouse (they spring back).
const COLOURS = ['#e63946', '#f4a300', '#1d7fd6', '#2f9e57', '#ff7a1a', '#8e5bd6'];
let count = 0;
const tilt = (i) => `${((i * 37) % 15) - 7}deg`; // scattered but the same on every load
const nudge = (i) => `${((i * 13) % 5) - 2}px`;
const word = (text, hideSm = false) => ({
  kind: 'word',
  text,
  hideSm,
  letters: [...text].map((ch) => {
    const i = count++;
    return { ch, colour: COLOURS[(i * 5) % COLOURS.length], r: tilt(i), dy: nudge(i) };
  }),
});
const thing = (kind, extra = {}) => ({ kind, r: tilt(count), dy: nudge(count++), ...extra });

const ITEMS = [
  word('TAKE'), word('WHAT'), word('YOU'), word('NEED'),
  thing('food', { emoji: '🍎' }), thing('polaroid'), thing('food', { emoji: '🥖' }),
  word('LEAVE', true), word('WHAT', true), word('YOU', true), word('CAN', true),
  thing('food', { emoji: '🥛', hideSm: true }),
];

const root = ref(null);
let ctx = null;
onMounted(() => {
  if (prefersReducedMotion() || !root.value) return;
  ctx = gsap.context(() => {
    gsap.from('.mg', {
      y: -90,
      opacity: 0,
      rotation: () => gsap.utils.random(-40, 40),
      duration: 0.45,
      ease: 'power3.in',
      clearProps: 'opacity',
      scrollTrigger: { trigger: root.value, start: 'top 92%', once: true },
      stagger: {
        each: 0.035,
        from: 'random',
        // the snap: a quick squash as it hits the door, then settles
        onComplete() {
          gsap.fromTo(this.targets()[0], { scaleX: 1.14, scaleY: 0.84 }, { scaleX: 1, scaleY: 1, duration: 0.55, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' });
        },
      },
    });
  }, root.value);
});
onBeforeUnmount(() => ctx?.revert());

// drag with a mouse or pen; touch is left alone so the page still scrolls
function grab(e) {
  if (e.pointerType === 'touch' || e.button !== 0 || prefersReducedMotion()) return;
  const el = e.currentTarget;
  const sx = e.clientX;
  const sy = e.clientY;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  gsap.killTweensOf(el);
  el.classList.add('is-dragging');
  const move = (ev) => gsap.set(el, { x: ev.clientX - sx, y: ev.clientY - sy, rotation: (ev.clientX - sx) * 0.08, scale: 1.1 });
  const drop = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', drop);
    el.removeEventListener('pointercancel', drop);
    el.classList.remove('is-dragging');
    gsap.to(el, { x: 0, y: 0, rotation: 0, scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.45)', clearProps: 'transform' });
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', drop);
  el.addEventListener('pointercancel', drop);
}
</script>

<template>
  <div ref="root" class="mg-board" aria-hidden="true">
    <template v-for="(item, i) in ITEMS" :key="i">
      <span v-if="item.kind === 'word'" class="mg-word" :class="{ 'mg-hide-sm': item.hideSm }">
        <span v-for="(l, li) in item.letters" :key="li" class="mg mg-letter" :style="{ '--c': l.colour, '--r': l.r, '--dy': l.dy }" @pointerdown="grab">{{ l.ch }}</span>
      </span>
      <span v-else-if="item.kind === 'food'" class="mg mg-food" :class="{ 'mg-hide-sm': item.hideSm }" :style="{ '--r': item.r, '--dy': item.dy }" @pointerdown="grab">{{ item.emoji }}</span>
      <span v-else class="mg mg-polaroid" :style="{ '--r': item.r, '--dy': item.dy }" @pointerdown="grab">
        <span class="mg-photo"><FridgeMascot mood="stocked" :size="38" /></span>
        <span class="mg-caption">♥ Food ♥</span>
      </span>
    </template>
  </div>
</template>
