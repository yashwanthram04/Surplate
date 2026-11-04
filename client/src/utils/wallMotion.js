// GSAP + Lenis motion for the Thank-you Wall and the other reviews pages: smooth scrolling, notes that sway with
// the scroll, a parallax hero, the title writing itself in, notes tilting towards the pointer, an edited note
// flipping over, a deleted note crumpled and tossed away, magnetic buttons and rubber stamps.
// Every effect does nothing for visitors who ask for reduced motion (and in jsdom, which has no matchMedia).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { onBeforeUnmount, onMounted } from 'vue';
import { motionAllowed } from '../composables/useMotion';

gsap.registerPlugin(SplitText);
// ScrollTrigger is registered on first use, and only where motion is allowed: registering it touches
// window.matchMedia, which some environments (jsdom in the tests) do not have.
let scrollTriggerReady = false;
function useScrollTrigger() {
  if (!scrollTriggerReady) gsap.registerPlugin(ScrollTrigger);
  scrollTriggerReady = true;
  return ScrollTrigger;
}

// ---- smooth scrolling ------------------------------------------------------------------------
let lenis = null;

/** How fast (and which way) the page is scrolling right now: + down, - up. 0 without smooth scrolling. */
export const scrollVelocity = () => lenis?.velocity ?? 0;

/** Lenis smooth scrolling while the calling page is mounted, fed into ScrollTrigger (same set-up as the home page). */
export function useSmoothScroll() {
  let mine = null;
  let tick = null;
  onMounted(() => {
    if (lenis || !motionAllowed()) return;
    // Modals scroll on their own, so wheel events inside them are left to the browser.
    mine = lenis = new Lenis({ lerp: 0.09, smoothWheel: true, prevent: (node) => !!node.closest?.('.modal-backdrop-sp') });
    lenis.on('scroll', useScrollTrigger().update);
    tick = (time) => mine.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  });
  onBeforeUnmount(() => {
    if (!mine) return;
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    mine.destroy();
    if (lenis === mine) lenis = null;
    mine = null;
  });
}

/** Glides the page until `el` sits in the middle of the screen. Resolves when it gets there. */
export function scrollToEl(el) {
  if (!el) return Promise.resolve();
  if (!lenis) {
    el.scrollIntoView?.({ behavior: motionAllowed() ? 'smooth' : 'auto', block: 'center' });
    return Promise.resolve();
  }
  const offset = -Math.max(80, (window.innerHeight - el.offsetHeight) / 2);
  return new Promise((resolve) => lenis.scrollTo(el, { offset, duration: 1.1, onComplete: resolve }));
}

/** How far the notes lean while the page scrolls, in degrees: follows the scroll speed and direction, capped. */
export function swayFor(velocity, max = 5) {
  return Math.round(Math.max(-max, Math.min(max, velocity * 0.12)) * 100) / 100 || 0; // || 0 turns -0 into 0
}

/**
 * Notes flutter like paper in a draft as the wall scrolls: writes --sway on `el` every frame from the scroll speed
 * and eases it back to 0 when the page stops. Each note multiplies it by its own --k (pinned notes barely move).
 * Returns a stop function.
 */
export function sway(el) {
  if (!el || !motionAllowed()) return () => {};
  let current = 0;
  const tick = () => {
    const target = swayFor(scrollVelocity());
    if (target === 0 && current === 0) return;
    current += (target - current) * 0.1;
    if (target === 0 && Math.abs(current) < 0.02) current = 0;
    el.style.setProperty('--sway', `${current.toFixed(2)}deg`);
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    el.style.removeProperty('--sway');
  };
}

/**
 * The wall's hero in depth: layers marked data-depth drift at different speeds as the page scrolls and lean after
 * the mouse; [data-hero-gauge] turns a little as the hero leaves. Returns a clean-up function.
 */
export function heroParallax(hero) {
  if (!hero || !motionAllowed()) return () => {};
  useScrollTrigger();
  const layers = gsap.utils.toArray('[data-depth]', hero);
  const ctx = gsap.context(() => {
    const scroll = { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 };
    layers.forEach((layer) => gsap.to(layer, { yPercent: Number(layer.dataset.depth) * 45, ease: 'none', scrollTrigger: scroll }));
    gsap.to('[data-hero-gauge]', { rotate: 14, scale: 0.9, ease: 'none', scrollTrigger: scroll });
  }, hero);
  const follow = layers.map((el) => ({
    depth: Number(el.dataset.depth),
    x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3' }),
    y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3' }),
  }));
  const move = (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = hero.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    for (const l of follow) {
      l.x(px * 50 * l.depth);
      l.y(py * 34 * l.depth);
    }
  };
  hero.addEventListener('pointermove', move);
  return () => {
    hero.removeEventListener('pointermove', move);
    ctx.revert();
    gsap.killTweensOf(layers);
  };
}

/** Runs `show` once `el` scrolls into view; straight away without motion. Returns a clean-up function. */
export function onceInView(el, show) {
  if (!el || !motionAllowed()) {
    show();
    return () => {};
  }
  const trigger = useScrollTrigger().create({ trigger: el, start: 'top 88%', once: true, onEnter: show });
  return () => trigger.kill();
}

/** A warm ring of light pulses round a note, to say "here it is". */
export function glow(el) {
  if (!el || !motionAllowed()) return;
  gsap.fromTo(el,
    { boxShadow: '0 0 0 0 rgba(242, 177, 52, 0.8)' },
    { boxShadow: '0 0 0 26px rgba(242, 177, 52, 0)', duration: 1, repeat: 2, ease: 'power2.out', clearProps: 'boxShadow' });
}

/** v-magnetic: the element leans towards a mouse pointer over it and settles back when it leaves. */
export const vMagnetic = {
  mounted(el, { value: strength = 0.3 } = {}) {
    if (!motionAllowed()) return;
    const x = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3' });
    const move = (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * strength);
      y((e.clientY - r.top - r.height / 2) * strength);
    };
    const leave = () => {
      x(0);
      y(0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el._magnetic = { move, leave };
  },
  unmounted(el) {
    if (!el._magnetic) return;
    el.removeEventListener('pointermove', el._magnetic.move);
    el.removeEventListener('pointerleave', el._magnetic.leave);
    gsap.killTweensOf(el);
    delete el._magnetic;
  },
};

/** A rubber stamp ("Approved", "Rated"...) slams onto a card, which jolts. Resolves once the ink has settled. */
export function stamp(card, text, tone = 'good') {
  if (!card || !motionAllowed()) return Promise.resolve();
  const mark = document.createElement('span');
  mark.className = `ink-stamp ink-${tone}`;
  mark.textContent = text;
  mark.setAttribute('aria-hidden', 'true');
  card.append(mark);
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: resolve })
      .fromTo(mark, { scale: 2.8, rotate: -32, opacity: 0 }, { scale: 1, rotate: -12, opacity: 0.9, duration: 0.24, ease: 'power4.in' })
      .fromTo(card, { y: 4, scale: 0.985 }, { y: 0, scale: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.35)', clearProps: 'transform' })
      .to({}, { duration: 0.45 }); // let people see it before the card moves on
  });
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * How far a note leans when the pointer is at (x, y) over its box. The note tips towards the pointer, by at most
 * `max` degrees at the edges, and the glint sits under the pointer (as percentages of the box).
 */
export function tiltFor({ x, y }, { left, top, width, height }, max = 8) {
  if (!width || !height) return { rx: 0, ry: 0, gx: 50, gy: 50 };
  const px = clamp01((x - left) / width);
  const py = clamp01((y - top) / height);
  const round = (n) => Math.round(n * 100) / 100 || 0; // || 0 turns -0 into 0
  return { rx: round((0.5 - py) * 2 * max), ry: round((px - 0.5) * 2 * max), gx: round(px * 100), gy: round(py * 100) };
}

/**
 * v-tilt: the element leans in 3D towards a mouse pointer (touch and pen are left alone, so scrolling stays calm).
 * Writes --rx, --ry, --gx, --gy and the class is-tilting; reviews.css turns those into the transform and the glint.
 */
export const vTilt = {
  mounted(el, { value: max = 8 } = {}) {
    if (!motionAllowed()) return;
    const move = (e) => {
      if (e.pointerType !== 'mouse') return;
      const t = tiltFor({ x: e.clientX, y: e.clientY }, el.getBoundingClientRect(), max);
      el.style.setProperty('--rx', `${t.rx}deg`);
      el.style.setProperty('--ry', `${t.ry}deg`);
      el.style.setProperty('--gx', `${t.gx}%`);
      el.style.setProperty('--gy', `${t.gy}%`);
      el.classList.add('is-tilting');
    };
    const leave = () => el.classList.remove('is-tilting');
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el._tilt = { move, leave };
  },
  unmounted(el) {
    if (!el._tilt) return;
    el.removeEventListener('pointermove', el._tilt.move);
    el.removeEventListener('pointerleave', el._tilt.leave);
    delete el._tilt;
  },
};

/** The bakery's name rises in letter by letter, as if being written on the wall. Returns a clean-up function. */
export function writeIn(el) {
  if (!el || !motionAllowed()) return () => {};
  const split = SplitText.create(el, { type: 'chars', charsClass: 'wall-char' });
  const tween = gsap.from(split.chars, {
    yPercent: 90, rotate: () => gsap.utils.random(-14, 14), opacity: 0, duration: 0.7, ease: 'back.out(2.2)', stagger: 0.035,
    onComplete: () => split.revert(), // back to plain text, so screen readers and copy-paste see the name as one word
  });
  return () => {
    tween.kill();
    split.revert();
  };
}

/** An edited note flips over and back, showing its new words. Resolves when done. */
export function flipNote(el) {
  if (!el || !motionAllowed()) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: resolve })
      .to(el, { rotateY: 90, scale: 0.96, transformPerspective: 900, duration: 0.22, ease: 'power2.in' })
      .to(el, { rotateY: 0, scale: 1, duration: 0.5, ease: 'back.out(2)', clearProps: 'transform' });
  });
}

/** A note being taken down is scrunched into a ball and tossed off the wall. Resolves when it is out of sight. */
export function crumple(el) {
  if (!el || !motionAllowed()) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: resolve })
      .to(el, { scaleX: 0.7, scaleY: 0.82, skewX: 8, rotate: -6, filter: 'brightness(0.92)', duration: 0.18, ease: 'power2.in' })
      .to(el, { scale: 0.32, rotate: 200, borderRadius: '50%', duration: 0.32, ease: 'power3.in' })
      .to(el, { x: 140, y: -70, duration: 0.22, ease: 'power1.out' })
      .to(el, { x: 230, y: 420, rotate: 420, opacity: 0, duration: 0.5, ease: 'power2.in' });
  });
}
