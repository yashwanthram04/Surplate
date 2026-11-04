import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import '../fridges.css';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches;

let lenis = null;
let tick = null;
let users = 0; // how many fridge pages are mounted (two can overlap for a moment during a page change)

function startLenis() {
  users += 1;
  document.documentElement.classList.add('fridge-route');
  if (lenis || prefersReducedMotion()) return;
  lenis = new Lenis({
    lerp: 0.085,
    smoothWheel: true,
    prevent: (node) => !!node.closest?.('.map-box, .modal-backdrop-sp, .address-results'),
  });
  lenis.on('scroll', ScrollTrigger.update);
  tick = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
}

function stopLenis() {
  users = Math.max(0, users - 1);
  if (users > 0) return;
  document.documentElement.classList.remove('fridge-route');
  if (!lenis) return;
  gsap.ticker.remove(tick);
  gsap.ticker.lagSmoothing(500, 33);
  lenis.destroy();
  lenis = null;
  tick = null;
}

export const getScrollVelocity = () => lenis?.velocity ?? 0;
export function useSmoothScroll() {
  onMounted(startLenis);
  onBeforeUnmount(stopLenis);
}

export const vReveal = {
  mounted(el, binding) {
    if (prefersReducedMotion()) return;
    const i = Number(binding.value) || 0;
    const lean = (i % 2 ? 1 : -1) * 8 * Math.min(1, 360 / (el.offsetWidth || 360));
    el._reveal = gsap
      .timeline({ delay: (i % 3) * 0.09, scrollTrigger: { trigger: el, start: 'top 94%', once: true } })
      .from(el, { opacity: 0, duration: 0.35, clearProps: 'opacity' })
      .from(el, { y: 120, rotation: lean, scale: 0.8, duration: 1.2, ease: 'elastic.out(1, 0.7)', clearProps: 'transform' }, 0);
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

// v-tilt="6" tilts up to 6° each way (default 12°); big cards look better with less.
export const vTilt = {
  mounted(el, binding) {
    if (prefersReducedMotion() || !canHover()) return;
    const max = Number(binding.value) || 12;
    gsap.set(el, { transformPerspective: 800 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.45, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.45, ease: 'power3.out' });
    const lift = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      ry(px * max);
      rx(-py * max);
      lift(-max * 0.66);
    };
    const leave = () => {
      rx(0);
      ry(0);
      lift(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el._tilt = { move, leave };
  },
  unmounted(el) {
    if (!el._tilt) return;
    el.removeEventListener('pointermove', el._tilt.move);
    el.removeEventListener('pointerleave', el._tilt.leave);
    gsap.killTweensOf(el);
  },
};

// A glossy highlight that follows the pointer. Needs a `.panel-glare` child; it reads --gx/--gy.
export const vGlare = {
  mounted(el) {
    if (prefersReducedMotion() || !canHover()) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`);
      el.classList.add('is-glaring');
    };
    const leave = () => el.classList.remove('is-glaring');
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el._glare = { move, leave };
  },
  unmounted(el) {
    if (!el._glare) return;
    el.removeEventListener('pointermove', el._glare.move);
    el.removeEventListener('pointerleave', el._glare.leave);
  },
};

// The photo opens like a fridge door: a door panel (`.fridge-door`) swings open on its left hinge
// and the cold light behind it (`.fridge-door-glow`) fades. Both stay hidden when motion is reduced.
export const vDoor = {
  mounted(el) {
    if (prefersReducedMotion()) return;
    const door = el.querySelector('.fridge-door');
    const glow = el.querySelector('.fridge-door-glow');
    if (!door) return;
    el._door = gsap
      .timeline({ delay: 0.25 })
      .set([door, glow], { autoAlpha: 1 })
      .set(door, { transformOrigin: '0% 50%', transformPerspective: 1400 })
      .to(door, { rotationY: -112, duration: 1.15, ease: 'power2.inOut' })
      .to(glow, { autoAlpha: 0, duration: 1.1, ease: 'power1.out' }, 0.55)
      .set(door, { autoAlpha: 0, clearProps: 'transform' });
  },
  unmounted(el) {
    el._door?.kill();
  },
};

// Status history: one rail draws down the timeline, its tip following the line 90% down the screen, so
// everything already on screen is drawn at load and the rest draws in as you scroll. Each dot pops in
// (with a ripple) when the rail reaches it. Without this (reduced motion) the static line segments show.
export const vTimeline = {
  mounted(el) {
    if (prefersReducedMotion()) return;
    const rail = el.querySelector('.timeline-rail');
    const list = el.querySelector('.timeline');
    if (!rail || !list) return;
    el.classList.add('is-drawn');
    const DOT = 1.2 * 16 + 0.425 * 16; // centre of an item's dot from its top (see .update-item::before)
    const state = { p: 0 };
    let reached = 0; // the rail only ever grows
    let height = 0;
    let top = 0;

    // offsetTop is relative to `el` (position: relative), the same box the rail is placed in
    const layout = () => {
      const items = [...list.children];
      top = items.length ? items[0].offsetTop + DOT : 0;
      height = items.length ? items[items.length - 1].offsetTop + DOT - top : 0;
      rail.style.top = `${top}px`;
      rail.style.height = `${height}px`;
    };
    const paint = () => {
      rail.style.transform = `scaleY(${state.p})`;
      const drawn = state.p * height;
      for (const li of list.children) li.classList.toggle('dot-on', state.p > 0 && li.offsetTop + DOT - top <= drawn + 2);
    };
    const grow = gsap.quickTo(state, 'p', { duration: 0.7, ease: 'power2.out', onUpdate: paint });
    const measure = () => {
      layout();
      if (!list.children.length) return;
      const railTop = el.getBoundingClientRect().top + top;
      const line = window.innerHeight * 0.9;
      const target = height > 0 ? gsap.utils.clamp(0, 1, (line - railTop) / height) : railTop <= line ? 1 : 0;
      reached = Math.max(reached, target);
      grow(reached);
      paint();
    };

    el._timeline = { measure };
    el._timelineST = ScrollTrigger.create({ trigger: list, start: 'top bottom', end: 'bottom top', onUpdate: measure, onRefresh: measure });
    requestAnimationFrame(measure);
  },
  updated(el) {
    // re-measure after any re-render (a new update posted, older ones loaded, photos changing height)
    if (el._timeline) requestAnimationFrame(el._timeline.measure);
  },
  unmounted(el) {
    el._timelineST?.kill();
  },
};

export const vMagnetic = {
  mounted(el) {
    if (prefersReducedMotion() || !canHover()) return;
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.45)' });
    const move = (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.45);
    };
    const leave = () => {
      xTo(0);
      yTo(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el._magnet = { move, leave };
  },
  unmounted(el) {
    if (!el._magnet) return;
    el.removeEventListener('pointermove', el._magnet.move);
    el.removeEventListener('pointerleave', el._magnet.leave);
    gsap.killTweensOf(el);
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
      gsap.to(state, { v: target, duration: 1.4, ease: 'power3.out', overwrite: true, onUpdate: () => (shown.value = Math.round(state.v)) });
    },
    { immediate: true }
  );
  onBeforeUnmount(() => gsap.killTweensOf(state));
  return shown;
}

export function burst(origin, emojis = ['🥖', '🥗', '🍎', '🎉', '💚', '✨'], count = 22) {
  if (prefersReducedMotion() || !origin) return;
  const r = origin.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const tl = gsap.timeline({ onComplete: () => layer.remove() });
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement('span');
    bit.className = 'fx-bit';
    bit.textContent = emojis[i % emojis.length];
    bit.style.left = `${r.left + r.width / 2}px`;
    bit.style.top = `${r.top + r.height / 2}px`;
    layer.append(bit);
    const dx = gsap.utils.random(-220, 220);
    const up = gsap.utils.random(-260, -90);
    tl.fromTo(bit, { scale: 0, opacity: 1 }, { x: dx, y: up, scale: gsap.utils.random(0.8, 1.6), rotation: gsap.utils.random(-300, 300), duration: 0.75, ease: 'power2.out' }, 0)
      .to(bit, { y: up + gsap.utils.random(260, 420), x: dx * 1.15, opacity: 0, rotation: '+=120', duration: 1, ease: 'power1.in' }, 0.7);
  }
}

export function useScrollSkew(target, max = 5) {
  let step = null;
  onMounted(() => {
    if (prefersReducedMotion()) return;
    let el = null;
    let skewTo = null;
    step = () => {
      if (target.value !== el) {
        el = target.value;
        skewTo = el && gsap.quickTo(el, 'skewY', { duration: 0.6, ease: 'power3.out' });
      }
      skewTo?.(gsap.utils.clamp(-max, max, getScrollVelocity() * -0.2));
    };
    gsap.ticker.add(step);
  });
  onBeforeUnmount(() => {
    if (step) gsap.ticker.remove(step);
    if (target.value) gsap.killTweensOf(target.value);
  });
}

// a full spin with a little grow, then it settles back with a wobble
export function spin(el) {
  if (prefersReducedMotion() || !el || gsap.isTweening(el)) return;
  gsap
    .timeline()
    .to(el, { rotation: 360, scale: 1.3, duration: 0.7, ease: 'back.out(1.4)' })
    .to(el, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' }, '-=0.15')
    .set(el, { rotation: 0, clearProps: 'transform' });
}

export function hop(el) {
  if (prefersReducedMotion() || !el || gsap.isTweening(el)) return;
  gsap
    .timeline()
    .set(el, { transformOrigin: '50% 100%' })
    .to(el, { scaleX: 1.25, scaleY: 0.72, duration: 0.14, ease: 'power2.in' })
    .to(el, { y: -70, scaleX: 0.9, scaleY: 1.12, rotation: 360, duration: 0.5, ease: 'power2.out' })
    .to(el, { y: 0, scaleX: 1, scaleY: 1, duration: 0.6, ease: 'bounce.out' })
    .set(el, { rotation: 0 });
}

export function useHeroIntro(root) {
  let ctx = null;
  let onMove = null;
  let onLeave = null;
  onMounted(() => {
    const el = root.value;
    if (prefersReducedMotion() || !el) return;
    ctx = gsap.context(() => {
      const chars = gsap.utils.toArray('.ch');
      const R = gsap.utils.random;

      gsap
        .timeline({ defaults: { clearProps: 'transform,opacity' } })
        .from(chars, { yPercent: -260, rotation: () => R(-70, 70), opacity: 0, duration: 1.1, ease: 'bounce.out', stagger: { each: 0.04, from: 'random' } }, 0.15)
        .from('.hero-copy > :not(h1)', { y: 34, scale: 0.85, opacity: 0, duration: 0.75, ease: 'back.out(2.2)', stagger: 0.12 }, 0.75)
        .from('.hero-rays', { scale: 0, opacity: 0, duration: 1.4, ease: 'expo.out', clearProps: 'opacity' }, 0.3)
        .from('.hero-mascot-pop', { yPercent: 150, scaleX: 0.6, scaleY: 1.5, opacity: 0, duration: 1.3, ease: 'elastic.out(1, 0.5)' }, 0.45)
        .from('.orb-in', { scale: 0, duration: 0.7, ease: 'back.out(3)', stagger: 0.08, clearProps: 'opacity' }, 0.95)
        .from('.hero-spark', { scale: 0, duration: 0.5, ease: 'back.out(3)', stagger: 0.06, clearProps: 'opacity' }, 0.6);

      // the letters ripple like a wave every few seconds
      gsap
        .timeline({ repeat: -1, repeatDelay: 3.8, delay: 2.8 })
        .to(chars, { y: -18, rotation: () => R(-12, 12), duration: 0.22, ease: 'power2.out', stagger: 0.045, yoyo: true, repeat: 1 });

      // food circles the mascot (each item turns back the other way so it stays upright) and bobs
      gsap.to('.hero-orbit', { rotation: 360, duration: 24, ease: 'none', repeat: -1 });
      gsap.to('.orb-in', { rotation: -360, duration: 24, ease: 'none', repeat: -1 });
      gsap.to('.orb-in', { y: -9, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.3, from: 'random' } });
      gsap.to('.hero-rays', { rotation: 360, duration: 40, ease: 'none', repeat: -1 });

      // sparkles twinkle (once the entrance is over)
      gsap.utils.toArray('.hero-spark').forEach((s) => {
        gsap.to(s, { scale: 0.35, rotation: 90, opacity: 0.35, duration: R(0.8, 1.6), ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1.5 + R(0, 1.5) });
      });

      // hovering a letter makes it jump and flash yellow (on .ch-in, so it never fights the ripple on .ch)
      gsap.utils.toArray('.ch-in').forEach((c) => {
        c.addEventListener('mouseenter', () => {
          gsap
            .timeline({ overwrite: 'auto' })
            .to(c, { y: -22, scale: 1.3, rotation: R(-20, 20), color: '#ffd66b', duration: 0.18, ease: 'power2.out' })
            .to(c, { y: 0, scale: 1, rotation: 0, color: '#fff', duration: 0.7, ease: 'elastic.out(1, 0.35)' });
        });
      });

      // scrolling past: the words drift up and fade, the mascot sinks and spins away
      gsap
        .timeline({ scrollTrigger: { trigger: el, start: 'top top+=72', end: 'bottom top', scrub: 0.8 } })
        .to('.hero-copy', { yPercent: -16, opacity: 0.25, ease: 'none' }, 0)
        .to('.hero-stage-wrap', { yPercent: 28, rotation: 24, scale: 0.8, ease: 'none' }, 0);
    }, el);

    if (canHover()) {
      const layers = gsap.utils.toArray('[data-depth]', el);
      const movers = layers.map((l) => ({ depth: Number(l.dataset.depth) || 1, x: gsap.quickTo(l, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(l, 'y', { duration: 0.9, ease: 'power3.out' }) }));
      onMove = (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        movers.forEach((m) => {
          m.x(-px * m.depth * 46);
          m.y(-py * m.depth * 34);
        });
      };
      onLeave = () => movers.forEach((m) => {
        m.x(0);
        m.y(0);
      });
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
    }
  });
  onBeforeUnmount(() => {
    const el = root.value;
    if (el && onMove) {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    }
    ctx?.revert();
  });
}
