// GSAP animations for the reservation and no-show screens.
// Most helpers are Vue <Transition>/<TransitionGroup> JavaScript hooks (use with :css="false").
// Every helper does nothing when the visitor has asked for reduced motion.
import { gsap } from 'gsap';

export const reducedMotion = () => typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// List item enters: fades and rises, staggered by its data-index (capped so long lists don't wait).
export function riseIn(el, done) {
  if (reducedMotion()) return done();
  const delay = Math.min(Number(el.dataset.index) || 0, 8) * 0.06;
  gsap.from(el, { opacity: 0, y: 18, duration: 0.45, delay, ease: 'power2.out', clearProps: 'opacity,transform', onComplete: done });
}

// List item leaves: fades and collapses its height so the items below slide up into place.
export function collapseOut(el, done) {
  if (reducedMotion()) return done();
  gsap.to(el, {
    opacity: 0, x: 24, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, borderWidth: 0,
    overflow: 'hidden', duration: 0.4, ease: 'power2.in', onComplete: done,
  });
}

// Panel opens: grows from zero height to its natural height.
export function expandIn(el, done) {
  if (reducedMotion()) return done();
  gsap.from(el, { height: 0, opacity: 0, paddingTop: 0, marginTop: 0, overflow: 'hidden', duration: 0.35, ease: 'power2.out', clearProps: 'all', onComplete: done });
}

// Small element (badge, number) swaps in with a bounce.
export function popIn(el, done) {
  if (reducedMotion()) return done();
  gsap.from(el, { scale: 0.4, opacity: 0, duration: 0.45, ease: 'back.out(2.5)', clearProps: 'opacity,transform', onComplete: done });
}

// Banner arrives from above; any [data-anim="char"] children (e.g. the reservation code) flip in one by one.
export function dropIn(el, done) {
  if (reducedMotion()) return done();
  const chars = el.querySelectorAll('[data-anim="char"]');
  const tl = gsap.timeline({ onComplete: done });
  tl.from(el, { opacity: 0, y: -16, scale: 0.97, duration: 0.45, ease: 'power3.out', clearProps: 'opacity,transform' });
  if (chars.length) tl.from(chars, { opacity: 0, y: 12, rotateX: -90, duration: 0.4, stagger: 0.07, ease: 'back.out(2)', clearProps: 'all' }, '-=0.15');
  const icon = el.querySelector('[data-anim="icon"]');
  if (icon) tl.fromTo(icon, { rotate: 0 }, { keyframes: { rotate: [-18, 16, -10, 8, 0] }, duration: 0.6, ease: 'power1.inOut' }, 0.2);
}

// Wrong input: a quick horizontal shake.
export function shake(el) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { x: -10 }, { x: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.25)', clearProps: 'transform' });
}

// Success: a green ring that pulses out from the element once.
export function successPulse(el) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { boxShadow: '0 0 0 0 rgba(47, 125, 79, 0.55)' }, { boxShadow: '0 0 0 14px rgba(47, 125, 79, 0)', duration: 0.9, ease: 'power2.out', clearProps: 'boxShadow' });
}
