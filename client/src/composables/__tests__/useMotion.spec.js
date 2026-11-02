/* Tests for composables/useMotion.js: the motion shared by the browse board, My listings and the listing page.
   jsdom has no layout, so these check behaviour (what is shown, hidden, cleaned up and in what order) rather than pixels.
   GSAP's clock is stepped by hand with jump(), so no test waits on real time. */
import { mount } from '@vue/test-utils';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { motionAllowed, useEntrance, useListMotion } from '../useMotion';

const jump = (seconds) => gsap.globalTimeline.totalTime(gsap.globalTimeline.totalTime() + seconds);
const stubMotion = (reduce) => vi.stubGlobal('matchMedia', () => ({ matches: reduce }));

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  gsap.globalTimeline.clear();
});

describe('motionAllowed', () => {
  it('is off where the browser cannot tell (so tests and very old browsers stay still)', () => {
    expect(motionAllowed()).toBe(false);
  });

  it('is off when the visitor prefers reduced motion', () => {
    stubMotion(true);
    expect(motionAllowed()).toBe(false);
  });

  it('is on otherwise', () => {
    stubMotion(false);
    expect(motionAllowed()).toBe(true);
  });
});

/** A list on a page: <ul><li data-index>…</li></ul> driven by useListMotion. */
function mountList(count = 3) {
  const ids = ref(Array.from({ length: count }, (_, i) => `c${i}`));
  let motion;
  const wrapper = mount(
    defineComponent({
      setup() {
        const list = ref(null);
        motion = useListMotion(list, () => ids.value.join(','));
        return () => h('ul', { ref: list }, ids.value.map((id, i) => h('li', { key: id, 'data-id': id, 'data-index': i }, id)));
      },
    }),
    { attachTo: document.body }
  );
  return { wrapper, ids, hooks: motion, li: (i) => wrapper.findAll('li')[i].element };
}

describe('useListMotion: a card appearing', () => {
  it('shows it straight away when motion is off', () => {
    const { hooks, li } = mountList();
    const done = vi.fn();
    hooks.onBeforeEnter(li(0));
    hooks.onEnter(li(0), done);
    expect(done).toHaveBeenCalledOnce();
    expect(li(0).style.visibility).toBe('');
  });

  it('starts hidden, rises in, and leaves no inline styles behind', () => {
    stubMotion(false);
    const { hooks, li } = mountList();
    const done = vi.fn();
    hooks.onBeforeEnter(li(0));
    expect(li(0).style.visibility).toBe('hidden'); // gsap autoAlpha: 0
    hooks.onEnter(li(0), done);
    expect(done).not.toHaveBeenCalled();
    jump(2);
    expect(done).toHaveBeenCalledOnce();
    expect(li(0).getAttribute('style') ?? '').not.toMatch(/opacity|visibility|transform/);
  });

  it('staggers later cards by position, but never by more than eight places', () => {
    stubMotion(false);
    const { hooks, li } = mountList(12);
    const delays = [0, 3, 11].map((i) => {
      const tween = vi.spyOn(gsap, 'to');
      hooks.onEnter(li(i), () => {});
      const delay = tween.mock.calls.at(-1)[1].delay;
      tween.mockRestore();
      return delay;
    });
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBeCloseTo(0.18);
    expect(delays[2]).toBeCloseTo(0.48); // capped at 8 x 60 ms
  });
});

describe('useListMotion: a card leaving', () => {
  it('goes at once when motion is off', () => {
    const { hooks, li } = mountList();
    const done = vi.fn();
    hooks.onLeave(li(1), done);
    expect(done).toHaveBeenCalledOnce();
  });

  it('is taken out of the flow straight away, then fades, then is released', () => {
    stubMotion(false);
    const { hooks, li } = mountList();
    const done = vi.fn();
    hooks.onLeave(li(1), done);
    expect(li(1).dataset.leaving).toBe('1');
    expect(li(1).style.position).toBe('absolute'); // so the other cards can start closing the gap
    expect(done).not.toHaveBeenCalled();
    jump(1);
    expect(done).toHaveBeenCalledOnce();
  });
});

describe('useListMotion: the cards that stay', () => {
  it('are measured before the list changes and glided afterwards', async () => {
    stubMotion(false);
    const order = [];
    vi.spyOn(Flip, 'getState').mockImplementation(() => (order.push('measure'), 'STATE'));
    const from = vi.spyOn(Flip, 'from').mockImplementation(() => order.push('glide'));
    const { wrapper, ids } = mountList(3);

    ids.value = ['c2', 'c0', 'c1']; // re-sorted
    await nextTick();
    await nextTick();

    expect(order).toEqual(['measure', 'glide']);
    expect(from.mock.calls[0][0]).toBe('STATE');
    expect(from.mock.calls[0][1].targets).toHaveLength(3);
    wrapper.unmount();
  });

  it('do not glide a card that is on its way out', async () => {
    stubMotion(false);
    vi.spyOn(Flip, 'getState').mockReturnValue('STATE');
    const from = vi.spyOn(Flip, 'from').mockImplementation(() => {});
    const { wrapper, ids, li } = mountList(3);
    li(1).dataset.leaving = '1'; // as onLeave marks a card that is still fading out (it stays in the DOM meanwhile)
    ids.value = ['c2', 'c1', 'c0'];
    await nextTick();
    await nextTick();
    const targets = from.mock.calls[0][1].targets;
    expect(targets.map((el) => el.dataset.id)).toEqual(['c2', 'c0']);
    wrapper.unmount();
  });

  it('stay put when motion is off', async () => {
    const getState = vi.spyOn(Flip, 'getState');
    const from = vi.spyOn(Flip, 'from');
    const { wrapper, ids } = mountList(3);
    ids.value = ['c2', 'c1', 'c0'];
    await nextTick();
    await nextTick();
    expect(getState).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

/** A page with a few data-enter blocks and a data-kenburns photo. */
function mountPage() {
  let entrance;
  const show = ref(true);
  const wrapper = mount(
    defineComponent({
      setup() {
        const root = ref(null);
        entrance = useEntrance(root);
        return () =>
          h('div', { ref: root }, [
            h('h1', { 'data-enter': '' }, 'Title'),
            h('p', { 'data-enter': '' }, 'Body'),
            show.value ? h('img', { 'data-kenburns': '', alt: '' }) : null,
          ]);
      },
    }),
    { attachTo: document.body }
  );
  return { wrapper, play: entrance.play, show, title: () => wrapper.get('h1').element, body: () => wrapper.get('p').element };
}

describe('useEntrance', () => {
  it('leaves the page alone when motion is off', async () => {
    const { title, body } = mountPage();
    await nextTick();
    await nextTick();
    expect(title().style.visibility).toBe('');
    expect(body().hasAttribute('data-entered')).toBe(false);
  });

  it('hides the blocks, then brings them in one after another and cleans up', async () => {
    stubMotion(false);
    const { title, body } = mountPage();
    await nextTick();
    await nextTick();
    expect(title().hasAttribute('data-entered')).toBe(true);
    expect(title().style.visibility).toBe('hidden'); // waiting its turn
    jump(3);
    expect(title().getAttribute('style') ?? '').not.toMatch(/opacity|visibility|transform/);
    expect(body().getAttribute('style') ?? '').not.toMatch(/opacity|visibility|transform/);
  });

  it('plays only what is new when called again after data arrives', async () => {
    stubMotion(false);
    const { wrapper, play, show } = mountPage();
    await nextTick();
    await nextTick();
    jump(3);
    const to = vi.spyOn(gsap, 'from');
    play(); // nothing new: no tweens
    expect(to).not.toHaveBeenCalled();

    show.value = false;
    await nextTick();
    show.value = true; // a fresh photo appears (e.g. after the listing loads)
    await nextTick();
    play();
    expect(wrapper.get('img').element.hasAttribute('data-entered')).toBe(true);
  });

  it('puts everything back the way it was when the page is left', async () => {
    stubMotion(false);
    const { wrapper, title } = mountPage();
    await nextTick();
    await nextTick();
    wrapper.unmount();
    expect(title().getAttribute('style') ?? '').not.toMatch(/opacity|visibility|transform/);
  });
});
