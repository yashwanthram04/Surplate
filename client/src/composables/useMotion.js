import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';

gsap.registerPlugin(Flip);

/**
 * Shared motion for everyday pages (browse board, my listings, listing detail). The home page has its own,
 * bigger composable (useHomeMotion). The rule here is "noticed, not announced": short, soft, transform and
 * opacity only, and nothing at all for visitors who have asked for reduced motion.
 */

/** True in a real browser where the visitor has not asked for reduced motion. (jsdom has no matchMedia, so tests skip motion.) */
export function motionAllowed() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Motion for a list of cards rendered with <TransitionGroup :css="false">:
 *   - new cards rise in one after another (the stagger is capped so a long list never takes seconds),
 *   - a removed card shrinks away and leaves the flow at once so the others start closing the gap,
 *   - the cards that stay glide to their new places (GSAP Flip) when a filter, sort or removal reshuffles the list.
 *
 * listRef  the template ref on the <TransitionGroup> (or on a plain element)
 * source   anything that changes when the list changes (usually the array itself); the glide is measured around it
 * Give each card `data-index` (its position) for the stagger.
 */
export function useListMotion(listRef, source) {
  let before = null;
  const items = () => {
    const root = listRef.value?.$el ?? listRef.value;
    return root ? [...root.children].filter((el) => !el.dataset.leaving) : [];
  };

  // Remember where every card is before Vue changes the DOM...
  watch(source, () => {
    if (motionAllowed()) before = Flip.getState(items());
  }, { flush: 'pre' });
  // ...and glide the ones that stayed from there to where they are now.
  watch(source, () => {
    if (!before) return;
    const state = before;
    before = null;
    Flip.from(state, { targets: items(), duration: 0.65, ease: 'power3.inOut', scale: false });
  }, { flush: 'post' });

  function onBeforeEnter(el) {
    if (motionAllowed()) gsap.set(el, { autoAlpha: 0, y: 26, scale: 0.97 });
  }
  function onEnter(el, done) {
    if (!motionAllowed()) return done();
    gsap.to(el, {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.7,
      ease: 'power3.out',
      delay: Math.min(Number(el.dataset.index) || 0, 8) * 0.06,
      clearProps: 'opacity,visibility,transform',
      onComplete: done,
    });
  }
  function onLeave(el, done) {
    if (!motionAllowed()) return done();
    el.dataset.leaving = '1';
    // Out of the flow right away (same spot, same width) so the remaining cards can start moving up.
    gsap.set(el, { position: 'absolute', left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth });
    gsap.to(el, { autoAlpha: 0, scale: 0.94, duration: 0.28, ease: 'power2.in', onComplete: done });
  }

  onBeforeUnmount(() => gsap.killTweensOf(items()));
  return { onBeforeEnter, onEnter, onLeave };
}

/**
 * A page that settles in: anything marked data-enter rises and fades, one after another, and anything
 * marked data-kenburns (a photo inside an overflow-hidden frame) eases from slightly zoomed to rest.
 * Plays on mount; call play() again after data arrives (already-played elements are skipped).
 */
export function useEntrance(rootRef) {
  let ctx = null;

  function play() {
    const root = rootRef.value;
    if (!root || !motionAllowed()) return;
    ctx ??= gsap.context(() => {}, root);
    ctx.add(() => {
      const fresh = gsap.utils.toArray('[data-enter]:not([data-entered])', root);
      fresh.forEach((el) => el.setAttribute('data-entered', ''));
      if (fresh.length) gsap.from(fresh, { autoAlpha: 0, y: 22, duration: 0.8, ease: 'power3.out', stagger: 0.09, clearProps: 'opacity,visibility,transform' });

      const photos = gsap.utils.toArray('[data-kenburns]:not([data-entered])', root);
      photos.forEach((el) => el.setAttribute('data-entered', ''));
      if (photos.length) gsap.fromTo(photos, { scale: 1.14 }, { scale: 1, duration: 1.8, ease: 'power3.out', clearProps: 'transform' });
    });
  }

  onMounted(() => nextTick(play));
  onBeforeUnmount(() => ctx?.revert());
  return { play };
}
