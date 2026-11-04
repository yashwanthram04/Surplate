/* Component tests for StarRating.vue: the star picker in the thank-you and rate-customer forms, and the read-only
   stars on every note. Tested in isolation through its props, the events it emits and what a user sees and can do
   (click, hover, keyboard), not through its internals. */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import StarRating from '../StarRating.vue';

const LABELS = ['', 'Not good', 'Could be better', 'Okay', 'Really good', 'Loved it!'];
const picker = (props = {}) => mount(StarRating, { props: { label: 'Food rating', labels: LABELS, ...props } });
const stars = (w) => w.findAll('[role="radio"]');
const emitted = (w) => w.emitted('update:modelValue')?.map(([v]) => v) ?? [];

describe('StarRating (interactive)', () => {
  it('shows five stars to choose from, in a labelled group', () => {
    const w = picker();
    expect(stars(w)).toHaveLength(5);
    expect(w.find('[role="radiogroup"]').attributes('aria-label')).toBe('Food rating');
    expect(w.text()).toContain('Tap a star');
  });

  it('emits the number of the star that was clicked', async () => {
    const w = picker();
    await stars(w)[3].trigger('click');
    expect(emitted(w)).toEqual([4]);
  });

  it('marks the chosen star as checked and shows its label', () => {
    const w = picker({ modelValue: 5 });
    expect(stars(w)[4].attributes('aria-checked')).toBe('true');
    expect(stars(w)[0].attributes('aria-checked')).toBe('false');
    expect(w.find('.star-label').text()).toBe('Loved it!');
  });

  it('previews a star’s label on hover, and goes back when the pointer leaves', async () => {
    const w = picker({ modelValue: 2 });
    await stars(w)[4].trigger('mouseenter');
    expect(w.find('.star-label').text()).toBe('Loved it!');
    expect(w.findAll('.bi-star-fill')).toHaveLength(5);
    await w.find('[role="radiogroup"]').trigger('mouseleave');
    expect(w.find('.star-label').text()).toBe('Could be better');
    expect(w.findAll('.bi-star-fill')).toHaveLength(2);
  });

  it('works from the keyboard: arrows move one star, Home and End jump to the ends', async () => {
    const w = picker({ modelValue: 2 });
    await stars(w)[1].trigger('keydown', { key: 'ArrowRight' });
    await stars(w)[1].trigger('keydown', { key: 'ArrowLeft' });
    await stars(w)[1].trigger('keydown', { key: 'End' });
    await stars(w)[1].trigger('keydown', { key: 'Home' });
    expect(emitted(w)).toEqual([3, 1, 5, 1]);
  });

  it('does not go below one star or above five with the arrows', async () => {
    const low = picker({ modelValue: 1 });
    await stars(low)[0].trigger('keydown', { key: 'ArrowLeft' });
    const high = picker({ modelValue: 5 });
    await stars(high)[4].trigger('keydown', { key: 'ArrowUp' });
    expect(emitted(low)).toEqual([1]);
    expect(emitted(high)).toEqual([5]);
  });

  it('ignores other keys, so Tab still moves on to the next field', async () => {
    const w = picker({ modelValue: 3 });
    await stars(w)[2].trigger('keydown', { key: 'Tab' });
    expect(emitted(w)).toEqual([]);
  });

  it('can be focused with Tab on exactly one star (the chosen one, or the first)', () => {
    const tabbable = (w) => stars(w).filter((s) => s.attributes('tabindex') === '0').length;
    expect(tabbable(picker())).toBe(1);
    expect(stars(picker())[0].attributes('tabindex')).toBe('0');
    expect(stars(picker({ modelValue: 4 }))[3].attributes('tabindex')).toBe('0');
  });

  it('shows an error state when marked invalid', () => {
    expect(picker({ invalid: true }).find('.stars').classes()).toContain('invalid');
  });
});

describe('StarRating (read-only)', () => {
  const display = (value) => mount(StarRating, { props: { modelValue: value, readonly: true, label: 'Food' } });

  it('reads out the value, including averages like 4.5', () => {
    expect(display(4.5).attributes('aria-label')).toBe('Food: 4.5 out of 5 stars');
    expect(display(4.5).attributes('role')).toBe('img');
  });

  it('fills the stars in proportion to the value', () => {
    expect(display(4.5).find('.stars-fill').attributes('style')).toContain('width: 90%');
    expect(display(0).find('.stars-fill').attributes('style')).toContain('width: 0%');
  });

  it('never fills past five stars or below zero', () => {
    expect(display(7).find('.stars-fill').attributes('style')).toContain('width: 100%');
    expect(display(-2).find('.stars-fill').attributes('style')).toContain('width: 0%');
  });

  it('has no buttons to click', () => {
    const w = display(3);
    expect(w.findAll('button')).toHaveLength(0);
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });
});
