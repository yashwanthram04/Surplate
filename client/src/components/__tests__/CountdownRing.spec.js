/* Component tests for CountdownRing.vue: the ring that shows how much of a pickup window is left.
   The shared clock (useNow) is replaced with a plain ref so each test controls "now". */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { now } from '../../composables/useNow';
import { at, BASE } from '../../__tests__/helpers';
import CountdownRing from '../CountdownRing.vue';

vi.mock('../../composables/useNow', async () => {
  const { ref } = await import('vue');
  return { now: ref(0) };
});

const ring = (start, end, extra = {}) => mount(CountdownRing, { props: { start: at(start), end: at(end), ...extra } });
const centre = (w) => w.find('text').text();

describe('CountdownRing', () => {
  beforeEach(() => {
    now.value = BASE;
  });

  it('counts down to the close of an open pickup window', () => {
    const w = ring(-30, 90);
    expect(w.attributes('data-phase')).toBe('open');
    expect(centre(w)).toBe('1h 30m');
    expect(w.attributes('aria-label')).toBe('1h 30m left to collect');
  });

  it('counts down to the opening before the window starts', () => {
    const w = ring(30, 120);
    expect(w.attributes('data-phase')).toBe('upcoming');
    expect(centre(w)).toBe('30m');
    expect(w.attributes('aria-label')).toBe('30m until pickup opens');
  });

  it('says Ended once the window has closed', () => {
    const w = ring(-120, -1);
    expect(w.attributes('data-phase')).toBe('ended');
    expect(centre(w)).toBe('Ended');
    expect(w.attributes('aria-label')).toBe('Ended pickup closed');
  });

  it('turns urgent (and counts in seconds) in the last ten minutes', () => {
    const w = ring(-60, 9.7);
    expect(w.classes()).toContain('ring-urgent');
    expect(centre(w)).toMatch(/^9:\d\d$/);
  });

  it('is not urgent when there is plenty of time', () => {
    expect(ring(-30, 90).classes()).not.toContain('ring-urgent');
  });

  it('is not urgent once the window has closed', () => {
    expect(ring(-120, -1).classes()).not.toContain('ring-urgent');
  });

  it('updates as the shared clock ticks', async () => {
    const w = ring(-30, 90);
    expect(centre(w)).toBe('1h 30m');
    now.value = BASE + 85 * 60 * 1000; // 5 minutes left
    await nextTick();
    expect(centre(w)).toBe('5:00');
    expect(w.classes()).toContain('ring-urgent');
    now.value = BASE + 91 * 60 * 1000; // closed
    await nextTick();
    expect(centre(w)).toBe('Ended');
  });

  it('is exposed to screen readers as an image with a text label', () => {
    const w = ring(-30, 90);
    expect(w.attributes('role')).toBe('img');
    expect(w.attributes('aria-label')).toBeTruthy();
  });

  it('draws at the requested size', () => {
    expect(ring(-30, 90, { size: 54 }).attributes('width')).toBe('54');
  });
});
