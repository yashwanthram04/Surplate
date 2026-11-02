import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { test, expect } from './test.js';
const photo = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/croissant.png'));
async function login(page, name) {
  const response = await page.request.post('/api/auth/login', { data: { email: `${name}@demo.surplate.sg`, password: 'demo1234' } });
  expect(response.ok()).toBe(true);
}

test('dashboard shows personal, bakery, charity and platform impact and filters dates', async ({ page }, testInfo) => {
  await login(page, 'sunrise');
  await page.goto('/impact');
  await expect(page.getByRole('heading', { name: 'Your bakery’s donations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Together on Surplate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Impact by bakery' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Food collected by charities' })).toBeVisible();
  await expect(page.getByTestId('collectedKg').first()).not.toHaveText('0');
  await page.locator('.impact-note').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.impact-card').evaluateAll((cards) => cards.every((card) => Number(getComputedStyle(card).opacity) === 1))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('impact-desktop.png'), fullPage: true });
  await page.getByLabel('From', { exact: true }).fill('2099-01-01');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByTestId('collectedKg').first()).toHaveText('0');
  await expect(page.getByText('No completed collections in this period yet.').first()).toBeVisible();
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByTestId('collectedKg').first()).not.toHaveText('0');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.impact-note').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.impact-card').evaluateAll((cards) => cards.every((card) => Number(getComputedStyle(card).opacity) === 1))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('impact-mobile.png'), fullPage: true });
});

test('recipient reserves, bakery confirms collection, and history updates impact', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'sunrise');
  const bakeryBefore = await (await page.request.get('/api/impact')).json();
  const now = Date.now();
  const name = `Dashboard rescue ${now}`;
  const created = await page.request.post('/api/listings', { multipart: {
    itemName: name, quantity: '3', weightGramsPerUnit: '250',
    pickupStart: new Date(now - 60000).toISOString(), pickupEnd: new Date(now + 3600000).toISOString(), bestBefore: new Date(now + 7200000).toISOString(),
    address: '56 ENG HOON STREET', lat: '1.2851', lng: '103.8317',
    photo: { name: 'food.png', mimeType: 'image/png', buffer: photo },
  } });
  expect(created.status()).toBe(201);
  const listing = await created.json();
  const charityContext = await browser.newContext();
  const charity = await charityContext.newPage();
  await charity.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  charity.on('pageerror', (e) => errors.push(e.message));
  try {
    await login(charity, 'hope');
    const before = await (await charity.request.get('/api/impact')).json();
    await charity.goto(`/listings/${listing.id}/reserve`);
    await charity.getByLabel('Quantity to reserve').fill('2');
    await charity.getByRole('button', { name: 'Confirm reservation' }).click();
    await expect(charity).toHaveURL(/\/reservations(\?|$)/);
    const recipientRow = charity.getByTestId('reservation-row').filter({ hasText: name });
    await expect(recipientRow).toContainText('reserved');
    await expect(recipientRow).toContainText('0.50 kg');
    const code = await recipientRow.getByTestId('reservation-code').innerText();
    await charity.goto('/impact');
    const format = (value) => new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 }).format(value);
    for (const metric of ['collectedKg', 'estimatedMeals', 'collections']) {
      await expect(charity.getByTestId(metric)).toHaveText([before.mine, before.platform].map((totals) => format(totals[metric])));
    }
    await page.goto('/orders');
    await page.getByLabel('Reservation code').fill(code);
    await page.getByRole('button', { name: 'Find order' }).click();
    await expect(page.getByTestId('lookup-result')).toContainText(name);
    await page.getByRole('button', { name: 'Confirm collection' }).click();
    await expect(page.getByTestId('lookup-result')).toContainText('collected');
    await charity.goto('/reservations');
    await expect(recipientRow).toContainText('collected');
    await expect(recipientRow.getByRole('button', { name: 'Cancel reservation' })).toHaveCount(0);
    const after = await (await charity.request.get('/api/impact')).json();
    expect(after.mine.collectedKg - before.mine.collectedKg).toBeCloseTo(0.5);
    expect(after.platform.collectedKg - before.platform.collectedKg).toBeCloseTo(0.5);
    await charity.goto('/impact');
    await expect(charity.getByRole('heading', { name: 'Your charity’s collections' })).toBeVisible();
    await page.goto('/impact');
    for (const [metric, increase] of Object.entries({ collectedKg: 0.5, estimatedMeals: 1, collections: 1 })) {
      await expect(charity.getByTestId(metric)).toHaveText([before.mine, before.platform].map((totals) => format(totals[metric] + increase)));
      await expect(page.getByTestId(metric)).toHaveText([bakeryBefore.mine, bakeryBefore.platform].map((totals) => format(totals[metric] + increase)));
    }
    expect(errors).toEqual([]);
  } finally {
    await page.request.delete(`/api/listings/${listing.id}`);
    await charityContext.close();
  }
});

test('recipient cancellation restores stock and history retains cancelled status', async ({ page }) => {
  await login(page, 'alex');
  const board = await (await page.request.get('/api/listings')).json();
  const listing = board.items.find((l) => l.itemName === 'Assorted croissants');
  const initial = listing.quantityRemaining;
  await page.goto(`/listings/${listing.id}/reserve`);
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page).toHaveURL(/\/reservations(\?|$)/);
  const row = page.getByTestId('reservation-row').filter({ hasText: listing.itemName }).first();
  await row.getByRole('button', { name: 'Cancel reservation' }).click();
  await expect(row).toContainText('cancelled');
  const updated = await (await page.request.get(`/api/listings/${listing.id}`)).json();
  expect(updated.quantityRemaining).toBe(initial);
});

test('dashboard handles an API failure and can retry', async ({ page }) => {
  await login(page, 'alex');
  await page.route('**/api/impact', (route) => route.fulfill({ status: 503, json: { error: 'Impact temporarily unavailable.' } }));
  await page.goto('/impact');
  await expect(page.getByRole('alert')).toContainText('Impact temporarily unavailable.');
  await page.unroute('**/api/impact');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('heading', { name: 'Your collections' })).toBeVisible();
});

test('dashboard requires login', async ({ page }) => {
  await page.goto('/impact');
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('charts react to scope, metrics, date presets and refreshed API responses', async ({ page }) => {
  await page.clock.install();
  await login(page, 'alex');
  await page.goto('/impact');
  await expect(page.getByRole('heading', { name: 'Impact over time' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who we reach' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Community pulse' })).toBeVisible();
  await page.getByRole('button', { name: 'Your impact', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Your impact', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Trend metric').selectOption('collections');
  await expect(page.locator('.chart-total').first()).toHaveText(String((await (await page.request.get('/api/impact')).json()).mine.collections));
  await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await expect(page.getByText('Daily totals', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'All time', exact: true }).click();
  await expect(page.getByText('Monthly totals', { exact: false })).toBeVisible();
  let refreshes = 0;
  await page.route('**/api/impact', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.mine.collections += 3 * ++refreshes;
    await route.fulfill({ response, json });
  });
  const before = (await (await page.request.get('/api/impact')).json()).mine.collections;
  await page.getByRole('button', { name: 'Refresh impact', exact: true }).click();
  await expect(page.getByTestId('collections').first()).toHaveText(String(before + 3));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByTestId('collections').first()).toHaveText(String(before + 3));
  await page.clock.fastForward(60000);
  await expect(page.getByTestId('collections').first()).toHaveText(String(before + 6));
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('charts wait for scrolling, reveal once, and stay visible with reduced motion', async ({ page }) => {
  await login(page, 'alex');
  await page.route('**/api/impact', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.trend.platform = [
      { date: '2026-01', collectedKg: 1, estimatedMeals: 2, collections: 1 },
      { date: '2026-02', collectedKg: 2, estimatedMeals: 4, collections: 2 },
    ];
    await route.fulfill({ response, json });
  });
  await page.goto('/impact');
  await expect(page.locator('.impact-dashboard')).toHaveAttribute('aria-busy', 'false');
  const trend = page.locator('.trend-panel');
  const path = trend.locator('.trend-line');
  await expect(trend).toHaveCSS('opacity', '0');
  await expect.poll(() => path.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset))).toBeGreaterThan(0);
  await trend.scrollIntoViewIfNeeded();
  await expect(trend).toHaveCSS('opacity', '1');
  await expect.poll(() => path.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset))).toBe(0);

  const food = page.locator('.impact-card').filter({ has: page.getByRole('heading', { name: 'Most rescued foods' }) });
  await expect(food).toHaveCSS('opacity', '0');
  await food.scrollIntoViewIfNeeded();
  await expect(food).toHaveCSS('opacity', '1');
  await expect(food.locator('.chart-fill').first()).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(food).toHaveCSS('opacity', '1');

  await page.getByRole('link', { name: 'Browse food', exact: true }).click();
  await expect(page).toHaveURL(/\/browse$/);
  await page.getByRole('link', { name: 'Impact dashboard', exact: true }).click();
  await expect(page.locator('.impact-dashboard')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.trend-panel')).toHaveCSS('opacity', '0');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.locator('.impact-card').evaluateAll((cards) => cards.every((card) => Number(getComputedStyle(card).opacity) === 1))).toBe(true);
  await page.getByRole('link', { name: 'Browse food', exact: true }).click();
  await page.getByRole('link', { name: 'Impact dashboard', exact: true }).click();
  await expect(page.locator('.impact-dashboard')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(() => page.locator('.impact-card').evaluateAll((cards) => cards.every((card) => Number(getComputedStyle(card).opacity) === 1))).toBe(true);
});
