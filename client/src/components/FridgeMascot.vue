<script setup>
import { computed } from 'vue';
import '../fridges.css';

const props = defineProps({
  mood: { type: String, default: 'unknown' }, // stocked | low | empty | unknown
  size: { type: Number, default: 120 }, // width in px
  orbit: Boolean,
});
const m = computed(() => (['stocked', 'low', 'empty'].includes(props.mood) ? props.mood : 'unknown'));
const foods = computed(() => ({ stocked: ['🥖', '🥗', '🍎'], low: ['🥖'], empty: [], unknown: [] })[m.value]);
</script>

<template>
  <span class="mc" :class="`is-${m}`" :style="{ width: `${size}px`, '--mc-size': `${size}px` }" aria-hidden="true">
    <svg class="mc-svg" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse class="mc-shadow" cx="60" cy="134" rx="34" ry="5" />
      <rect class="mc-solid" x="34" y="122" width="15" height="10" rx="4" />
      <rect class="mc-solid" x="71" y="122" width="15" height="10" rx="4" />
      <rect class="mc-body" x="22" y="8" width="76" height="118" rx="22" stroke-width="4.5" />
      <path class="mc-line" d="M22 46 H98" fill="none" stroke-width="4.5" />
      <rect class="mc-solid" x="84" y="19" width="5.5" height="18" rx="2.75" />
      <rect class="mc-solid" x="84" y="58" width="5.5" height="28" rx="2.75" />
      <path d="M32 20 q0 -6 7 -7" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".9" />

      <!-- face: stocked = happy -->
      <g v-if="m === 'stocked'">
        <path class="mc-face" d="M40 82 q5.5 -8 11 0" />
        <path class="mc-face" d="M63 82 q5.5 -8 11 0" />
        <path class="mc-mouth" d="M46 93 Q57 109 68 93 Z" />
        <circle class="mc-cheek" cx="37" cy="93" r="5.5" />
        <circle class="mc-cheek" cx="77" cy="93" r="5.5" />
      </g>
      <!-- low = worried -->
      <g v-else-if="m === 'low'">
        <g class="mc-eyes"><circle class="mc-eye" cx="46" cy="82" r="4" /><circle class="mc-eye" cx="68" cy="82" r="4" /></g>
        <path class="mc-face" d="M39 72 l10 -3" /><path class="mc-face" d="M75 72 l-10 -3" />
        <path class="mc-face" d="M48 98 q3 -4 6 0 t6 0 t6 0" />
        <path class="mc-drop" d="M82 66 q-5 8 0 11 q5 -3 0 -11 z" />
      </g>
      <!-- empty = sad -->
      <g v-else-if="m === 'empty'">
        <g class="mc-eyes"><circle class="mc-eye" cx="46" cy="82" r="4" /><circle class="mc-eye" cx="68" cy="82" r="4" /></g>
        <path class="mc-face" d="M38 77 l11 -6" /><path class="mc-face" d="M76 77 l-11 -6" />
        <path class="mc-face" d="M48 101 Q57 92 66 101" />
        <path class="mc-tear" d="M46 89 q-4 7 0 9 q4 -2 0 -9 z" />
      </g>
      <!-- unknown = sleepy -->
      <g v-else>
        <path class="mc-face" d="M40 82 h11" /><path class="mc-face" d="M63 82 h11" />
        <circle class="mc-face" cx="57" cy="97" r="3.4" />
        <text class="mc-zzz" x="86" y="60" font-size="13" font-weight="700">z</text>
        <text class="mc-zzz z2" x="94" y="48" font-size="10" font-weight="700">z</text>
      </g>
    </svg>
    <template v-if="orbit">
      <span v-for="(f, i) in foods" :key="f" class="mc-food" :class="`mf${i + 1}`">{{ f }}</span>
    </template>
  </span>
</template>
