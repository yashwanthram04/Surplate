<script setup>
import { computed, ref } from 'vue';
import BouncingHeading from './BouncingHeading.vue';
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
      <BouncingHeading class="fridge-title-xl" :text="title" />
      <slot />
    </div>
  </section>
</template>
