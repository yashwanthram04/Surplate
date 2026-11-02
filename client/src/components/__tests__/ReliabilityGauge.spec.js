/* Component tests for ReliabilityGauge.vue: the ring that shows a bakery's or recipient's reliability score.
   CountUp (the number in the middle) is stubbed to print the value it receives; its counting has its own tests.
   requestAnimationFrame runs at once so the ring is drawn straight after mounting. */
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import ReliabilityGauge from '../ReliabilityGauge.vue';

const CountUpStub = defineComponent({ props: ['value'], setup: (p) => () => h('span', { class: 'countup-stub' }, String(p.value)) });
const gauge = (props) => mount(ReliabilityGauge, { props, global: { stubs: { CountUp: CountUpStub } } });
const CIRCUMFERENCE = 2 * Math.PI * 46;
const offset = (w) => Number(w.find('.gauge-arc').attributes('stroke-dashoffset'));

beforeEach(() => vi.stubGlobal('requestAnimationFrame', (cb) => cb()));
afterEach(() => vi.unstubAllGlobals());

describe('ReliabilityGauge', () => {
  it('shows the score and describes it for screen readers', () => {
    const w = gauge({ score: 92, label: 'Bakery reliability' });
    expect(w.find('.countup-stub').text()).toBe('92');
    expect(w.attributes('aria-label')).toBe('Bakery reliability: 92 out of 100');
    expect(w.find('figcaption').text()).toBe('Bakery reliability');
  });

  it('is green from 80, amber from 50 and red below', () => {
    expect(gauge({ score: 80 }).classes()).toContain('gauge-good');
    expect(gauge({ score: 65 }).classes()).toContain('gauge-warn');
    expect(gauge({ score: 30 }).classes()).toContain('gauge-bad');
  });

  it('starts empty and sweeps round to the score once mounted', async () => {
    const w = gauge({ score: 75 });
    await nextTick(); // the ring is redrawn on the next render after mounting
    expect(offset(w)).toBeCloseTo(CIRCUMFERENCE * 0.25);
    const full = gauge({ score: 100 });
    await nextTick();
    expect(offset(full)).toBeCloseTo(0);
  });

  it('shows a sparkle instead of a number for a new bakery with no score yet', () => {
    const w = gauge({ score: null, label: 'Bakery reliability' });
    expect(w.classes()).toContain('gauge-new');
    expect(w.find('.gauge-new').exists()).toBe(true);
    expect(w.find('.countup-stub').exists()).toBe(false);
    expect(w.attributes('aria-label')).toBe('Bakery reliability: not enough ratings yet');
    expect(offset(w)).toBeCloseTo(CIRCUMFERENCE); // empty ring
  });

  it('follows the score when it changes (e.g. after a new review)', async () => {
    const w = gauge({ score: 90 });
    await w.setProps({ score: 40 });
    expect(w.classes()).toContain('gauge-bad');
    expect(offset(w)).toBeCloseTo(CIRCUMFERENCE * 0.6);
  });

  it('can be drawn at any size', () => {
    expect(gauge({ score: 50, size: 84 }).attributes('style')).toContain('width: 84px');
  });
});
