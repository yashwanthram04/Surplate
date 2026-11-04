<script setup>
import { computed } from 'vue';

const props = defineProps({ text: { type: String, required: true } });
const words = computed(() => props.text.trim().split(/\s+/));
</script>

<template>
  <h1 :aria-label="text">
    <span v-for="(word, index) in words" :key="`${text}-${index}`" class="title-word" :style="{ '--word-delay': `${index * 55}ms` }" aria-hidden="true">{{ word }}{{ index < words.length - 1 ? ' ' : '' }}</span>
  </h1>
</template>

<style scoped>
.title-word {
  display: inline-block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 100%;
  animation: title-bounce 800ms both;
  animation-delay: var(--word-delay);
  transform-origin: bottom center;
}
@keyframes title-bounce {
  0% { opacity: 0; transform: translateY(18px) rotate(-4deg) scale(.88); }
  55% { opacity: 1; transform: translateY(-5px) rotate(1deg) scale(1.03); }
  78% { transform: translateY(2px) rotate(-.5deg); }
  100% { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .title-word { animation: none; } }
</style>
