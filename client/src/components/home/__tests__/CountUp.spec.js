/* Component tests for CountUp.vue: the number on the home page that counts up once it scrolls into view. */
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import CountUp from '../CountUp.vue';

const digits = (w) => w.find('[aria-hidden="true"]').text();
// Mount, then wait one tick: the number is set in onMounted and the DOM updates afterwards.
async function show(props) {
  const w = mount(CountUp, { props });
  await nextTick();
  return w;
}

afterEach(() => vi.unstubAllGlobals());

// A stand-in for the browser's IntersectionObserver that reports "on screen" straight away.
function stubVisibleOnScreen() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        this.cb([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
  );
}

describe('CountUp', () => {
  it('formats the number with thousands separators', async () => {
    expect(digits(await show({ value: 790000 }))).toBe('790,000');
  });

  it('carries the real value for tests and assistive technology while the digits animate', async () => {
    const w = await show({ value: 790000 });
    expect(w.find('span[data-value]').attributes('data-value')).toBe('790000');
    expect(w.find('.visually-hidden').text()).toBe('790,000');
  });

  it('shows the final number straight away when the browser cannot observe scrolling', async () => {
    // jsdom has no IntersectionObserver, like very old browsers
    expect(digits(await show({ value: 1234 }))).toBe('1,234');
  });

  it('jumps to the final number when the visitor prefers reduced motion', async () => {
    stubVisibleOnScreen();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(digits(await show({ value: 5000 }))).toBe('5,000');
  });

  it('starts from zero and counts up when motion is allowed', async () => {
    stubVisibleOnScreen();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.useFakeTimers();
    const w = await show({ value: 5000, duration: 1000 });
    expect(Number(digits(w).replace(/,/g, ''))).toBeLessThan(5000);
    await vi.advanceTimersByTimeAsync(1500);
    expect(digits(w)).toBe('5,000');
    vi.useRealTimers();
  });
});
