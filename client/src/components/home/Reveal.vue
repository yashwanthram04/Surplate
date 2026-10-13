<script setup>
import { Motion } from 'motion-v';

// Fades and slides its content in the first time it scrolls into view.
// App.vue wraps everything in <MotionConfig reducedMotion="user">, so users who ask their
// system for less motion get the content without the slide.
defineProps({
  delay: { type: Number, default: 0 },
  y: { type: Number, default: 28 },
  as: { type: String, default: 'div' },
});
</script>

<template>
  <Motion
    :as="as"
    :initial="{ opacity: 0, y }"
    :while-in-view="{ opacity: 1, y: 0 }"
    :in-view-options="{ once: true, amount: 0.2 }"
    :transition="{ duration: 0.6, delay, ease: 'easeOut' }"
  >
    <slot />
  </Motion>
</template>
