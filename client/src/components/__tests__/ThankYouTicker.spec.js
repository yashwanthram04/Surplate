/* Component tests for ThankYouTicker.vue: the strip of recent thank-yous that drifts across the wall.
   Checked through what a user gets: the quotes, which ones a keyboard or screen reader meets (each quote once, even
   though the strip repeats them), the "pick" event when a quote is clicked, and a still, scrollable strip for
   visitors who prefer reduced motion. jsdom has no matchMedia, so tests that want motion say so. */
import { mount } from '@vue/test-utils';
import { gsap } from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeNote } from '../../__tests__/reviewFixtures';
import ThankYouTicker from '../ThankYouTicker.vue';

const NOTES = [
  makeNote({ id: 'a', note: 'Still warm!', nickname: 'Casey L.', foodRating: 5 }),
  makeNote({ id: 'b', note: 'Generous portions', nickname: 'Sam', foodRating: 4 }),
  makeNote({ id: 'c', note: 'The kids loved them', nickname: 'Hope Kitchen', foodRating: 5 }),
];
const ticker = (notes = NOTES) => mount(ThankYouTicker, { props: { notes }, attachTo: document.body });
const items = (w) => w.findAll('[data-testid="ticker-item"]');
const reachable = (w) => items(w).filter((i) => i.attributes('tabindex') === '0');

afterEach(() => {
  vi.unstubAllGlobals();
  gsap.globalTimeline.clear();
  document.body.innerHTML = '';
});

describe('ThankYouTicker without motion', () => {
  it('shows each note as a quote with who wrote it and their rating', () => {
    const first = items(ticker())[0];
    expect(first.text()).toContain('“Still warm!”');
    expect(first.text()).toContain('Casey L.');
    expect(first.text()).toContain('5 out of 5');
  });

  it('is labelled for screen readers', () => {
    expect(ticker().attributes('aria-label')).toBe('Recent thank-yous');
  });

  it('lets the keyboard and screen readers meet each quote once, though the strip repeats them', () => {
    const w = ticker();
    expect(items(w).length).toBeGreaterThanOrEqual(8); // padded so the strip is wider than the screen
    expect(reachable(w).map((i) => i.text())).toHaveLength(3);
    expect(items(w).filter((i) => i.attributes('aria-hidden') === 'true')).toHaveLength(items(w).length - 3);
  });

  it('stays still: no second copy and no moving class', () => {
    const w = ticker();
    expect(w.classes()).not.toContain('is-moving');
    expect(items(w)).toHaveLength(8); // one padded strip, not two
  });

  it('asks the wall to show a note when its quote is clicked', async () => {
    const w = ticker();
    await items(w)[1].trigger('click');
    expect(w.emitted('pick')).toEqual([['b']]);
  });

  it('follows the notes when they change (e.g. a note is deleted)', async () => {
    const w = ticker();
    await w.setProps({ notes: NOTES.slice(1) });
    expect(reachable(w)).toHaveLength(2);
    expect(w.text()).not.toContain('Still warm!');
  });
});

describe('ThankYouTicker with motion', () => {
  it('doubles the strip for a seamless loop, with the copy hidden from screen readers and the keyboard', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const w = ticker();
    await vi.waitFor(() => expect(w.classes()).toContain('is-moving'));
    await w.vm.$nextTick();
    const all = items(w);
    const half = all.length / 2;
    expect(all.slice(half).every((i) => i.attributes('aria-hidden') === 'true' && i.attributes('tabindex') === '-1')).toBe(true);
    expect(reachable(w)).toHaveLength(3); // still each quote once
    w.unmount();
  });

  it('starts drifting to the left', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const w = ticker();
    await vi.waitFor(() => expect(w.classes()).toContain('is-moving'));
    await w.vm.$nextTick();
    const track = w.find('.ticker-track').element;
    const before = Number(gsap.getProperty(track, 'xPercent'));
    gsap.globalTimeline.totalTime(gsap.globalTimeline.totalTime() + 1);
    expect(Number(gsap.getProperty(track, 'xPercent'))).toBeLessThan(before);
    w.unmount();
  });
});
