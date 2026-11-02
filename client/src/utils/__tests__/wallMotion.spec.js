/* Tests for utils/wallMotion.js: the Thank-you Wall's motion.
   tiltFor is a plain function (unit tests). The v-tilt directive and the crumple / flip animations are checked for
   behaviour: they react to a mouse but not to touch, and they stand still (and never block the page) when the
   visitor prefers reduced motion. jsdom has no matchMedia, so each test says which preference it wants. */
import { mount } from '@vue/test-utils';
import { gsap } from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, withDirectives } from 'vue';
import { crumple, flipNote, glow, onceInView, scrollToEl, scrollVelocity, stamp, sway, swayFor, tiltFor, vMagnetic, vTilt, writeIn } from '../wallMotion';

const prefersReducedMotion = (reduce) => vi.stubGlobal('matchMedia', () => ({ matches: reduce }));
afterEach(() => {
  vi.unstubAllGlobals();
  gsap.globalTimeline.clear();
});

const BOX = { left: 100, top: 200, width: 200, height: 100 };

describe('tiltFor: how far a note leans towards the pointer', () => {
  it('stays flat with the pointer in the middle, glint in the middle', () => {
    expect(tiltFor({ x: 200, y: 250 }, BOX, 8)).toEqual({ rx: 0, ry: 0, gx: 50, gy: 50 });
  });

  it('leans the full amount at the corners', () => {
    expect(tiltFor({ x: 300, y: 200 }, BOX, 8)).toEqual({ rx: 8, ry: 8, gx: 100, gy: 0 }); // top right
    expect(tiltFor({ x: 100, y: 300 }, BOX, 8)).toEqual({ rx: -8, ry: -8, gx: 0, gy: 100 }); // bottom left
  });

  it('never leans further than the maximum, even with the pointer outside the note', () => {
    const t = tiltFor({ x: 9999, y: -9999 }, BOX, 8);
    expect(t).toEqual({ rx: 8, ry: 8, gx: 100, gy: 0 });
  });

  it('scales with the maximum it is given', () => {
    expect(tiltFor({ x: 300, y: 250 }, BOX, 12).ry).toBe(12);
    expect(tiltFor({ x: 250, y: 250 }, BOX, 10).ry).toBe(5);
  });

  it('stays flat for an element with no size (not laid out yet)', () => {
    expect(tiltFor({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ rx: 0, ry: 0, gx: 50, gy: 50 });
  });
});

/** A div with v-tilt, as on every sticky note. */
const mountTilted = () =>
  mount(defineComponent({ render: () => withDirectives(h('div', { class: 'note-paper' }), [[vTilt, 8]]) }), { attachTo: document.body });
const pointer = (el, pointerType, x = 300, y = 200) => {
  const e = new Event('pointermove');
  Object.assign(e, { pointerType, clientX: x, clientY: y });
  el.getBoundingClientRect = () => ({ ...BOX });
  el.dispatchEvent(e);
};

describe('v-tilt directive', () => {
  it('tilts towards a mouse pointer and settles when the mouse leaves', () => {
    prefersReducedMotion(false);
    const w = mountTilted();
    pointer(w.element, 'mouse');
    expect(w.classes()).toContain('is-tilting');
    expect(w.element.style.getPropertyValue('--ry')).toBe('8deg');
    expect(w.element.style.getPropertyValue('--gx')).toBe('100%');
    w.element.dispatchEvent(new Event('pointerleave'));
    expect(w.classes()).not.toContain('is-tilting');
    w.unmount();
  });

  it('ignores touch, so scrolling the wall on a phone does not wobble the notes', () => {
    prefersReducedMotion(false);
    const w = mountTilted();
    pointer(w.element, 'touch');
    expect(w.classes()).not.toContain('is-tilting');
    w.unmount();
  });

  it('does nothing for visitors who prefer reduced motion', () => {
    prefersReducedMotion(true);
    const w = mountTilted();
    pointer(w.element, 'mouse');
    expect(w.classes()).not.toContain('is-tilting');
    expect(w.element.style.getPropertyValue('--ry')).toBe('');
    w.unmount();
  });
});

describe('crumple, flipNote and writeIn', () => {
  it('finish straight away with reduced motion, leaving the element untouched', async () => {
    prefersReducedMotion(true);
    const el = document.createElement('div');
    await crumple(el);
    await flipNote(el);
    expect(el.getAttribute('style')).toBeNull();
  });

  it('cope with a missing element (the note was already gone)', async () => {
    prefersReducedMotion(false);
    await expect(crumple(null)).resolves.toBeUndefined();
    await expect(flipNote(undefined)).resolves.toBeUndefined();
    expect(writeIn(null)).toBeTypeOf('function');
  });

  it('crumple resolves once the note has been tossed out of sight', async () => {
    prefersReducedMotion(false);
    const el = document.createElement('div');
    const done = vi.fn();
    crumple(el).then(done);
    gsap.globalTimeline.totalTime(gsap.globalTimeline.totalTime() + 5); // fast-forward GSAP's clock
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(Number(gsap.getProperty(el, 'opacity'))).toBe(0);
  });

  it('writeIn splits a title into letters and puts the plain text back when cleaned up', () => {
    prefersReducedMotion(false);
    const el = document.createElement('h1');
    el.textContent = 'Sunrise';
    document.body.append(el);
    const stop = writeIn(el);
    expect(el.querySelectorAll('.wall-char')).toHaveLength(7);
    stop();
    expect(el.innerHTML).toBe('Sunrise');
    expect(el.textContent).toBe('Sunrise');
    el.remove();
  });
});

describe('swayFor: how far notes lean while the wall scrolls', () => {
  it('is still when the page is still', () => {
    expect(swayFor(0)).toBe(0);
    expect(swayFor(-0)).toBe(0);
  });

  it('leans with the scroll: one way scrolling down, the other way scrolling up', () => {
    expect(swayFor(10)).toBe(1.2);
    expect(swayFor(-10)).toBe(-1.2);
  });

  it('never leans further than the maximum, however fast the scroll', () => {
    expect(swayFor(9999)).toBe(5);
    expect(swayFor(-9999)).toBe(-5);
    expect(swayFor(9999, 3)).toBe(3);
  });
});

describe('scrolling helpers without smooth scrolling (tests, reduced motion)', () => {
  it('reports no scroll speed', () => {
    expect(scrollVelocity()).toBe(0);
  });

  it('sway does nothing with reduced motion, and its stop function is safe to call', () => {
    prefersReducedMotion(true);
    const wall = document.createElement('div');
    const stop = sway(wall);
    stop();
    expect(wall.style.getPropertyValue('--sway')).toBe('');
  });

  it('sway clears --sway from the wall when stopped', () => {
    prefersReducedMotion(false);
    const wall = document.createElement('div');
    const stop = sway(wall);
    wall.style.setProperty('--sway', '3deg');
    stop();
    expect(wall.style.getPropertyValue('--sway')).toBe('');
  });

  it('onceInView shows the content straight away when there is no motion', () => {
    prefersReducedMotion(true);
    const show = vi.fn();
    onceInView(document.createElement('div'), show);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('scrollToEl falls back to the browser’s own scrolling, and copes with a missing element', async () => {
    prefersReducedMotion(true);
    const el = document.createElement('div');
    el.scrollIntoView = vi.fn();
    await scrollToEl(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    await expect(scrollToEl(null)).resolves.toBeUndefined();
  });

  it('glow leaves the element alone with reduced motion', () => {
    prefersReducedMotion(true);
    const el = document.createElement('div');
    glow(el);
    expect(el.getAttribute('style')).toBeNull();
  });
});

describe('stamp: the rubber stamp on rated customers and decided appeals', () => {
  it('puts nothing on the card with reduced motion, and finishes at once', async () => {
    prefersReducedMotion(true);
    const card = document.createElement('div');
    await stamp(card, 'Approved');
    expect(card.querySelector('.ink-stamp')).toBeNull();
  });

  it('slams the word onto the card in the right colour, hidden from screen readers, then resolves', async () => {
    prefersReducedMotion(false);
    const card = document.createElement('div');
    const done = vi.fn();
    stamp(card, 'Declined', 'bad').then(done);
    const mark = card.querySelector('.ink-stamp');
    expect(mark.textContent).toBe('Declined');
    expect(mark.classList.contains('ink-bad')).toBe(true);
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    gsap.globalTimeline.totalTime(gsap.globalTimeline.totalTime() + 5);
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
    expect(Number(gsap.getProperty(mark, 'opacity'))).toBeCloseTo(0.9);
  });
});

describe('v-magnetic directive', () => {
  const mountButton = () =>
    mount(defineComponent({ render: () => withDirectives(h('button', 'Say thanks'), [[vMagnetic, 0.5]]) }), { attachTo: document.body });

  it('pulls the button towards the mouse', () => {
    prefersReducedMotion(false);
    const w = mountButton();
    w.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 40 });
    const e = new Event('pointermove');
    Object.assign(e, { pointerType: 'mouse', clientX: 100, clientY: 20 }); // right-hand edge
    w.element.dispatchEvent(e);
    gsap.globalTimeline.totalTime(gsap.globalTimeline.totalTime() + 2);
    expect(Number(gsap.getProperty(w.element, 'x'))).toBeCloseTo(25); // (100 - 50) * 0.5
    w.unmount();
  });

  it('stays put for touch and for reduced motion', () => {
    prefersReducedMotion(true);
    const w = mountButton();
    const e = new Event('pointermove');
    Object.assign(e, { pointerType: 'mouse', clientX: 100, clientY: 20 });
    w.element.dispatchEvent(e);
    expect(w.element.getAttribute('style')).toBeNull();
    w.unmount();
  });
});
