/* Integration tests: ListingCard and CountdownRing mounted together (no stubs), sharing one clock.
   The ring's own colours and wording are covered in CountdownRing.spec.js; here we check that the
   card feeds it the right pickup window and that the two stay in step as time passes. */
import { mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { now } from '../../composables/useNow';
import { at, BASE, makeListing } from '../../__tests__/helpers';
import ListingCard from '../ListingCard.vue';

vi.mock('../../composables/useNow', async () => {
  const { ref } = await import('vue');
  return { now: ref(0) };
});

const card = (overrides = {}) =>
  mount(ListingCard, { props: { listing: makeListing(overrides) }, global: { stubs: { RouterLink: RouterLinkStub } } });
const ring = (w) => w.find('svg.countdown-ring');

beforeEach(() => {
  now.value = BASE;
});

describe('ListingCard + CountdownRing', () => {
  it('shows the time left in the card ring while pickup is open', () => {
    const w = card({ pickupStart: at(-30), pickupEnd: at(90) });
    expect(ring(w).attributes('aria-label')).toBe('1h 30m left to collect');
  });

  it('shows when pickup opens for a listing that has not started yet', () => {
    const w = card({ pickupStart: at(45), pickupEnd: at(120) });
    expect(ring(w).attributes('aria-label')).toBe('45m until pickup opens');
  });

  it('turns urgent as the window is about to close', () => {
    const w = card({ pickupStart: at(-60), pickupEnd: at(5) });
    expect(ring(w).classes()).toContain('ring-urgent');
  });

  it('keeps the ring and the card details in step with the shared clock', async () => {
    const w = card({ pickupStart: at(-30), pickupEnd: at(40) });
    expect(ring(w).attributes('data-phase')).toBe('open');
    expect(w.text()).toContain('Butter croissants');

    now.value = BASE + 41 * 60 * 1000; // pickup window has closed
    await nextTick();
    expect(ring(w).attributes('data-phase')).toBe('ended');
    expect(ring(w).attributes('aria-label')).toBe('Ended pickup closed');
    expect(w.text()).toContain('Butter croissants'); // the card itself stays until the board removes it
  });

  it('flips the charity-priority badge off at the same moment the clock passes it', async () => {
    const w = card({ visibleToIndividuals: false, priorityUntil: at(10) });
    expect(w.find('[data-testid="charities-only"]').exists()).toBe(true);
    now.value = BASE + 11 * 60 * 1000;
    await nextTick();
    expect(w.find('[data-testid="charities-only"]').exists()).toBe(false);
  });
});
