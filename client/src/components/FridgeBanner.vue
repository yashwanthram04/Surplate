<script setup>
import { computed, ref } from 'vue';
import { burst, hop, useHeroIntro } from '../composables/useFridgeMotion';
import FridgeHeroMap from './FridgeHeroMap.vue';
import FridgeMascot from './FridgeMascot.vue';

const props = defineProps({
  title: { type: String, required: true },
  mood: { type: String, default: 'stocked' }, // the mascot's face: stocked | low | empty | unknown
  mini: Boolean,
  foods: { type: Array, default: () => ['🥖', '🥗', '🍎', '🥐', '🍊'] },
  fridges: { type: Array, default: null }, // pass the fridges to show the Singapore mini-map (full banner only)
});
const words = computed(() => props.title.split(' ').map((w) => [...w])); // split so each letter can bounce
const showMap = computed(() => !props.mini && !!props.fridges);

const root = ref(null);
useHeroIntro(root);

const mascot = ref(null);
function poke() {
  hop(mascot.value);
  burst(mascot.value);
}
</script>

<template>
  <section ref="root" class="fridge-hero" :class="{ 'is-mini': mini, 'has-map': showMap }">
    <!-- the banner is a fridge door: frosted glass, drifting cold mist, a rubber seal and a chrome handle -->
    <span class="hero-frost" aria-hidden="true"></span>
    <span v-for="n in 3" :key="`m${n}`" class="hero-mist" :class="`m${n}`" aria-hidden="true"></span>
    <span class="hero-seal" aria-hidden="true"></span>
    <span class="hero-handle" aria-hidden="true"></span>
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

    <div v-if="showMap" class="hero-map-wrap" data-depth="0.35"><FridgeHeroMap :fridges="fridges" /></div>

    <div class="hero-copy">
      <h1 class="fridge-title-xl" :aria-label="title">
        <span v-for="(word, wi) in words" :key="`${title}-${wi}`" class="word" aria-hidden="true"><span v-for="(ch, ci) in word" :key="ci" class="ch"><span class="ch-in">{{ ch }}</span></span></span>
      </h1>
      <slot />
    </div>
  </section>
</template>
