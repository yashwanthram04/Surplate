import { mount } from '@vue/test-utils';
import { gsap } from 'gsap';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BouncingHeading from '../BouncingHeading.vue';

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});

describe('shared banner heading', () => {
  it('keeps the accessible title and updates text without leaving old animations running', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    wrapper = mount(BouncingHeading, { props: { text: 'Community fridges' } });
    const oldLetters = wrapper.findAll('.ch').map((letter) => letter.element);
    expect(wrapper.attributes('aria-label')).toBe('Community fridges');
    expect(gsap.getTweensOf(oldLetters).length).toBeGreaterThan(0);
    await wrapper.setProps({ text: 'Rescue food' });
    expect(wrapper.attributes('aria-label')).toBe('Rescue food');
    expect(wrapper.text()).toBe('Rescue food');
    expect(gsap.getTweensOf(oldLetters)).toHaveLength(0);
    const letters = wrapper.findAll('.ch').map((letter) => letter.element);
    wrapper.unmount();
    wrapper = null;
    expect(gsap.getTweensOf(letters)).toHaveLength(0);
  });

  it('keeps text still, including on hover, when reduced motion is enabled', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    wrapper = mount(BouncingHeading, { props: { text: 'Community fridges' } });
    await wrapper.find('.ch-in').trigger('mouseenter');
    const letters = wrapper.findAll('.ch, .ch-in').map((letter) => letter.element);
    expect(gsap.getTweensOf(letters)).toHaveLength(0);
    expect(letters.every((letter) => !letter.style.transform)).toBe(true);
  });
});
