<script setup>
import { computed, ref } from 'vue';
import { burst, hop, useHeroIntro } from '../composables/useFridgeMotion';
import FridgeMascot from './FridgeMascot.vue';

const props = defineProps({
  title: { type: String, required: true },
  mood: { type: String, default: 'stocked' }, // the mascot's face: stocked | low | empty | unknown
  mini: Boolean,
  foods: { type: Array, default: () => ['🥖', '🥗', '🍎', '🥐', '🍊'] },
});
const words = computed(() => props.title.split(' ').map((w) => [...w])); // split so each letter can bounce

const root = ref(null);
useHeroIntro(root);

const mascot = ref(null);
function poke() {
  hop(mascot.value);
  burst(mascot.value);
}
</script>

<template>
  <section ref="root" class="fridge-hero" :class="{ 'is-mini': mini }">
    <span v-for="n in 6" :key="n" class="hero-spark" :class="`s${n}`" :data-depth="1 + n * 0.25" aria-hidden="true">✦</span>

    <div class="hero-stage-wrap" aria-hidden="true">
      <div class="hero-stage" data-depth="0.8">
        <div class="hero-rays"></div>
        <div class="hero-orbit">
          <span v-for="(f, i) in foods" :key="i" class="orb" :style="{ '--a': `${(360 / foods.length) * i}deg` }"><span class="orb-in">{{ f }}</span></span>
        </div>
        <div ref="mascot" class="hero-mascot-pop" title="Poke me!" @click="poke"><FridgeMascot :mood="mood" /></div>
      </div>
    </div>

    <div class="hero-copy">
      <h1 class="fridge-title-xl" :aria-label="title">
        <span v-for="(word, wi) in words" :key="`${title}-${wi}`" class="word" aria-hidden="true"><span v-for="(ch, ci) in word" :key="ci" class="ch"><span class="ch-in">{{ ch }}</span></span></span>
      </h1>
      <slot />
    </div>
  </section>
</template>
