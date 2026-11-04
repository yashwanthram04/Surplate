<script setup>
// A burst of breads that fly up the screen and fade away.
// The parent page calls it like this:   burst.value.celebrate()
import { nextTick, ref } from 'vue';
import { gsap } from 'gsap';

const breadEmojis = ['🥖', '🍞', '🥐', '🥯', '🥨'];
const flyingBreads = ref([]);

async function celebrate() {
  // People who turned off animations in their computer settings get no flying bread
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Make 30 breads, each with a random emoji, spot and size
  const list = [];
  for (let i = 0; i < 30; i++) {
    list.push({
      id: i,
      emoji: breadEmojis[Math.floor(Math.random() * breadEmojis.length)],
      left: Math.random() * 95, // % from the left edge of the screen
      size: 2 + Math.random() * 2, // rem
    });
  }
  flyingBreads.value = list;

  await nextTick(); // wait until the breads are on the page

  gsap.fromTo(
    '.flying-bread',
    { y: 0, opacity: 1, scale: 0.6, rotation: 0 }, // start: bottom of the screen
    {
      y: () => -window.innerHeight * (0.5 + Math.random() * 0.5), // fly up (random height)
      x: () => (Math.random() - 0.5) * 200, // drift left or right
      rotation: () => (Math.random() - 0.5) * 720, // spin
      scale: 1.2,
      opacity: 0,
      duration: 2,
      ease: 'power1.out',
      stagger: 0.05, // each bread starts a tiny bit after the one before
      onComplete: () => { flyingBreads.value = []; }, // remove them all when finished
    }
  );
}

// Lets the parent page call celebrate()
defineExpose({ celebrate });
</script>

<template>
  <div class="bread-burst" aria-hidden="true">
    <span
      v-for="bread in flyingBreads"
      :key="bread.id"
      class="flying-bread"
      :style="{ left: bread.left + '%', fontSize: bread.size + 'rem' }"
    >{{ bread.emoji }}</span>
  </div>
</template>

<style scoped>
.flying-bread {
  position: fixed;
  bottom: 0; /* they start at the bottom of the screen */
  pointer-events: none; /* clicks go straight through them */
  z-index: 2000;
}
</style>