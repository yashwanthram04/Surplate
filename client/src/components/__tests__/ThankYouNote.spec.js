/* Component tests for ThankYouNote.vue: one sticky note on the Thank-you Wall.
   The child StarRating is replaced by a stub that just prints the value it receives, so these tests check what
   ThankYouNote itself is responsible for: what it shows for each kind of note, which controls each viewer gets
   (bakery staff: pin and reply; the author: edit and delete), and the events it emits. StarRating has its own tests. */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { now } from '../../composables/useNow';
import { makeNote } from '../../__tests__/reviewFixtures';
import ThankYouNote from '../ThankYouNote.vue';

vi.mock('motion-v', async () => (await import('../../__tests__/reviewFixtures')).motionStub);
vi.mock('../../composables/useNow', async () => {
  const { ref } = await import('vue');
  return { now: ref(0) };
});

// Custom stub: shows the label and value StarRating was given.
const StarRatingStub = defineComponent({
  props: ['modelValue', 'label'],
  setup: (props) => () => h('span', { class: 'stars-stub' }, `${props.label}: ${props.modelValue}`),
});

const noteOn = (note = {}, props = {}) =>
  mount(ThankYouNote, { props: { note: makeNote(note), ...props }, global: { stubs: { StarRating: StarRatingStub } } });
const byTest = (w, id) => w.find(`[data-testid="${id}"]`);

beforeEach(() => {
  now.value = Date.now();
});

describe('ThankYouNote: what everyone sees', () => {
  it('shows the note, the nickname, the item collected and how long ago', () => {
    const w = noteOn({ note: 'So fresh, thank you!', nickname: 'Alex T.', itemName: 'Kaya buns' });
    expect(byTest(w, 'note-text').text()).toBe('So fresh, thank you!');
    expect(w.text()).toContain('Alex T.');
    expect(w.text()).toContain('Kaya buns · 5 min ago');
  });

  it('passes the food and accuracy ratings to the star displays', () => {
    const stars = noteOn({ foodRating: 3, accuracyRating: 5 }).findAll('.stars-stub').map((s) => s.text());
    expect(stars).toEqual(['Food: 3', 'Listing accuracy: 5']);
  });

  it('shows the avatar initial from the nickname', () => {
    expect(noteOn({ nickname: 'zoe' }).find('.note-avatar').text()).toBe('Z');
  });

  it('shows a pin only on notes the bakery has pinned', () => {
    expect(byTest(noteOn({ pinned: true }), 'pinned-badge').exists()).toBe(true);
    expect(byTest(noteOn({ pinned: false }), 'pinned-badge').exists()).toBe(false);
  });

  it('shows who a charity thanked on behalf of, and how many people', () => {
    const w = noteOn({ authorRole: 'charity', onBehalfOf: 'the families at our breakfast club', peopleServed: 40 });
    expect(byTest(w, 'on-behalf').text()).toContain('On behalf of the families at our breakfast club');
    expect(byTest(w, 'on-behalf').text()).toContain('40 people');
    expect(byTest(noteOn(), 'on-behalf').exists()).toBe(false);
  });

  it('shows the bakery’s reply under the note when there is one', () => {
    expect(byTest(noteOn({ reply: { text: 'See you tomorrow!' } }), 'note-reply').text()).toContain('See you tomorrow!');
    expect(byTest(noteOn(), 'note-reply').exists()).toBe(false);
  });

  it('marks the viewer’s own note with "you"', () => {
    expect(noteOn({ mine: true }).find('.note-mine').exists()).toBe(true);
    expect(noteOn({ mine: false }).find('.note-mine').exists()).toBe(false);
  });

  it('gives each note a stable paper colour', () => {
    const a = noteOn({ id: 'abc' }).find('.note-paper').classes().find((c) => c.startsWith('note-tone-'));
    const b = noteOn({ id: 'abc' }).find('.note-paper').classes().find((c) => c.startsWith('note-tone-'));
    expect(a).toBe(b);
  });
});

describe('ThankYouNote: bakery staff controls', () => {
  it('appear only when the wall belongs to the viewer’s bakery', () => {
    expect(byTest(noteOn({}, { manage: true }), 'pin-btn').exists()).toBe(true);
    expect(byTest(noteOn(), 'pin-btn').exists()).toBe(false);
    expect(byTest(noteOn(), 'reply-btn').exists()).toBe(false);
  });

  it('emits "pin" with the note when Pin is clicked', async () => {
    const w = noteOn({ id: 'n9' }, { manage: true, pinsLeft: 2 });
    await byTest(w, 'pin-btn').trigger('click');
    expect(w.emitted('pin')[0][0].id).toBe('n9');
  });

  it('disables Pin when all pins are used, but still lets a pinned note be unpinned', () => {
    expect(byTest(noteOn({ pinned: false }, { manage: true, pinsLeft: 0 }), 'pin-btn').attributes('disabled')).toBeDefined();
    const pinned = byTest(noteOn({ pinned: true }, { manage: true, pinsLeft: 0 }), 'pin-btn');
    expect(pinned.attributes('disabled')).toBeUndefined();
    expect(pinned.text()).toContain('Unpin');
  });

  it('opens a reply box pre-filled with the current reply, and emits the trimmed text', async () => {
    const w = noteOn({ reply: { text: 'Thanks!' } }, { manage: true });
    await byTest(w, 'reply-btn').trigger('click');
    const box = w.find('textarea');
    expect(box.element.value).toBe('Thanks!');
    await box.setValue('  See you tomorrow!  ');
    await w.find('form').trigger('submit');
    const [note, text, done] = w.emitted('reply')[0];
    expect(note.id).toBe('n1');
    expect(text).toBe('See you tomorrow!');
    expect(done).toBeTypeOf('function');
  });

  it('refuses a reply over 140 characters without emitting', async () => {
    const w = noteOn({}, { manage: true });
    await byTest(w, 'reply-btn').trigger('click');
    await w.find('textarea').setValue('x'.repeat(141));
    await w.find('form').trigger('submit');
    expect(w.text()).toContain('Keep replies under 140 characters.');
    expect(w.emitted('reply')).toBeUndefined();
  });

  it('offers to remove the reply when the box is emptied', async () => {
    const w = noteOn({ reply: { text: 'Hi' } }, { manage: true });
    await byTest(w, 'reply-btn').trigger('click');
    await w.find('textarea').setValue('');
    expect(byTest(w, 'send-reply').text()).toBe('Remove reply');
  });
});

describe('ThankYouNote: the author’s controls', () => {
  it('lets the author edit or delete their own note', async () => {
    const w = noteOn({ id: 'mine-1', mine: true });
    await byTest(w, 'edit-note-btn').trigger('click');
    await byTest(w, 'delete-note-btn').trigger('click');
    expect(w.emitted('edit')[0][0].id).toBe('mine-1');
    expect(w.emitted('remove')[0][0].id).toBe('mine-1');
  });

  it('are not shown on other people’s notes', () => {
    const w = noteOn({ mine: false });
    expect(byTest(w, 'edit-note-btn').exists()).toBe(false);
    expect(byTest(w, 'delete-note-btn').exists()).toBe(false);
  });

  it('are disabled while another change is being saved', () => {
    expect(byTest(noteOn({ mine: true }, { busy: true }), 'delete-note-btn').attributes('disabled')).toBeDefined();
  });
});

describe('ThankYouNote as a preview (inside the thank-you form)', () => {
  it('shows the note flat, with no controls for anyone', () => {
    const w = noteOn({ mine: true }, { preview: true, manage: true });
    expect(w.classes()).toContain('is-preview');
    expect(w.find('.note-paper').attributes('style')).toContain('--tilt: 0deg');
    expect(w.find('.note-tools').exists()).toBe(false);
  });
});
