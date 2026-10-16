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
  await page.screenshot({ path: testInfo.outputPath('impact-desktop.png'), fullPage: true });
  await page.getByLabel('From', { exact: true }).fill('2099-01-01');
  await page.getByRole('button', { name: 'Apply dates' }).click();
  await expect(page.getByTestId('collectedKg').first()).toHaveText('0');
  await expect(page.getByText('No completed collections in this period yet.').first()).toBeVisible();
  await page.getByRole('button', { name: 'All time' }).click();
  await expect(page.getByTestId('collectedKg').first()).not.toHaveText('0');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('impact-mobile.png'), fullPage: true });
});

test('recipient reserves, bakery confirms collection, and history updates impact', async ({ page, browser }) => {
  await login(page, 'sunrise');
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
    await page.goto('/orders');
    await page.getByLabel('Reservation code').fill(code);
    await page.getByRole('button', { name: 'Find order' }).click();
    await expect(page.getByTestId('lookup-result')).toContainText(name);
    await page.getByRole('button', { name: 'Confirm collection' }).click();
    await expect(page.getByTestId('lookup-result')).toContainText('collected');
    await charity.reload();
    await expect(recipientRow).toContainText('collected');
    await expect(recipientRow.getByRole('button', { name: 'Cancel reservation' })).toHaveCount(0);
    const after = await (await charity.request.get('/api/impact')).json();
    expect(after.mine.collectedKg - before.mine.collectedKg).toBeCloseTo(0.5);
    expect(after.platform.collectedKg - before.platform.collectedKg).toBeCloseTo(0.5);
    await charity.goto('/impact');
    await expect(charity.getByRole('heading', { name: 'Your charity’s collections' })).toBeVisible();
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
