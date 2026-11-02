<script setup>
// Swipeable photo gallery: native scroll-snap does the swiping, the arrows, dots and arrow keys drive the same scroller.
import { ref } from 'vue';

const props = defineProps({
  urls: { type: Array, required: true },
  alt: { type: String, required: true },
});
const track = ref(null);
const index = ref(0);

function goTo(i) {
  const el = track.value;
  if (!el) return;
  const next = Math.min(props.urls.length - 1, Math.max(0, i));
  el.scrollTo({ left: next * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function onScroll() {
  const el = track.value;
  if (el?.clientWidth) index.value = Math.round(el.scrollLeft / el.clientWidth);
}
function onKey(e) {
  if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index.value - 1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index.value + 1); }
}
</script>

<template>
  <div class="pc" role="group" aria-roledescription="carousel" :aria-label="`${alt} photos`" data-testid="photo-carousel">
    <div ref="track" class="pc-track" tabindex="0" @scroll.passive="onScroll" @keydown="onKey">
      <img v-for="(url, i) in urls" :key="url" class="pc-slide" :src="url" :alt="`${alt}, photo ${i + 1} of ${urls.length}`"
        :loading="i === 0 ? 'eager' : 'lazy'" />
    </div>
    <template v-if="urls.length > 1">
      <button type="button" class="pc-nav pc-prev" aria-label="Previous photo" :disabled="index === 0" data-testid="photo-prev" @click="goTo(index - 1)">‹</button>
      <button type="button" class="pc-nav pc-next" aria-label="Next photo" :disabled="index === urls.length - 1" data-testid="photo-next" @click="goTo(index + 1)">›</button>
      <div class="pc-dots">
        <button v-for="(url, i) in urls" :key="url" type="button" class="pc-dot" :class="{ 'is-on': i === index }"
          :aria-label="`Show photo ${i + 1}`" :aria-current="i === index" @click="goTo(i)"></button>
      </div>
      <span class="pc-count" aria-hidden="true">{{ index + 1 }} / {{ urls.length }}</span>
    </template>
  </div>
</template>
