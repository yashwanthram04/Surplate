import { expect, test } from './test.js';

/** Scrolls down in steps until check() is true (the scenes are scroll-driven, so state only changes as you scroll). */
async function scrollUntil(page, check, { step = 350, max = 90 } = {}) {
  for (let i = 0; i < max; i++) {
    if (await check()) return true;
    await page.evaluate((px) => window.scrollBy(0, px), step);
    await page.waitForTimeout(110);
  }
  return check();
}

/** Waits until the page's motion is set up and its height has stopped changing (fonts and live data land after load and re-measure the scenes). */
async function settled(page) {
  await expect.poll(() => page.locator('[data-hero-title] .split-char').count()).toBeGreaterThan(20);
  await page.waitForLoadState('networkidle');
  let last = 0;
  let steady = 0;
  await expect
    .poll(async () => {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      steady = h === last ? steady + 1 : 0;
      last = h;
      return steady;
    }, { intervals: [200] })
    .toBeGreaterThanOrEqual(4);
}

test.describe('home page', () => {
  test('explains the app and offers the two sign-up paths', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText("Good food shouldn't end up in the bin");
    await expect(page.getByTestId('cta-bakery')).toHaveAttribute('href', '/register?role=bakery');
    await expect(page.getByTestId('cta-individual')).toHaveAttribute('href', '/register?role=individual');

    // the three audiences, each with its own register link
    for (const [key, role] of [['bakery', 'bakery'], ['charity', 'charity'], ['individual', 'individual']]) {
      const card = page.getByTestId(`audience-${key}`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole('link')).toHaveAttribute('href', `/register?role=${role}`);
    }
  });

  test('shows live numbers from the API and the cited problem statistic', async ({ page }) => {
    const stats = await (await page.request.get('/api/stats')).json();
    await page.goto('/');

    await expect(page.getByTestId('stat-items')).toHaveAttribute('data-value', String(stats.items));
    await expect(page.getByTestId('stat-listings')).toHaveAttribute('data-value', String(stats.listings));
    await expect(page.getByTestId('stat-bakeries')).toHaveAttribute('data-value', String(stats.bakeries));

    const digits = page.getByTestId('waste-number').locator('[aria-hidden="true"]');
    // the number is tied to your scroll: it starts at 0 and must land exactly on the real figure
    await expect(digits).toHaveText('0');
    expect(await scrollUntil(page, async () => (await digits.textContent()) === '790,000')).toBe(true);
    await expect(page.getByRole('link', { name: /Waste statistics and overall recycling rate/ })).toHaveAttribute('href', /nea\.gov\.sg/);
  });

  test('previews the newest listings and links on to the board', async ({ page }) => {
    await page.goto('/');
    const latest = page.getByTestId('latest-listings');
    await latest.scrollIntoViewIfNeeded();
    await expect(latest.getByTestId('listing-card')).toHaveCount(3);

    await page.getByTestId('cta-browse').click();
    await expect(page).toHaveURL(/\/browse$/);
    await expect(page.getByRole('heading', { name: 'Rescue surplus food' })).toBeVisible();
  });

  test('navigation: the logo goes home and "Browse food" goes to the board', async ({ page }) => {
    await page.goto('/browse');
    await page.getByRole('link', { name: 'Surplate' }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('navigation').getByRole('link', { name: 'Browse food' }).click();
    await expect(page).toHaveURL(/\/browse$/);
  });

  test('respects "reduce motion": a plain static page, nothing hidden, nothing pinned', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // the figure is already there, no counting
    await expect(page.getByTestId('waste-number').locator('[aria-hidden="true"]')).toHaveText('790,000', { timeout: 500 });
    // the three steps are plain stacked cards; the pinned scene never switches on
    await expect(page.locator('.home')).not.toHaveClass(/is-pinned-story|is-horizontal/);
    await expect(page.getByTestId('story-scene')).toBeHidden();
    await expect(page.getByText('Bakeries post leftovers').first()).toBeVisible();
    await expect(page.getByTestId('audience-bakery')).toBeVisible();
    // the headline is not split into animated characters
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.locator('[data-hero-title] .split-char').count()).toBe(0);
    // the mission statement is plain, fully readable text: not split into words, not dimmed
    const statement = page.locator('[data-statement]');
    await expect(statement).toContainText('somewhere to go');
    expect(await statement.locator('.st-word').count()).toBe(0);
    expect(Number(await statement.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  });

  test('works on a phone: no sideways scrolling and the sign-up buttons are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByTestId('cta-bakery')).toBeInViewport();
    await expect(page.getByTestId('cta-individual')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // phones keep the simple stacked layout: no pinned or sideways-scrolling scenes
    await expect(page.locator('.home')).not.toHaveClass(/is-pinned-story|is-horizontal/);
  });
});

test.describe('scroll-driven scenes (desktop)', () => {
  test('the pinned "how it works" scene steps through post, find and collect as you scroll', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home')).toHaveClass(/is-pinned-story/);
    const scene = page.getByTestId('story-scene');
    const step = () => scene.getAttribute('data-active-step');

    // scroll to the scene; it is pinned, so its position on screen stays put while the page scrolls
    expect(await scrollUntil(page, async () => (await scene.boundingBox())?.y < 200)).toBe(true);
    await expect(scene).toBeVisible();
    expect(await step()).toBe('1');
    const pinnedAt = (await scene.boundingBox()).y;

    expect(await scrollUntil(page, async () => (await step()) === '2')).toBe(true);
    expect(Math.abs((await scene.boundingBox()).y - pinnedAt)).toBeLessThan(2); // still pinned
    await expect(page.locator('.scene-step.is-active')).toContainText('People find food nearby');

    expect(await scrollUntil(page, async () => (await step()) === '3')).toBe(true);
    await expect(page.locator('.scene-step.is-active')).toContainText('Collect before the timer ends');
  });

  test('the audience cards slide sideways while the section is pinned', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.home')).toHaveClass(/is-horizontal/);
    const last = page.getByTestId('audience-individual');
    const right = async () => (await last.boundingBox()).x + (await last.boundingBox()).width;
    // the third card starts off the right-hand edge of the screen
    expect(await scrollUntil(page, async () => (await page.getByTestId('audience-bakery').boundingBox()).y < 400)).toBe(true);
    expect(await right()).toBeGreaterThan(1280);
    // ...and scrolling down brings it into view without the page moving sideways
    expect(await scrollUntil(page, async () => (await right()) <= 1280, { max: 140 })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the scroll progress bar fills as you scroll the page', async ({ page }) => {
    await page.goto('/');
    await settled(page); // a jump to mid-page is only meaningful once late fonts and live data have stopped moving the layout
    const scale = () => page.locator('.scroll-progress').evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
    expect(await scale()).toBeLessThan(0.05);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await expect.poll(scale, { timeout: 15_000 }).toBeGreaterThan(0.3);
  });

  test('the mission statement lights up word by word as you scroll through it, and stays readable', async ({ page }) => {
    await page.goto('/');
    const words = page.locator('[data-statement] .st-word');
    await expect.poll(() => words.count()).toBeGreaterThan(15);
    const lit = async () => (await words.evaluateAll((ws) => ws.map((w) => Number(getComputedStyle(w).opacity)))).filter((o) => o > 0.9).length;
    const total = await words.count();

    expect(await lit()).toBe(0); // still dimmed before you reach it
    expect(await scrollUntil(page, async () => (await lit()) > 0)).toBe(true); // lights up from the first word...
    expect(await lit()).toBeLessThan(total); // ...but not all at once
    expect(await scrollUntil(page, async () => (await lit()) === total)).toBe(true); // and finally every word
    // the words are still real text for screen readers (not hidden behind an aria-label)
    await expect(page.locator('[data-statement]')).toHaveText(/Every evening, good food is left on the counter\. Surplate gives it somewhere to go/);
    expect(await words.evaluateAll((ws) => ws.filter((w) => w.closest('[aria-hidden="true"]')).length)).toBe(0);
  });

  test('the headline is split into characters that animate in, and the real text is still readable', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.locator('[data-hero-title] .split-char').count()).toBeGreaterThan(20);
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(/Good food shouldn't end up in the bin/);
  });
});
