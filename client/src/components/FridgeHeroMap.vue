<script setup>
import { gsap } from 'gsap';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { prefersReducedMotion } from '../composables/useFridgeMotion';
import { displayStatus, statusMeta } from '../utils/fridge';
import '../fridges.css';

// A small, stylised Singapore in the banner: one glowing dot per fridge at its real location.
const props = defineProps({ fridges: { type: Array, default: () => [] } });
const router = useRouter();

// Equirectangular projection, 1 unit = 0.001°. Near the equator that keeps the island's shape.
const LNG0 = 103.59;
const LAT0 = 1.48;
const W = 460;
const H = 245;
const project = (lng, lat) => [(lng - LNG0) * 1000, (LAT0 - lat) * 1000];

// Simplified coastlines as [lng, lat], clockwise. Close enough for a decorative map, not for navigation.
const COASTS = [
  // main island, from Tuas round the north coast to Changi and back along the south
  [[103.607, 1.315], [103.625, 1.338], [103.65, 1.352], [103.672, 1.372], [103.693, 1.4], [103.712, 1.428], [103.735, 1.446], [103.762, 1.447], [103.787, 1.452], [103.808, 1.46], [103.828, 1.467], [103.848, 1.458], [103.868, 1.437], [103.888, 1.428], [103.908, 1.42], [103.93, 1.402], [103.955, 1.39], [103.98, 1.392], [104.0, 1.388], [104.025, 1.372], [104.035, 1.35], [104.022, 1.326], [103.995, 1.315], [103.965, 1.305], [103.935, 1.3], [103.905, 1.296], [103.88, 1.29], [103.868, 1.275], [103.852, 1.266], [103.832, 1.262], [103.808, 1.268], [103.785, 1.274], [103.765, 1.282], [103.745, 1.292], [103.725, 1.3], [103.7, 1.31], [103.675, 1.305], [103.65, 1.3], [103.628, 1.302]],
  // Pulau Ubin
  [[103.925, 1.412], [103.95, 1.42], [103.975, 1.42], [103.995, 1.412], [103.985, 1.402], [103.955, 1.4], [103.932, 1.403]],
  // Sentosa
  [[103.812, 1.255], [103.826, 1.258], [103.843, 1.254], [103.84, 1.246], [103.822, 1.246], [103.811, 1.249]],
  // Jurong Island
  [[103.665, 1.285], [103.69, 1.29], [103.718, 1.283], [103.725, 1.268], [103.705, 1.255], [103.678, 1.258], [103.662, 1.27]],
];

/** Closed Catmull-Rom spline through the points, as an SVG path of cubic Béziers. */
function smoothPath(points) {
  const n = points.length;
  const p = (i) => points[(i + n) % n];
  let d = `M${p(0)[0].toFixed(1)} ${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}
const LAND = COASTS.map((c) => smoothPath(c.map(([lng, lat]) => project(lng, lat))));

const dots = computed(() =>
  props.fridges
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lng))
    .map((f, i) => {
      const [x, y] = project(f.lng, f.lat);
      const status = displayStatus(f);
      return { id: f.id, name: f.name, status, label: statusMeta(status).label, x, y, delay: `${(i % 5) * 0.55}s`, href: router.resolve({ name: 'fridge', params: { id: f.id } }).href };
    })
);

const root = ref(null);
const tip = ref(null);
function showTip(d) {
  tip.value = { name: d.name, label: d.label, left: `${(d.x / W) * 100}%`, top: `${(d.y / H) * 100}%` };
}

// Dots pop in one by one: on load, and again for any dot a filter change brings back.
async function popIn() {
  await nextTick();
  if (prefersReducedMotion() || !root.value) return;
  const fresh = [...root.value.querySelectorAll('.hm-pop:not([data-in])')];
  if (!fresh.length) return;
  fresh.forEach((el) => el.setAttribute('data-in', ''));
  gsap.from(fresh, { scale: 0, transformOrigin: '50% 50%', duration: 0.6, ease: 'back.out(3)', stagger: 0.07, delay: 0.5 });
}
onMounted(popIn);
watch(() => dots.value.map((d) => d.id).join(), popIn);
onBeforeUnmount(() => root.value && gsap.killTweensOf(root.value.querySelectorAll('.hm-pop')));
</script>

<template>
  <div ref="root" class="hero-map">
    <svg :viewBox="`0 0 ${W} ${H}`" role="group" aria-label="Where the fridges are in Singapore">
      <path v-for="(d, i) in LAND" :key="i" class="hm-land" :d="d" />
      <a
        v-for="d in dots"
        :key="d.id"
        :href="d.href"
        class="hm-dot"
        :class="`status-${d.status}`"
        :aria-label="`${d.name}: ${d.label}`"
        @click.prevent="router.push(d.href)"
        @mouseenter="showTip(d)"
        @mouseleave="tip = null"
        @focus="showTip(d)"
        @blur="tip = null"
      >
        <g :transform="`translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})`">
          <g class="hm-pop">
            <circle class="hm-ping" r="5" :style="{ animationDelay: d.delay }" />
            <circle class="hm-core" r="5" />
          </g>
        </g>
      </a>
    </svg>
    <div v-if="tip" class="hm-tip" :style="{ left: tip.left, top: tip.top }" aria-hidden="true">{{ tip.name }}<span>{{ tip.label }}</span></div>
    <p class="hm-caption">Tap a dot to open that fridge</p>
  </div>
</template>
