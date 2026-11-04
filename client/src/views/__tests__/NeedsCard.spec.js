/* Component tests for NeedsCard.vue: what a person sees on each request of the Charity Needs Board.
   The clock is mocked so "Needed in 2 days" is exact; motion is off in jsdom, so the bar is checked by its final width. */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { now } from '../../composables/useNow';
import NeedsCard from '../NeedsCard.vue';

vi.mock('../../composables/useNow', async () => {
  const { ref } = await import('vue');
  return { now: ref(0) };
});

const NOW = Date.parse('2026-11-04T08:00:00Z');
const HOUR = 3600000;

const makeNeed = (over = {}) => ({
  id: 'n1', title: 'Bread for Saturday breakfast', description: 'Feeding 40 residents.', charity: { id: 'c1', name: 'Hope Kitchen' },
  quantityTarget: 40, quantityPledged: 24, quantityRemaining: 16, percent: 60, status: 'open', phase: 'open',
  neededBy: new Date(NOW + 3 * 24 * HOUR).toISOString(), dietaryTags: ['halal'], pledges: [], ...over,
});

const card = (need = {}, props = {}) =>
  mount(NeedsCard, { props: { need: makeNeed(need), editQuantities: {}, pledgeQuantities: { n1: 1 }, ...props } });

beforeEach(() => {
  now.value = NOW;
});

describe('NeedsCard: the request itself', () => {
  it('shows who is asking, the title, the progress and what is still needed', () => {
    const text = card().text();
    expect(text).toContain('Hope Kitchen');
    expect(text).toContain('Bread for Saturday breakfast');
    expect(text).toContain('24 of 40 pledged');
    expect(text).toContain('60%');
    expect(text).toContain('16 more needed');
    expect(text).toContain('halal');
  });

  it('exposes the progress to assistive tech', async () => {
    const bar = card().get('[role="progressbar"]');
    expect(bar.attributes('aria-valuenow')).toBe('60');
    expect(bar.attributes('aria-label')).toBe('60% of requested food pledged');
  });

  it('fills the bar to the pledged share, and follows it when more is pledged', async () => {
    const w = card();
    await new Promise((r) => requestAnimationFrame(r));
    await nextTick();
    expect(w.get('.meter-fill').attributes('style')).toContain('width: 60%');
    await w.setProps({ need: makeNeed({ quantityPledged: 40, quantityRemaining: 0, percent: 100 }) });
    expect(w.get('.meter-fill').attributes('style')).toContain('width: 100%');
  });
});

describe('NeedsCard: how soon it is needed', () => {
  it('counts in days when there is time', () => {
    expect(card().text()).toContain('Needed in 3 days');
    expect(card().classes()).not.toContain('is-urgent');
  });

  it('counts in hours inside two days, and turns urgent inside the last day', () => {
    const w = card({ neededBy: new Date(NOW + 5 * HOUR).toISOString() });
    expect(w.text()).toContain('Needed in 5 h');
    expect(w.classes()).toContain('is-urgent');
    expect(card({ neededBy: new Date(NOW + 30 * HOUR).toISOString() }).classes()).not.toContain('is-urgent');
  });

  it('counts in minutes inside the last hour', () => {
    expect(card({ neededBy: new Date(NOW + 20 * 60000).toISOString() }).text()).toContain('Needed in 20 min');
  });

  it('says so when the time has passed, and labels the card Overdue', () => {
    const w = card({ neededBy: new Date(NOW - HOUR).toISOString(), phase: 'overdue' });
    expect(w.text()).toContain('Past due');
    expect(w.text()).toContain('Overdue');
  });

  it('shows no countdown once a request is fulfilled or cancelled', () => {
    expect(card({ status: 'fulfilled', phase: 'fulfilled' }).text()).not.toContain('Needed in');
    expect(card({ status: 'cancelled', phase: 'cancelled' }).text()).not.toContain('Needed in');
  });
});

describe('NeedsCard: each status', () => {
  it('open: Open badge', () => {
    expect(card().get('.nc-status').text()).toBe('Open');
  });

  it('fulfilled: Fulfilled badge and the thank-you line', () => {
    const w = card({ status: 'fulfilled', phase: 'fulfilled', percent: 100, quantityPledged: 40, quantityRemaining: 0 });
    expect(w.get('.nc-status').text()).toBe('Fulfilled');
    expect(w.text()).toContain('All requested food has been pledged!');
    expect(w.classes()).toContain('is-fulfilled');
  });

  it('cancelled: Cancelled badge and an explanation', () => {
    const w = card({ status: 'cancelled', phase: 'cancelled' });
    expect(w.get('.nc-status').text()).toBe('Cancelled');
    expect(w.text()).toContain('This request was cancelled by the charity.');
  });
});

describe('NeedsCard: who can do what', () => {
  it('a bakery gets the pledge box on an open request that still needs food, and no charity buttons', async () => {
    const w = card({}, { isBakery: true });
    expect(w.find('input[type="number"]').exists()).toBe(true);
    expect(w.text()).not.toContain('Edit quantity');
    await w.get('button.btn-primary').trigger('click');
    expect(w.emitted('pledge')[0][0].id).toBe('n1');
  });

  it('a bakery gets no pledge box once nothing more is needed', () => {
    expect(card({ quantityRemaining: 0, percent: 100 }, { isBakery: true }).find('input[type="number"]').exists()).toBe(false);
  });

  it('a charity can edit or cancel its open request, and sees who pledged and where to collect', async () => {
    const pledges = [{ id: 'p1', quantity: 24, bakery: { name: 'Sunrise Bakery' }, pickup: { address: '56 ENG HOON STREET', postal: '160056' } }];
    const w = card({ pledges }, { isCharity: true });
    expect(w.text()).toContain('Bakeries who pledged');
    expect(w.text()).toContain('Sunrise Bakery');
    expect(w.text()).toContain('24 units');
    expect(w.text()).toContain('Collect at 56 ENG HOON STREET, 160056');
    await w.findAll('button').find((b) => b.text() === 'Edit quantity').trigger('click');
    await w.findAll('button').find((b) => b.text() === 'Cancel request').trigger('click');
    expect(w.emitted('start-edit')).toHaveLength(1);
    expect(w.emitted('cancel-need')).toHaveLength(1);
  });

  it('a charity cannot edit a request that is no longer open', () => {
    expect(card({ status: 'fulfilled', phase: 'fulfilled' }, { isCharity: true }).text()).not.toContain('Edit quantity');
  });
});
