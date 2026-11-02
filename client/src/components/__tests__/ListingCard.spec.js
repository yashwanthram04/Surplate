/* Component tests for ListingCard.vue: what a person sees on each card of the browse board.
   CountdownRing is stubbed here (it has its own spec); the integration spec mounts the two together. */
import { mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { now } from '../../composables/useNow';
import { at, BASE, makeListing } from '../../__tests__/helpers';
import ListingCard from '../ListingCard.vue';

vi.mock('../../composables/useNow', async () => {
  const { ref } = await import('vue');
  return { now: ref(0) };
});

const card = (overrides = {}, props = {}) =>
  mount(ListingCard, {
    props: { listing: makeListing(overrides), ...props },
    global: { stubs: { RouterLink: RouterLinkStub, CountdownRing: true } },
  });

beforeEach(() => {
  now.value = BASE;
});

describe('ListingCard: the basics', () => {
  it('shows the item, the bakery and how many are left', () => {
    const w = card();
    expect(w.text()).toContain('Butter croissants');
    expect(w.text()).toContain('Sunrise Bakery');
    expect(w.text()).toContain('12 left');
  });

  it('only mentions the original quantity once some have been reserved', () => {
    expect(card().text()).not.toContain('of 12');
    expect(card({ quantityRemaining: 4 }).text()).toContain('4 left');
    expect(card({ quantityRemaining: 4 }).text()).toContain('of 12');
  });

  it('shows the distance only when the browser searched near an address', () => {
    expect(card().text()).not.toContain('km away');
    expect(card({ distanceKm: 1.4 }).text()).toContain('1.4 km away');
  });

  it('links the title to the listing page', () => {
    const link = card({ id: 'abc123' }).findAllComponents(RouterLinkStub)[0];
    expect(link.props('to')).toEqual({ name: 'listing', params: { id: 'abc123' } });
    expect(link.text()).toBe('Butter croissants');
  });

  it('shows the pickup window', () => {
    expect(card().text()).toMatch(/Today.*–/);
  });
});

describe('ListingCard: photo', () => {
  it('shows the photo with a descriptive alt text', () => {
    const img = card().find('img');
    expect(img.attributes('src')).toBe('/api/listings/l1/photo');
    expect(img.attributes('alt')).toBe('Photo of Butter croissants');
  });

  it('falls back to a placeholder when there is no photo', () => {
    const w = card({ photoUrl: null });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('.photo-placeholder').exists()).toBe(true);
  });
});

describe('ListingCard: food information', () => {
  it('lists dietary tags', () => {
    const w = card({ dietaryTags: ['vegan', 'halal'] });
    expect(w.text()).toContain('vegan');
    expect(w.text()).toContain('halal');
  });

  it('warns about allergens, and only when there are some', () => {
    expect(card().text()).not.toContain('Contains');
    expect(card({ allergens: ['gluten', 'dairy'] }).text()).toContain('Contains gluten, dairy');
  });
});

describe('ListingCard: who can see it', () => {
  const pill = (w) => w.find('[data-testid="charities-only"]');

  it('has no badge on a listing that is open to everyone', () => {
    expect(pill(card()).exists()).toBe(false);
  });

  it('marks a listing that is still in its charity priority period', () => {
    const w = card({ priorityUntil: at(10), visibleToIndividuals: false });
    expect(pill(w).text()).toContain('Charity priority');
  });

  it('drops the badge once the priority period is over', () => {
    expect(pill(card({ priorityUntil: at(-1) })).exists()).toBe(false);
  });

  it('marks older charities-only listings that never had a priority period', () => {
    expect(pill(card({ visibleToIndividuals: false })).text()).toContain('Charities only');
  });
});

describe('ListingCard: thank-you chip', () => {
  const chip = (w) => w.find('[data-testid="thanks-chip"]');

  it('is hidden when the bakery has no thank-yous yet', () => {
    expect(chip(card()).exists()).toBe(false);
  });

  it('uses the singular for one thank-you and the plural after that', () => {
    expect(chip(card({ bakery: { id: 'b1', name: 'Sunrise Bakery', thankYouCount: 1 } })).text()).toContain('1 thank-you');
    expect(chip(card({ bakery: { id: 'b1', name: 'Sunrise Bakery', thankYouCount: 3 } })).text()).toContain('3 thank-yous');
  });

  it('links to that bakery wall', () => {
    const w = card({ bakery: { id: 'b9', name: 'Sunrise Bakery', thankYouCount: 2 } });
    const link = w.findAllComponents(RouterLinkStub).find((l) => l.attributes('data-testid') === 'thanks-chip');
    expect(link.props('to')).toEqual({ name: 'bakery-wall', params: { id: 'b9' } });
  });
});

describe('ListingCard: hover, which links the card to its pin on the map', () => {
  it('tells the parent which listing is hovered, then that none is', async () => {
    const w = card({ id: 'l7' });
    await w.trigger('mouseenter');
    await w.trigger('mouseleave');
    expect(w.emitted('hover')).toEqual([['l7'], [null]]);
  });

  it('does the same for keyboard focus', async () => {
    const w = card({ id: 'l7' });
    await w.trigger('focusin');
    await w.trigger('focusout');
    expect(w.emitted('hover')).toEqual([['l7'], [null]]);
  });

  it('shows the highlight when the parent says so', () => {
    expect(card({}, { highlighted: true }).classes()).toContain('is-highlighted');
    expect(card().classes()).not.toContain('is-highlighted');
  });
});
