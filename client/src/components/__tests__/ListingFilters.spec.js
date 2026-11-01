/* Component tests for ListingFilters.vue. The filter object is its v-model, so each test mounts it
   with a parent that feeds the emitted value back in, the way BrowseView does. */
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultFilters } from '../../__tests__/helpers';
import AddressSearch from '../AddressSearch.vue';
import ListingFilters from '../ListingFilters.vue';

function setup(overrides = {}) {
  const wrapper = mount(ListingFilters, {
    props: {
      modelValue: { ...defaultFilters(), ...overrides },
      'onUpdate:modelValue': (v) => wrapper.setProps({ modelValue: v }),
    },
    global: { stubs: { AddressSearch: true } },
  });
  const current = () => wrapper.props('modelValue');
  return { wrapper, current };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('ListingFilters: search and toggles', () => {
  it('updates the search text as the person types', async () => {
    const { wrapper, current } = setup();
    await wrapper.find('#f-q').setValue('croissant');
    expect(current().q).toBe('croissant');
  });

  it('turns "open for pickup now" and "ending soon" on and off', async () => {
    const { wrapper, current } = setup();
    await wrapper.find('#f-open').setValue(true);
    await wrapper.find('#f-soon').setValue(true);
    expect(current().openNow).toBe(true);
    expect(current().endingSoon).toBe(true);
    await wrapper.find('#f-open').setValue(false);
    expect(current().openNow).toBe(false);
  });

  it('changes the sort order', async () => {
    const { wrapper, current } = setup();
    await wrapper.find('#f-sort').setValue('newest');
    expect(current().sort).toBe('newest');
  });

  it('offers "Nearest" only after an address has been chosen', () => {
    const nearest = (w) => w.find('#f-sort option[value="distance"]');
    expect(nearest(setup().wrapper).attributes('disabled')).toBeDefined();
    const near = { lat: 1.3, lng: 103.8, label: 'Bedok' };
    expect(nearest(setup({ near }).wrapper).attributes('disabled')).toBeUndefined();
  });
});

describe('ListingFilters: dietary tags and allergens', () => {
  it('adds and removes a dietary tag', async () => {
    const { wrapper, current } = setup();
    await wrapper.find('#f-diet-halal').setValue(true);
    await wrapper.find('#f-diet-vegan').setValue(true);
    expect(current().dietary).toEqual(['halal', 'vegan']);
    await wrapper.find('#f-diet-halal').setValue(false);
    expect(current().dietary).toEqual(['vegan']);
  });

  it('adds an allergen to avoid and shows how many are selected', async () => {
    const { wrapper, current } = setup();
    await wrapper.find('#f-avoid-nuts').setValue(true);
    expect(current().avoid).toEqual(['nuts']);
    expect(wrapper.find('summary .badge').text()).toBe('1');
  });
});

describe('ListingFilters: clear all', () => {
  it('is hidden while no filter is on', () => {
    expect(setup().wrapper.text()).not.toContain('Clear all filters');
  });

  it('counts every active filter', () => {
    const { wrapper } = setup({ q: 'bread', dietary: ['halal', 'vegan'], openNow: true });
    expect(wrapper.text()).toContain('Clear all filters (4)');
  });

  it('puts every filter back to its default', async () => {
    const { wrapper, current } = setup({ q: 'bread', dietary: ['halal'], avoid: ['nuts'], openNow: true, sort: 'newest' });
    await wrapper.find('button.btn-link').trigger('click');
    expect(current()).toEqual({ ...defaultFilters(), sort: 'ending' });
  });
});

describe('ListingFilters: near an address', () => {
  const near = { lat: 1.32, lng: 103.93, label: 'Bedok' };

  it('filters by the chosen address and sorts nearest first', async () => {
    const { wrapper, current } = setup();
    wrapper.findComponent(AddressSearch).vm.$emit('select', { lat: 1.32, lng: 103.93, address: 'Bedok' });
    await nextTick();
    expect(current().near).toEqual(near);
    expect(current().sort).toBe('distance');
  });

  it('lets the person choose how far to look', async () => {
    const { wrapper, current } = setup({ near });
    await wrapper.find('#f-radius').setValue('10');
    expect(current().radiusKm).toBe(10);
  });

  it('hides the radius until there is an address', () => {
    expect(setup().wrapper.find('#f-radius').exists()).toBe(false);
  });

  it('clearing the address goes back to sorting by ending soonest', async () => {
    const { wrapper, current } = setup({ near, sort: 'distance' });
    const clear = wrapper.findAll('button').find((b) => b.text() === 'Clear');
    await clear.trigger('click');
    expect(current().near).toBeNull();
    expect(current().sort).toBe('ending');
  });

  it('keeps a non-distance sort when the address is cleared', async () => {
    const { wrapper, current } = setup({ near, sort: 'newest' });
    await wrapper.findAll('button').find((b) => b.text() === 'Clear').trigger('click');
    expect(current().sort).toBe('newest');
  });
});

describe('ListingFilters: my location', () => {
  const click = (wrapper) => wrapper.findAll('button').find((b) => b.text().includes('My location')).trigger('click');

  it('explains when the browser has no location support', async () => {
    const { wrapper } = setup();
    await click(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toContain('does not support location');
  });

  it('uses the position the browser reports', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 1.3, longitude: 103.8 } }) },
    });
    const { wrapper, current } = setup();
    await click(wrapper);
    expect(current().near).toEqual({ lat: 1.3, lng: 103.8, label: 'My location' });
  });

  it('suggests searching for an address when permission is refused', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok, fail) => fail(new Error('denied')) },
    });
    const { wrapper } = setup();
    await click(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toContain('search for an address');
  });
});
