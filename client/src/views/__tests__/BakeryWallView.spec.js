/* Integration tests for the Thank-you Wall page: BakeryWallView with the real ThankYouNote, StarRating,
   ConfirmModal and CountUp components and the real session / reviews stores. The API is replaced by a mock that
   answers like the server, so each test can check the whole page's behaviour for a visitor, the bakery's staff
   and a note's author. ReliabilityGauge is stubbed (it has its own tests); confetti and motion-v are faked. */
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { api } from '../../api';
import { useReviews } from '../../stores/reviews';
import { useSession } from '../../stores/session';
import { burst } from '../../utils/confetti';
import { makeNote, makeReputation } from '../../__tests__/reviewFixtures';
import BakeryWallView from '../BakeryWallView.vue';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal()),
  api: { get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../utils/confetti', () => ({ burst: vi.fn() }));
vi.mock('motion-v', async () => (await import('../../__tests__/reviewFixtures')).motionStub);

const PINNED = makeNote({ id: 'p1', note: 'Best kaya buns in the east', pinned: true, nickname: 'Mei' });
const CHARITY = makeNote({ id: 'c1', note: 'The kids loved them', authorRole: 'charity', nickname: 'Hope Kitchen', onBehalfOf: 'our after-school club', peopleServed: 18 });
const MINE = makeNote({ id: 'm1', note: 'Still warm!', nickname: 'Casey L.' }); // written by Casey (u1)
const OTHER = makeNote({ id: 'o1', note: 'Generous portions', nickname: 'Sam' });

let wall; // what GET /reviews/bakery/b1 returns; tests change it to play out what the server would say next
const wallResponse = (items = [PINNED, CHARITY, MINE, OTHER], reputation = {}) => ({
  bakery: { id: 'b1', name: 'Sunrise Bakery', address: '1 Bread Street' },
  reputation: makeReputation({ thankYouCount: items.length, ...reputation }), items, page: 1, pageSize: 12, total: items.length, pinLimit: 3,
});

function fakeServer() {
  api.get.mockImplementation(async (url) => {
    // Like the server, `mine` is only true for the signed-in author (Casey wrote m1 and any "fresh" note).
    if (url === '/reviews/bakery/b1') return { data: { ...wall, items: wall.items.map((n) => ({ ...n, mine: n.id === 'm1' && useSession().user?.id === 'u1' })) } };
    if (url === '/reviews/to-rate') return { data: { count: 2, items: [] } };
    if (url === '/reviews/pending') return { data: { count: 0, items: [] } };
    throw { response: { status: 404, data: { error: 'Bakery not found.' } } };
  });
}

let pinia;
async function visit({ as = null, id = 'b1' } = {}) {
  useSession().user = as;
  const w = mount(BakeryWallView, {
    props: { id },
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub, ReliabilityGauge: true } },
    attachTo: document.body,
  });
  await flushPromises();
  return w;
}
const BAKERY = { id: 'b1', name: 'Sunrise Bakery', role: 'bakery' };
const CASEY = { id: 'u1', name: 'Casey Lim', role: 'individual' };

const notes = (w) => w.findAll('[data-testid="thank-you-note"]');
const texts = (w) => notes(w).map((n) => n.find('[data-testid="note-text"]').text());
const noteById = (w, id) => w.find(`[data-note-id="${id}"]`);
const byTest = (w, id) => w.find(`[data-testid="${id}"]`);

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.clearAllMocks();
  vi.stubGlobal('requestAnimationFrame', (cb) => cb());
  wall = wallResponse();
  fakeServer();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the Thank-you Wall for any visitor', () => {
  it('shows the bakery, its totals and every note, pinned first', async () => {
    const w = await visit();
    expect(byTest(w, 'wall-title').text()).toBe('Sunrise Bakery');
    expect(w.find('.wall-stat').text()).toContain('thank-you notes');
    expect(w.find('.wall-stat [data-value]').attributes('data-value')).toBe('4');
    expect(byTest(w, 'food-average').text()).toBe('4.7');
    expect(texts(w)).toEqual(['Best kaya buns in the east', 'The kids loved them', 'Still warm!', 'Generous portions']);
    expect(notes(w)[0].find('[data-testid="pinned-badge"]').exists()).toBe(true);
  });

  it('filters to pinned notes or notes from charities, with a count on each filter', async () => {
    const w = await visit();
    expect(byTest(w, 'filter-pinned').text()).toContain('1');
    expect(byTest(w, 'filter-charity').text()).toContain('1');
    await byTest(w, 'filter-charity').trigger('click');
    expect(texts(w)).toEqual(['The kids loved them']);
    await byTest(w, 'filter-pinned').trigger('click');
    expect(texts(w)).toEqual(['Best kaya buns in the east']);
    await byTest(w, 'filter-all').trigger('click');
    expect(notes(w)).toHaveLength(4);
  });

  it('runs a ticker of the wall’s own quotes under the hero', async () => {
    const w = await visit();
    const quotes = w.findAll('[data-testid="ticker-item"]').filter((i) => i.attributes('tabindex') === '0').map((i) => i.text());
    expect(quotes).toHaveLength(4);
    expect(quotes[0]).toContain('Best kaya buns in the east');
  });

  it('clicking a quote in the ticker brings its note back into view, even when a filter hides it', async () => {
    const w = await visit();
    await byTest(w, 'filter-pinned').trigger('click');
    expect(noteById(w, 'o1').exists()).toBe(false);
    const quote = w.findAll('[data-testid="ticker-item"]').find((i) => i.text().includes('Generous portions'));
    await quote.trigger('click');
    await flushPromises();
    expect(byTest(w, 'filter-all').attributes('aria-pressed')).toBe('true');
    expect(noteById(w, 'o1').exists()).toBe(true);
  });

  it('has no ticker when there is only one note', async () => {
    wall = wallResponse([PINNED]);
    const w = await visit();
    expect(byTest(w, 'ticker').exists()).toBe(false);
  });

  it('gives a signed-out visitor no staff or author controls', async () => {
    const w = await visit();
    expect(w.find('[data-testid="pin-btn"]').exists()).toBe(false);
    expect(w.find('[data-testid="edit-note-btn"]').exists()).toBe(false);
    expect(w.find('[data-testid="rate-customers-link"]').exists()).toBe(false);
  });

  it('invites a first note on an empty wall', async () => {
    wall = wallResponse([]);
    const w = await visit();
    expect(byTest(w, 'empty-wall').text()).toContain('No thank-yous yet');
  });

  it('says so when the bakery does not exist', async () => {
    const w = await visit({ id: 'missing' });
    expect(byTest(w, 'not-found').exists()).toBe(true);
  });
});

describe('the Thank-you Wall for the bakery’s own staff', () => {
  it('links to rating customers, with how many are waiting', async () => {
    const w = await visit({ as: BAKERY });
    expect(byTest(w, 'to-rate-count').text()).toBe('2');
  });

  it('shows pin and reply on every note, but not the author’s edit and delete', async () => {
    const w = await visit({ as: BAKERY });
    expect(w.findAll('[data-testid="pin-btn"]')).toHaveLength(4);
    expect(w.findAll('[data-testid="reply-btn"]')).toHaveLength(4);
    expect(w.find('[data-testid="delete-note-btn"]').exists()).toBe(false);
  });

  it('pins a note: the server is told, the note jumps to the top and a little celebration plays', async () => {
    api.patch.mockResolvedValue({ data: { ...OTHER, pinned: true } });
    const w = await visit({ as: BAKERY });
    await noteById(w, 'o1').find('[data-testid="pin-btn"]').trigger('click');
    await flushPromises();
    expect(api.patch).toHaveBeenCalledWith('/reviews/o1/pin', { pinned: true });
    expect(texts(w)[0]).toBe('Generous portions');
    expect(burst).toHaveBeenCalled();
  });

  it('shows the server’s answer when a pin is refused', async () => {
    api.patch.mockRejectedValue({ response: { status: 409, data: { error: 'You can pin up to 3 notes. Unpin one first.' } } });
    const w = await visit({ as: BAKERY });
    await noteById(w, 'o1').find('[data-testid="pin-btn"]').trigger('click');
    await flushPromises();
    expect(w.find('.alert-danger').text()).toBe('You can pin up to 3 notes. Unpin one first.');
    expect(texts(w)[0]).toBe('Best kaya buns in the east'); // nothing moved
  });

  it('replies to a note, and the reply appears under it', async () => {
    api.put.mockResolvedValue({ data: { ...OTHER, reply: { text: 'See you tomorrow!' } } });
    const w = await visit({ as: BAKERY });
    const note = noteById(w, 'o1');
    await note.find('[data-testid="reply-btn"]').trigger('click');
    await note.find('textarea').setValue('See you tomorrow!');
    await note.find('form').trigger('submit');
    await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/reviews/o1/reply', { text: 'See you tomorrow!' });
    expect(noteById(w, 'o1').find('[data-testid="note-reply"]').text()).toContain('See you tomorrow!');
    expect(noteById(w, 'o1').find('textarea').exists()).toBe(false); // the reply box closed
  });
});

describe('the Thank-you Wall for a note’s author', () => {
  it('shows edit and delete only on the author’s own note', async () => {
    const w = await visit({ as: CASEY });
    expect(w.findAll('[data-testid="delete-note-btn"]')).toHaveLength(1);
    expect(noteById(w, 'm1').find('[data-testid="delete-note-btn"]').exists()).toBe(true);
  });

  it('asks before deleting, then removes the note and refreshes the totals', async () => {
    api.delete.mockResolvedValue({ status: 204 });
    const w = await visit({ as: CASEY });
    await noteById(w, 'm1').find('[data-testid="delete-note-btn"]').trigger('click');
    const dialog = w.find('[role="dialog"]');
    expect(dialog.text()).toContain('Delete your note?');
    expect(dialog.text()).toContain('“Still warm!” will be taken off Sunrise Bakery’s wall.');

    wall = wallResponse([PINNED, CHARITY, OTHER]); // what the server returns once the note is gone
    await dialog.findAll('button').find((b) => b.text() === 'Delete note').trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/reviews/m1');
    expect(noteById(w, 'm1').exists()).toBe(false);
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.find('.wall-stat [data-value]').attributes('data-value')).toBe('3');
    expect(api.get).toHaveBeenCalledWith('/reviews/pending'); // the pickup can be thanked again
  });

  it('keeps the note when the author cancels', async () => {
    const w = await visit({ as: CASEY });
    await noteById(w, 'm1').find('[data-testid="delete-note-btn"]').trigger('click');
    await w.find('[role="dialog"]').findAll('button').find((b) => b.text() === 'Cancel').trigger('click');
    expect(api.delete).not.toHaveBeenCalled();
    expect(noteById(w, 'm1').exists()).toBe(true);
  });

  it('keeps the note and explains when the delete fails', async () => {
    api.delete.mockRejectedValue({ response: { status: 404, data: { error: 'Note not found.' } } });
    const w = await visit({ as: CASEY });
    await noteById(w, 'm1').find('[data-testid="delete-note-btn"]').trigger('click');
    await w.find('[role="dialog"]').findAll('button').find((b) => b.text() === 'Delete note').trigger('click');
    await flushPromises();
    expect(w.find('[role="dialog"] [role="alert"]').text()).toBe('Note not found.');
    expect(noteById(w, 'm1').exists()).toBe(true);
  });

  it('opens the thank-you form on the note for editing, and shows the saved change in place', async () => {
    const w = await visit({ as: CASEY });
    await noteById(w, 'm1').find('[data-testid="edit-note-btn"]').trigger('click');
    const reviews = useReviews();
    expect(reviews.current).toMatchObject({ bakeryName: 'Sunrise Bakery', itemName: 'Butter croissants', review: { id: 'm1' } });

    await reviews.posted({ ...MINE, mine: true, note: 'Still warm, and so soft!' }); // what the form does after a successful PATCH
    await nextTick();
    expect(noteById(w, 'm1').find('[data-testid="note-text"]').text()).toBe('Still warm, and so soft!');
    expect(notes(w)).toHaveLength(4);
  });

  it('puts a note posted from elsewhere (e.g. the banner) on the wall straight away', async () => {
    const w = await visit({ as: CASEY });
    await useReviews().posted(makeNote({ id: 'fresh', note: 'Just collected, thank you!', mine: true, createdAt: new Date().toISOString() }));
    await nextTick();
    expect(texts(w)[1]).toBe('Just collected, thank you!'); // after the pinned note, newest first
  });

  it('ignores a note posted for a different bakery', async () => {
    const w = await visit({ as: CASEY });
    await useReviews().posted(makeNote({ id: 'elsewhere', bakeryId: 'b2' }));
    await nextTick();
    expect(noteById(w, 'elsewhere').exists()).toBe(false);
  });
});
