/* Integration tests for the "Say thanks" form: ReviewModal with the real StarRating pickers, the real ThankYouNote
   live preview and the real reviews / session Pinia stores, all mounted together (no stubs between them).
   Only the edges are replaced: the API (so no server is needed), the router, the confetti and motion-v's animation.
   StarRating and ThankYouNote are tested on their own elsewhere; here we check that they work together. */
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api';
import { useReviews } from '../../stores/reviews';
import { useSession } from '../../stores/session';
import { burst } from '../../utils/confetti';
import { makeNote } from '../../__tests__/reviewFixtures';
import ReviewModal from '../ReviewModal.vue';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal()), // keep the real errorMessage / fieldErrors helpers
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('../../utils/confetti', () => ({ burst: vi.fn() }));
vi.mock('motion-v', async () => (await import('../../__tests__/reviewFixtures')).motionStub);

const PICKUP = { reservationId: 'r1', bakeryId: 'b1', bakeryName: 'Sunrise Bakery', itemName: 'Butter croissants', quantity: 2 };
let pinia;

function open({ role = 'individual', pickup = PICKUP } = {}) {
  useSession().user = { id: 'u1', name: role === 'charity' ? 'Hope Kitchen' : 'Casey Lim', role };
  return mount(ReviewModal, { props: { pickup }, global: { plugins: [pinia] }, attachTo: document.body });
}
const byTest = (w, id) => w.find(`[data-testid="${id}"]`);
const preview = (w) => w.find('.preview-pane');
/** Clicks the nth star (1-5) of the food (0) or accuracy (1) picker. */
const rate = (w, picker, n) => w.findAll('[role="radiogroup"]')[picker].findAll('[role="radio"]')[n - 1].trigger('click');
async function fillIn(w, { food = 4, accuracy = 5, note = 'Still warm, thank you!' } = {}) {
  await rate(w, 0, food);
  await rate(w, 1, accuracy);
  await w.find('#review-note').setValue(note);
}
const send = async (w) => {
  await w.find('form').trigger('submit');
  await flushPromises();
};

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { count: 0, items: [] } }); // GET /reviews/pending after posting
  document.body.innerHTML = '';
});

describe('ReviewModal + StarRating + ThankYouNote: writing a thank-you', () => {
  it('shows what is being reviewed', () => {
    const w = open();
    expect(w.find('#review-title').text()).toBe('How was your Butter croissants?');
    expect(w.text()).toContain('from Sunrise Bakery · 2 units');
  });

  it('updates the live preview note as the stars are clicked and the note is typed', async () => {
    const w = open();
    expect(preview(w).text()).toContain('Your note will appear here…');
    await fillIn(w, { food: 4, accuracy: 5, note: 'Lovely staff' });
    expect(preview(w).find('[data-testid="note-text"]').text()).toBe('Lovely staff');
    expect(preview(w).find('[aria-label="Food: 4 out of 5 stars"]').exists()).toBe(true);
    expect(preview(w).find('[aria-label="Listing accuracy: 5 out of 5 stars"]').exists()).toBe(true);
  });

  it('shows the default nickname on the preview, then the one typed in', async () => {
    const w = open();
    expect(preview(w).text()).toContain('Casey L.');
    await w.find('#review-nickname').setValue('CaseyBakes');
    expect(preview(w).text()).toContain('CaseyBakes');
  });

  it('adds a quick compliment to the note with one tap, and removes it with another', async () => {
    const w = open();
    const chip = w.findAll('.chip').find((c) => c.text() === 'So fresh');
    await chip.trigger('click');
    expect(w.find('#review-note').element.value).toBe('So fresh');
    expect(preview(w).find('[data-testid="note-text"]').text()).toBe('So fresh');
    await chip.trigger('click');
    expect(w.find('#review-note').element.value).toBe('');
  });

  it('shows what is missing and sends nothing when the form is incomplete', async () => {
    const w = open();
    await send(w);
    expect(w.text()).toContain('Rate the food from 1 to 5 stars.');
    expect(w.text()).toContain('Rate how accurate the listing was.');
    expect(w.text()).toContain('Write at least 3 characters');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('posts a complete thank-you, celebrates, and shows the note as it will look on the wall', async () => {
    const saved = makeNote({ id: 'new1', note: 'Still warm, thank you!', foodRating: 4, accuracyRating: 5, mine: true });
    api.post.mockResolvedValue({ data: saved });
    const w = open();
    await fillIn(w);
    await send(w);

    expect(api.post).toHaveBeenCalledWith('/reviews', { reservationId: 'r1', note: 'Still warm, thank you!', foodRating: 4, accuracyRating: 5, nickname: '' });
    expect(byTest(w, 'posted-check').exists()).toBe(true);
    expect(w.text()).toContain('Thank you!');
    expect(w.find('.posted-note [data-testid="note-text"]').text()).toBe('Still warm, thank you!');
    expect(burst).toHaveBeenCalled();
    expect(useReviews().lastPosted).toEqual(saved); // the wall listens to this
    expect(api.get).toHaveBeenCalledWith('/reviews/pending'); // the "waiting for thanks" list is refreshed
  });

  it('takes the user to the bakery’s wall from the success screen', async () => {
    api.post.mockResolvedValue({ data: makeNote({ bakeryId: 'b1' }) });
    const w = open();
    await fillIn(w);
    await send(w);
    await byTest(w, 'see-wall').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'bakery-wall', params: { id: 'b1' } });
    expect(w.emitted('close')).toBeTruthy();
  });

  it('lets a charity thank on behalf of the people it serves', async () => {
    api.post.mockResolvedValue({ data: makeNote({ authorRole: 'charity' }) });
    const w = open({ role: 'charity' });
    await fillIn(w);
    await w.find('#review-behalf').setValue(true);
    await w.find('#review-behalf-of').setValue('our breakfast club');
    await w.find('#review-people').setValue('40');
    expect(preview(w).find('[data-testid="on-behalf"]').text()).toContain('our breakfast club');
    await send(w);
    expect(api.post.mock.calls[0][1]).toMatchObject({ onBehalfOf: 'our breakfast club', peopleServed: 40 });
  });

  it('does not offer "on behalf of" to individuals', () => {
    expect(open().find('#review-behalf').exists()).toBe(false);
  });

  it('shows the server’s field errors next to the right field', async () => {
    api.post.mockRejectedValue({ response: { status: 422, data: { error: 'Please fix the highlighted fields.', fields: { nickname: 'Use 2–20 characters.' } } } });
    const w = open();
    await fillIn(w);
    await send(w);
    expect(w.find('#review-nickname').classes()).toContain('is-invalid');
    expect(w.text()).toContain('Use 2–20 characters.');
  });

  it('explains when the pickup was already thanked, and refreshes the waiting list', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: 'You have already thanked this bakery for this pickup.' } } });
    const w = open();
    await fillIn(w);
    await send(w);
    expect(w.find('[role="alert"]').text()).toBe('You have already thanked this bakery for this pickup.');
    expect(api.get).toHaveBeenCalledWith('/reviews/pending');
  });
});

describe('ReviewModal: editing your own note', () => {
  const existing = makeNote({ id: 'n7', note: 'Good bread', foodRating: 3, accuracyRating: 4, nickname: 'Case', mine: true });
  const editPickup = { reservationId: 'edit-n7', bakeryId: 'b1', bakeryName: 'Sunrise Bakery', itemName: 'Butter croissants', review: existing };

  it('opens with the note filled in', () => {
    const w = open({ pickup: editPickup });
    expect(w.text()).toContain('Edit your note');
    expect(w.find('#review-note').element.value).toBe('Good bread');
    expect(w.find('#review-nickname').element.value).toBe('Case');
    expect(w.findAll('[role="radiogroup"]')[0].findAll('[role="radio"]')[2].attributes('aria-checked')).toBe('true');
    expect(byTest(w, 'send-thanks').text()).toBe('Save changes');
  });

  it('saves the changes with PATCH, hands the updated note to the wall, and closes', async () => {
    const updated = { ...existing, note: 'Great bread, even the next day', foodRating: 5 };
    api.patch.mockResolvedValue({ data: updated });
    const w = open({ pickup: editPickup });
    await rate(w, 0, 5);
    await w.find('#review-note').setValue('Great bread, even the next day');
    await send(w);
    expect(api.patch).toHaveBeenCalledWith('/reviews/n7', { note: 'Great bread, even the next day', foodRating: 5, accuracyRating: 4, nickname: 'Case' });
    expect(api.post).not.toHaveBeenCalled();
    expect(useReviews().lastPosted).toEqual(updated);
    expect(w.emitted('close')).toBeTruthy();
  });
});
