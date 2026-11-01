import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import '../fridges.css';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let lenis = null;
let tick = null;
let users = 0;

function startLenis() {
  users += 1;
  if (lenis || prefersReducedMotion()) return;
  lenis = new Lenis({
    lerp: 0.09,
    smoothWheel: true,
    // Let the map (wheel = zoom), the pop-up windows and the address dropdown scroll the normal way.
    prevent: (node) => !!node.closest?.('.map-box, .modal-backdrop-sp, .address-results'),
  });
  lenis.on('scroll', ScrollTrigger.update); // keep GSAP's scroll animations in step with Lenis
  tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
}

function stopLenis() {
  users = Math.max(0, users - 1);
  if (users > 0 || !lenis) return;
  gsap.ticker.remove(tick);
  gsap.ticker.lagSmoothing(500, 33); // GSAP's default
  lenis.destroy();
  lenis = null;
  tick = null;
}

export function useSmoothScroll() {
  onMounted(startLenis);
  onBeforeUnmount(stopLenis);
}

export const vReveal = {
  mounted(el, binding) {
    if (prefersReducedMotion()) return;
    const delay = (Number(binding.value) || 0) % 6 * 0.07;
    el._reveal = gsap.from(el, {
      y: 28,
      opacity: 0,
      duration: 0.7,
      delay,
      ease: 'power3.out',
      clearProps: 'transform,opacity', // hand control back to CSS (hover effects) when finished
      scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    });
  },
  unmounted(el) {
    el._reveal?.scrollTrigger?.kill();
    el._reveal?.kill();
  },
};

export const vParallax = {
  mounted(el, binding) {
    if (prefersReducedMotion()) return;
    const amount = Number(binding.value) || 8;
    el._parallax = gsap.fromTo(
      el,
      { yPercent: -amount, scale: 1.2 },
      {
        yPercent: amount,
        scale: 1.2,
        ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      }
    );
  },
  unmounted(el) {
    el._parallax?.scrollTrigger?.kill();
    el._parallax?.kill();
  },
};

export function useCountUp(getter) {
  const shown = ref(0);
  const state = { v: 0 };
  watch(
    getter,
    (target) => {
      if (prefersReducedMotion()) {
        shown.value = target;
        return;
      }
      gsap.to(state, { v: target, duration: 1.1, ease: 'power2.out', overwrite: true, onUpdate: () => (shown.value = Math.round(state.v)) });
    },
    { immediate: true }
  );
  onBeforeUnmount(() => gsap.killTweensOf(state));
  return shown;
}

export function useHeroIntro(root) {
  let ctx = null;
  onMounted(() => {
    if (prefersReducedMotion() || !root.value) return;
    ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out', clearProps: 'transform,opacity' } })
        .from('.hero-fx-title', { y: 30, opacity: 0, duration: 0.7 })
        .from('.hero-fx-sub', { y: 20, opacity: 0, duration: 0.6 }, '-=0.45')
        .from('.hero-fx-action', { y: 16, opacity: 0, duration: 0.5 }, '-=0.4')
        .from('.hero-stat', { y: 18, opacity: 0, scale: 0.94, duration: 0.5, stagger: 0.08 }, '-=0.3');
      // the floating food emoji bob gently
      gsap.to('.hero-float', { y: '+=14', rotation: '+=7', duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.6, from: 'random' } });
    }, root.value);
  });
  onBeforeUnmount(() => ctx?.revert());
}
