import { test, expect } from './test.js';

async function login(page, name) {
  const response = await page.request.post('/api/auth/login', { data: { email: `${name}@demo.surplate.sg`, password: 'demo1234' } });
  expect(response.ok()).toBe(true);
}
const pandanBuns = async (page) => (await (await page.request.get('/api/listings')).json()).items.find((l) => l.itemName === 'Pandan buns');

test('a recipient picks a slot, gets a code and changes the reservation; the bakery sees it as an open order', async ({ page, browser }) => {
  await login(page, 'alex');
  const listing = await pandanBuns(page);
  await page.goto(`/listings/${listing.id}/reserve`);
  await page.getByLabel('Quantity to reserve').fill('999');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByText(/You can reserve at most \d+/)).toBeVisible();
  await page.getByLabel('Quantity to reserve').fill('2');
  const slots = page.getByLabel('Collection slot');
  await expect(slots.locator('option:not([disabled])').first()).toContainText('(now)');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByTestId('reserved-banner')).toContainText('Your code is');

  // A reservation in the slot that is under way can still be changed.
  const row = page.getByTestId('reservation-row').filter({ hasText: 'Pandan buns' }).first();
  await expect(row.getByRole('button', { name: 'Change' })).toBeVisible();
  await row.getByRole('button', { name: 'Cancel reservation' }).click();
  await expect(row).toContainText('cancelled');

  await page.goto(`/listings/${listing.id}/reserve`);
  await page.getByLabel('Collection slot').selectOption({ index: 2 }); // a later slot
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  const later = page.getByTestId('reservation-row').filter({ hasText: 'Pandan buns' }).first();
  await later.getByRole('button', { name: 'Change' }).click();
  await later.getByLabel('Quantity to reserve').fill('3');
  await later.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Reservation updated.')).toBeVisible();
  await expect(later).toContainText('3 units');

  // The bakery sees the open order; a no-show can only be released once its slot starts.
  const { items } = await (await page.request.get('/api/reservations/mine')).json();
  const mine = items.find((r) => r.itemName === 'Pandan buns' && r.status === 'reserved');
  const bakeryContext = await browser.newContext();
  const bakery = await bakeryContext.newPage();
  try {
    await login(bakery, 'goldenloaf');
    await bakery.goto('/orders');
    await expect(bakery.getByTestId('order-row').filter({ hasText: 'Alex Tan' })).toContainText('3 × Pandan buns');
    await expect(bakery.getByTestId('order-row').filter({ hasText: 'Alex Tan' }).getByRole('button', { name: 'Release no-show' })).toBeDisabled();
    expect((await page.request.post(`/api/reservations/${mine.id}/cancel`)).ok()).toBe(true);
  } finally {
    await bakeryContext.close();
  }
});

test('a recipient with too many missed pickups is told why they cannot reserve', async ({ page }) => {
  await login(page, 'sam');
  const listing = await pandanBuns(page);
  await page.goto(`/listings/${listing.id}/reserve`);
  await expect(page.getByTestId('reliability')).toContainText('Reliability score: 25%');
  await expect(page.getByTestId('reliability')).toContainText("can't reserve right now");
  await expect(page.getByRole('button', { name: 'Confirm reservation' })).toBeDisabled();
});

test('bakery staff see a slot reminder and confirm the seeded order by its code', async ({ page }) => {
  await login(page, 'sunrise');
  await page.goto('/orders');
  await expect(page.getByTestId('slot-reminder').first()).toContainText('to hand over');
  await page.getByLabel('Reservation code').fill('hkt-4x2');
  await page.getByRole('button', { name: 'Find order' }).click();
  await expect(page.getByTestId('lookup-result')).toContainText('Hope Kitchen');
  await expect(page.getByTestId('lookup-result')).toContainText('2 × Sourdough loaves');
});

test('the recipient sees a reminder with their code before the slot', async ({ page }) => {
  await login(page, 'hope');
  await page.goto('/browse');
  await expect(page.getByTestId('slot-reminder').first()).toContainText('HKT 4X2');
  await page.getByTestId('slot-reminder').first().getByRole('button', { name: 'Dismiss reminder' }).click();
  await expect(page.getByTestId('slot-reminder')).toHaveCount(0);
});

test('bakery staff release a no-show and find it under the No-shows filter', async ({ page, browser }) => {
  // A fresh recipient, so the missed pickup does not change a demo account's reliability.
  const email = `noshow-${Date.now()}@example.com`;
  expect((await page.request.post('/api/auth/register', { data: { name: 'No Show Tester', email, password: 'Passw0rdOK', role: 'individual' } })).ok()).toBe(true);
  const listing = (await (await page.request.get('/api/listings')).json()).items.find((l) => l.itemName === 'Assorted croissants');
  await page.goto(`/listings/${listing.id}/reserve`);
  await page.getByRole('button', { name: 'Confirm reservation' }).click(); // the default slot is under way
  await expect(page.getByTestId('reserved-banner')).toBeVisible();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  try {
    await login(staff, 'sunrise');
    await staff.goto('/orders');
    const row = staff.getByTestId('order-row').filter({ hasText: 'No Show Tester' });
    await row.getByRole('button', { name: 'Release no-show' }).click();
    await staff.getByRole('button', { name: 'Release to board' }).click();
    await expect(staff.getByText('listed under No-shows')).toBeVisible();
    await expect(row).toHaveCount(0);
    await staff.getByTestId('orders-missed').click();
    await expect(staff.getByTestId('order-row').filter({ hasText: 'No Show Tester' })).toContainText('Released by staff');
    await staff.getByTestId('orders-due').click();
    await expect(staff.getByTestId('orders-due')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await staffContext.close();
  }
  await page.goto('/reservations');
  await expect(page.getByTestId('reservation-row').filter({ hasText: 'Assorted croissants' }).first()).toContainText('missed');
});
