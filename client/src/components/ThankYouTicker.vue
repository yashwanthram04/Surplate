<script setup>
import { gsap } from 'gsap';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { motionAllowed } from '../composables/useMotion';
import { tickerItems } from '../utils/reviews';
import { scrollVelocity } from '../utils/wallMotion';

// A strip of recent thank-yous drifting across the wall, like a news ticker. Scrolling the page speeds it up and
// turns it round to follow the scroll; the mouse (or keyboard focus) brings it to a stop so a quote can be read;
// clicking a quote asks the wall to jump to that note. With reduced motion it is a plain strip you can scroll.
const props = defineProps({ notes: { type: Array, required: true } });
const emit = defineEmits(['pick']);

const items = computed(() => tickerItems(props.notes));
const track = ref(null);
const moving = ref(false);
let loop = null;
let tick = null;
let hovering = false;

function stop() {
  if (tick) gsap.ticker.remove(tick);
  loop?.kill();
  loop = tick = null;
  if (track.value) gsap.set(track.value, { clearProps: 'transform' });
}

async function start() {
  stop();
  moving.value = motionAllowed() && items.value.length > 0;
  if (!moving.value) return;
  await nextTick(); // the second copy of the quotes is now on the page
  loop = gsap.to(track.value, { xPercent: -50, ease: 'none', duration: items.value.length * 5, repeat: -1 });
  loop.totalTime(loop.duration() * 1000); // far enough in that it can also run backwards when the page scrolls up
  let speed = 1;
  let direction = 1;
  tick = () => {
    const v = scrollVelocity();
    if (Math.abs(v) > 0.5) direction = Math.sign(v);
    const target = hovering ? 0 : direction * (1 + Math.min(5, Math.abs(v) * 0.06));
    speed += (target - speed) * 0.08;
    // Under the mouse or keyboard focus it eases to a full stop, so a quote can be read and clicked.
    if (hovering && Math.abs(speed) < 0.02) {
      speed = 0;
      if (!loop.paused()) loop.pause();
      return;
    }
    if (loop.paused()) loop.resume();
    loop.timeScale(Math.abs(speed) < 0.001 ? 0.001 * direction : speed);
  };
  gsap.ticker.add(tick);
}

const slow = (on) => (hovering = on);
watch(() => items.value.map((i) => i.id + i.text).join('|'), start);
onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <section class="ticker" :class="{ 'is-moving': moving }" aria-label="Recent thank-yous" data-testid="ticker"
    @pointerenter="slow(true)" @pointerleave="slow(false)" @focusin="slow(true)" @focusout="slow(false)">
    <div ref="track" class="ticker-track">
      <template v-for="copy in moving ? 2 : 1" :key="copy">
        <button
          v-for="(item, i) in items"
          :key="`${copy}-${i}`"
          type="button"
          class="ticker-item"
          :tabindex="copy > 1 || item.repeat ? -1 : 0"
          :aria-hidden="copy > 1 || item.repeat ? 'true' : undefined"
          data-testid="ticker-item"
          @click="emit('pick', item.id)"
        >
          <span class="ticker-heart" aria-hidden="true">💛</span>
          <span class="ticker-quote">“{{ item.text }}”</span>
          <span class="ticker-who">{{ item.nickname }}</span>
          <span class="ticker-stars"><i class="bi bi-star-fill" aria-hidden="true"></i> {{ item.stars }}<span class="visually-hidden"> out of 5</span></span>
        </button>
      </template>
    </div>
  </section>
</template>
