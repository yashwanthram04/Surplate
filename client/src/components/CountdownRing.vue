<script setup>
import { computed } from 'vue';
import { now } from '../composables/useNow';
import { formatRemaining } from '../utils/time';

// Ring showing how much of the pickup window is left. Before it opens it shows
// "starts in …", and once it has closed it shows "Ended".
const props = defineProps({
  start: { type: [String, Number, Date], required: true },
  end: { type: [String, Number, Date], required: true },
  size: { type: Number, default: 58 },
});

const R = 18;
const C = 2 * Math.PI * R;

const startMs = computed(() => new Date(props.start).getTime());
const endMs = computed(() => new Date(props.end).getTime());
const phase = computed(() => (now.value < startMs.value ? 'upcoming' : now.value <= endMs.value ? 'open' : 'ended'));
const remaining = computed(() => endMs.value - now.value);
const fraction = computed(() => {
  if (phase.value === 'ended') return 0;
  if (phase.value === 'upcoming') return 1;
  return Math.min(1, Math.max(0, remaining.value / (endMs.value - startMs.value)));
});
const color = computed(() => {
  if (phase.value === 'ended') return '#9ca3af';
  if (phase.value === 'upcoming') return '#6b7280';
  if (remaining.value <= 10 * 60 * 1000) return 'var(--sp-red)';
  if (remaining.value <= 30 * 60 * 1000) return 'var(--sp-amber)';
  return 'var(--sp-green)';
});
const centerText = computed(() => {
  if (phase.value === 'ended') return 'Ended';
  if (phase.value === 'upcoming') return formatRemaining(startMs.value - now.value);
  return formatRemaining(remaining.value);
});
const caption = computed(() => (phase.value === 'upcoming' ? 'until pickup opens' : phase.value === 'open' ? 'left to collect' : 'pickup closed'));
const label = computed(() => `${centerText.value} ${caption.value}`);
</script>

<template>
  <svg
    class="countdown-ring"
    :width="size"
    :height="size"
    viewBox="0 0 44 44"
    role="img"
    :aria-label="label"
    :data-phase="phase"
  >
    <title>{{ label }}</title>
    <circle cx="22" cy="22" :r="R" fill="none" stroke="#e5e7eb" stroke-width="4" />
    <circle
      cx="22"
      cy="22"
      :r="R"
      fill="none"
      :stroke="color"
      stroke-width="4"
      stroke-linecap="round"
      :stroke-dasharray="phase === 'upcoming' ? '3 4' : C"
      :stroke-dashoffset="phase === 'upcoming' ? 0 : C * (1 - fraction)"
      transform="rotate(-90 22 22)"
      style="transition: stroke-dashoffset 1s linear"
    />
    <text x="22" y="25" text-anchor="middle" :font-size="centerText.length > 4 ? 8 : 9.5" font-weight="600" :fill="color">{{ centerText }}</text>
  </svg>
</template>
