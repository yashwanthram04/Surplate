import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './test.js';

const PHOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'croissant.png');
const card = (page, name) => page.getByTestId('listing-card').filter({ hasText: name });

// Seeded: "Sourdough loaves" (Sunrise), "Chocolate muffins" (Crumb) and "Curry puffs" (Golden Loaf) are
// shared with charities only; "Assorted croissants" and "Pandan buns" are shared with everyone.
const HIDDEN = ['Sourdough loaves', 'Chocolate muffins', 'Curry puffs'];
const SHARED = ['Assorted croissants', 'Pandan buns'];

async function logIn(page, email, password = 'demo1234') {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/auth/login')), page.getByTestId('login-submit').click()]);
}
async function mockGeocode(page) {
  await page.route('**/api/geocode*', (route) =>
    route.fulfill({ json: { results: [{ address: '56 ENG HOON STREET SINGAPORE 160056', postal: '160056', lat: 1.2851, lng: 103.8317 }] } })
  );
}

test.describe('who sees what on the board', () => {
  test('a guest sees only what bakeries share with everyone, and is told why', async ({ page }) => {
    await page.goto('/browse');
    for (const name of SHARED) await expect(card(page, name)).toBeVisible();
    for (const name of HIDDEN) await expect(card(page, name)).toHaveCount(0);
    await expect(page.getByTestId('partial-view-note')).toContainText('Verified charities see more');
    await expect(page.getByRole('link', { name: 'Register a charity' })).toBeVisible();
  });

  test('an individual sees the same as a guest', async ({ page }) => {
    await logIn(page, 'alex@demo.surplate.sg');
    await page.goto('/browse');
    for (const name of SHARED) await expect(card(page, name)).toBeVisible();
    for (const name of HIDDEN) await expect(card(page, name)).toHaveCount(0);
  });

  test('a verified charity sees everything, with charity-only listings marked', async ({ page }) => {
    await logIn(page, 'hope@demo.surplate.sg');
    await page.goto('/browse');
    for (const name of [...SHARED, ...HIDDEN]) await expect(card(page, name)).toBeVisible();
    await expect(card(page, 'Curry puffs').getByTestId('charities-only')).toBeVisible();
    await expect(card(page, 'Pandan buns').getByTestId('charities-only')).toHaveCount(0);
    await expect(page.getByTestId('partial-view-note')).toHaveCount(0);
  });

  test('a charity still waiting for verification only sees the shared listings', async ({ page }) => {
    await logIn(page, 'newhope@demo.surplate.sg');
    await page.goto('/browse');
    await expect(card(page, 'Pandan buns')).toBeVisible();
    await expect(card(page, 'Curry puffs')).toHaveCount(0);
    await expect(page.getByTestId('partial-view-note')).toContainText('awaiting verification');
  });

  test('opening a charity-only listing by its link shows "no longer available" to everyone else', async ({ page, browser }) => {
    // find its id as a verified charity
    await logIn(page, 'hope@demo.surplate.sg');
    await page.goto('/browse');
    await card(page, 'Curry puffs').getByRole('link', { name: 'Curry puffs' }).click();
    await expect(page.getByTestId('listing-title')).toHaveText('Curry puffs'); // wait for the detail page
    await expect(page.getByTestId('charities-only')).toBeVisible();
    const url = page.url();

    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(url);
    await expect(guestPage.getByTestId('not-found')).toBeVisible();
    await guest.close();
  });

  test('the home page numbers shrink or grow with what the visitor may see', async ({ page, browser }) => {
    const count = async (p) => Number(await p.getByTestId('stat-listings').getAttribute('data-value'));
    await page.goto('/');
    const asGuest = await count(page);

    const other = await browser.newContext();
    const charityPage = await other.newPage();
    await logIn(charityPage, 'hope@demo.surplate.sg');
    await charityPage.goto('/');
    expect(await count(charityPage)).toBeGreaterThan(asGuest);
    await other.close();
  });

  test('a guest who clicks Reserve is sent to log in and lands on the reservation page afterwards', async ({ page }) => {
    await page.goto('/browse');
    await card(page, 'Assorted croissants').getByRole('link', { name: 'Assorted croissants' }).click();
    await page.getByTestId('reserve-btn').click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel('Email').fill('alex@demo.surplate.sg');
    await page.getByLabel('Password', { exact: true }).fill('demo1234');
    await page.getByTestId('login-submit').click();
    await expect(page.getByRole('heading', { name: 'Reserve food' })).toBeVisible();
  });
});

test.describe('a bakery choosing who sees a listing', () => {
  test('new listings start with charity priority and edits keep the clock', async ({ page, browser }) => {
    const name = `Priority rolls ${Date.now().toString(36)}`;
    await logIn(page, 'sunrise@demo.surplate.sg');
    await page.goto('/listings/new');
    await expect(page.getByText('New listings are reserved for verified charities')).toBeVisible();
    await page.getByLabel('What are you offering?').fill(name);
    await page.getByLabel('Quantity').fill('5');
    await page.getByLabel('Weight per unit (grams)').fill('100');
    await page.getByLabel('Photo').setInputFiles(PHOTO);
    await page.getByTestId('submit-listing').click();
    await expect(page.getByTestId('listing-title')).toHaveText(name);
    await expect(page.getByText('Charity priority', { exact: true })).toBeVisible();
    const listingUrl = page.url();
    const id = listingUrl.split('/').pop();
    const original = await (await page.request.get(`/api/listings/${id}`)).json();
    const person = await browser.newContext();
    const personPage = await person.newPage();
    await logIn(personPage, 'alex@demo.surplate.sg');
    await personPage.goto(listingUrl);
    await expect(personPage.getByTestId('not-found')).toBeVisible();
    await person.close();
    await page.getByRole('link', { name: 'Edit listing' }).click();
    await page.getByLabel('Quantity').fill('6');
    await page.getByTestId('submit-listing').click();
    await expect(page.getByTestId('flash')).toContainText('changes have been saved');
    const updated = await (await page.request.get(`/api/listings/${id}`)).json();
    expect(updated.priorityUntil).toBe(original.priorityUntil);
  });

  test('My listings marks the charity-only ones', async ({ page }) => {
    await logIn(page, 'sunrise@demo.surplate.sg');
    await page.goto('/my-listings');
    const row = (n) => page.getByTestId('my-listing').filter({ hasText: n });
    await expect(row('Sourdough loaves').getByTestId('charities-only')).toBeVisible();
    await expect(row('Assorted croissants').getByTestId('charities-only')).toHaveCount(0);
  });
});

test.describe('verification unlocks the charity view', () => {
  test('after an admin approves a new charity it sees the charity-only listings', async ({ page, request, browser }) => {
    const email = `unlock.${Date.now().toString(36)}@example.com`;
    const reg = await request.post('/api/auth/register', { data: { role: 'charity', name: 'Unlock Charity', email, password: 'Passw0rdOK', registrationNo: 'UNLOCK-001' } });
    expect(reg.status()).toBe(201);
    const { user } = await reg.json();

    await logIn(page, email, 'Passw0rdOK');
    await page.goto('/browse');
    await expect(card(page, 'Pandan buns')).toBeVisible();
    await expect(card(page, 'Curry puffs')).toHaveCount(0);

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await logIn(adminPage, 'admin@demo.surplate.sg');
    const res = await adminPage.request.post(`/api/admin/charities/${user.id}/decision`, { data: { decision: 'approve' } });
    expect(res.ok()).toBe(true);
    await adminCtx.close();

    await page.reload(); // the account details are fetched again on a fresh page load
    await expect(card(page, 'Curry puffs')).toBeVisible();
    await expect(page.getByTestId('partial-view-note')).toHaveCount(0);
  });
});
