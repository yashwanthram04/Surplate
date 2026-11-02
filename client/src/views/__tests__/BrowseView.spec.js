/* Integration tests for the browse page: BrowseView with the real ListingCard and ListingFilters, and the
   API replaced by a mock. The map (Leaflet) and the address search are stubbed. Timers are faked so the
   250 ms search debounce and the 15 s refresh can be stepped through. */
import { mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { api } from '../../api';
import { now } from '../../composables/useNow';
import { useSession } from '../../stores/session';
import { at, BASE, makeListing } from '../../__tests__/helpers';
import ListingMap from '../../components/ListingMap.vue';
import BrowseView from '../BrowseView.vue';

vi.mock('../../api', () => ({
  api: { get: vi.fn() },
  errorMessage: (err) => err.message,
}));
vi.mock('../../composables/useNow', async () => {
  const { ref } = await import('vue');
  return { now: ref(0) };
});

const listings = (...items) => ({ data: { items } });
const two = () => listings(makeListing({ id: 'a', itemName: 'Croissants' }), makeListing({ id: 'b', itemName: 'Sourdough loaf' }));
const cards = (w) => w.findAll('[data-testid="listing-card"]');
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await nextTick();
};

let wrapper;
const mountBrowse = (pinia = createPinia()) =>
  mount(BrowseView, { global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub, ListingMap: true, AddressSearch: true } } });

async function open(response = two()) {
  api.get.mockResolvedValue(response);
  wrapper = mountBrowse();
  await settle();
  return wrapper;
}

beforeEach(() => {
  vi.useFakeTimers();
  now.value = BASE;
  api.get.mockReset();
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe('BrowseView: loading the board', () => {
  it('asks the API for listings sorted by ending soonest, then shows a card for each', async () => {
    const w = await open();
    expect(api.get).toHaveBeenCalledWith('/listings', { params: { sort: 'ending' } });
    expect(cards(w)).toHaveLength(2);
    expect(w.text()).toContain('Croissants');
    expect(w.text()).toContain('Sourdough loaf');
    expect(w.get('[data-testid="result-count"]').text()).toBe('2 listings available');
  });

  it('uses the singular for a single listing', async () => {
    const w = await open(listings(makeListing()));
    expect(w.get('[data-testid="result-count"]').text()).toBe('1 listing available');
  });

  it('shows a friendly message when nothing is available', async () => {
    const w = await open(listings());
    expect(w.find('[data-testid="empty-state"]').text()).toContain('Nothing available right now');
    expect(cards(w)).toHaveLength(0);
  });

  it('shows skeleton cards while the first response is on its way', () => {
    api.get.mockReturnValue(new Promise(() => {})); // never answers
    wrapper = mountBrowse();
    expect(wrapper.findAll('.placeholder-glow')).toHaveLength(4);
    expect(wrapper.find('[data-testid="result-count"]').text()).toBe('');
  });
});

describe('BrowseView: when something goes wrong', () => {
  it('shows the error with a Retry button that loads the board again', async () => {
    api.get.mockRejectedValueOnce(new Error('We could not reach the server.'));
    wrapper = mountBrowse();
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('We could not reach the server.');
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false);

    api.get.mockResolvedValue(two());
    await wrapper.get('[role="alert"] button').trigger('click');
    await settle();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(cards(wrapper)).toHaveLength(2);
  });
});

describe('BrowseView: pickup windows that close', () => {
  it('leaves out listings whose window has already closed', async () => {
    const w = await open(listings(makeListing({ id: 'a', pickupEnd: at(30) }), makeListing({ id: 'b', itemName: 'Stale', pickupEnd: at(-1) })));
    expect(cards(w)).toHaveLength(1);
    expect(w.text()).not.toContain('Stale');
  });

  it('removes a listing the moment its window closes, without waiting for a refresh', async () => {
    const w = await open(listings(makeListing({ id: 'a', pickupEnd: at(10) }), makeListing({ id: 'b', itemName: 'Sourdough loaf', pickupEnd: at(120) })));
    expect(cards(w)).toHaveLength(2);
    now.value = BASE + 11 * 60 * 1000;
    await nextTick();
    expect(cards(w)).toHaveLength(1);
    expect(w.get('[data-testid="result-count"]').text()).toBe('1 listing available');
  });
});

describe('BrowseView: searching and filtering', () => {
  it('waits for a pause in typing before asking the API again', async () => {
    const w = await open();
    api.get.mockClear();
    await w.get('#f-q').setValue('croissant');
    await vi.advanceTimersByTimeAsync(200);
    expect(api.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/listings', { params: { sort: 'ending', q: 'croissant' } });
  });

  it('sends dietary tags and the open-now switch as query parameters', async () => {
    const w = await open();
    api.get.mockClear();
    await w.get('#f-diet-halal').setValue(true);
    await w.get('#f-diet-vegan').setValue(true);
    await w.get('#f-open').setValue(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.get).toHaveBeenLastCalledWith('/listings', { params: { sort: 'ending', dietary: 'halal,vegan', openNow: true } });
  });

  it('shows what the server sends back for the new filters', async () => {
    const w = await open();
    api.get.mockResolvedValue(listings(makeListing({ id: 'c', itemName: 'Halal samosas' })));
    await w.get('#f-diet-halal').setValue(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(cards(w)).toHaveLength(1);
    expect(w.text()).toContain('Halal samosas');
  });

  it('ignores a slow response that arrives after a newer one', async () => {
    const w = await open();
    let releaseOld;
    api.get.mockReturnValueOnce(new Promise((resolve) => (releaseOld = resolve))); // slow request for "bread"
    await w.get('#f-q').setValue('bread');
    await vi.advanceTimersByTimeAsync(300);
    api.get.mockResolvedValueOnce(listings(makeListing({ id: 'n', itemName: 'Newest results' }))); // quick request for "bread rolls"
    await w.get('#f-q').setValue('bread rolls');
    await vi.advanceTimersByTimeAsync(300);
    expect(w.text()).toContain('Newest results');

    releaseOld(listings(makeListing({ id: 'o', itemName: 'Old results' })));
    await settle();
    expect(w.text()).toContain('Newest results');
    expect(w.text()).not.toContain('Old results');
  });
});

describe('BrowseView: staying fresh', () => {
  it('checks for new listings and changed stock every 15 seconds', async () => {
    await open();
    api.get.mockClear();
    await vi.advanceTimersByTimeAsync(15000);
    expect(api.get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15000);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('stops checking once the page is left', async () => {
    const w = await open();
    w.unmount();
    api.get.mockClear();
    await vi.advanceTimersByTimeAsync(60000);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('BrowseView: map link', () => {
  it('highlights the hovered card on the map', async () => {
    const w = await open();
    expect(w.findComponent(ListingMap).props('highlightId')).toBeNull();
    await cards(w)[1].trigger('mouseenter');
    expect(w.findComponent(ListingMap).props('highlightId')).toBe('b');
    expect(cards(w)[1].classes()).toContain('is-highlighted');
    await cards(w)[1].trigger('mouseleave');
    expect(w.findComponent(ListingMap).props('highlightId')).toBeNull();
  });
});

describe('BrowseView: the "you are seeing part of the board" note', () => {
  const note = (w) => w.find('[data-testid="partial-view-note"]');

  it('invites visitors to register a charity', async () => {
    const w = await open();
    expect(note(w).text()).toContain('Verified charities see more');
    expect(note(w).findComponent(RouterLinkStub).props('to')).toBe('/register?role=charity');
  });

  it('tells a charity that is still waiting for approval', async () => {
    const pinia = createPinia();
    api.get.mockResolvedValue(two());
    wrapper = mountBrowse(pinia);
    useSession(pinia).user = { role: 'charity', verification: { status: 'pending' } };
    await settle();
    expect(note(wrapper).text()).toContain('Your charity is awaiting verification.');
  });

  it('is hidden for a verified charity, who already sees everything', async () => {
    const pinia = createPinia();
    api.get.mockResolvedValue(two());
    wrapper = mountBrowse(pinia);
    useSession(pinia).user = { role: 'charity', verification: { status: 'approved' } };
    await settle();
    expect(note(wrapper).exists()).toBe(false);
  });
});
