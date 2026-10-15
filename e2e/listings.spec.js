import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './test.js';

const PHOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'croissant.png');

// Seeded demo accounts (server/src/seed.js); every one uses the password below.
const EMAILS = {
  sunrise: 'sunrise@demo.surplate.sg',
  crumb: 'crumb@demo.surplate.sg',
  charity: 'hope@demo.surplate.sg',
};

/** Log in as a seeded demo account. The login cookie lands in the browser context, so call before page.goto. */
async function actAs(page, who) {
  const res = await page.request.post('/api/auth/login', { data: { email: EMAILS[who], password: 'demo1234' } });
  expect(res.ok(), `login as ${who}`).toBe(true);
}

// OneMap is a live third-party API; tests mock our proxy endpoint so they stay fast and stable.
// (The real lookup is exercised in the API tests and by hand.)
async function mockGeocode(page) {
  await page.route('**/api/geocode*', (route) =>
    route.fulfill({
      json: {
        results: [
          { address: '56 ENG HOON STREET SINGAPORE 160056', postal: '160056', lat: 1.2851, lng: 103.8317 },
          { address: '57 ENG HOON STREET SINGAPORE 160057', postal: '160057', lat: 1.2853, lng: 103.8319 },
        ],
      },
    })
  );
}

const unique = (name) => `${name} ${Date.now().toString(36)}`;
const card = (page, name) => page.getByTestId('listing-card').filter({ hasText: name });

async function postListing(page, name, { quantity = '6', tags = ['vegan'], allergens = ['gluten'] } = {}) {
  await mockGeocode(page);
  await page.goto('/listings/new');
  await page.getByLabel('What are you offering?').fill(name);
  await page.getByLabel('Description').fill('Baked this afternoon.');
  await page.getByLabel('Quantity').fill(quantity);
  await page.getByLabel('Weight per unit (grams)').fill('100');
  for (const t of tags) await page.locator(`label[for="diet-${t}"]`).click();
  for (const a of allergens) await page.locator(`label[for="allergen-${a}"]`).click();
  await page.getByLabel('Photo').setInputFiles(PHOTO);
  await page.getByLabel('Pickup address').fill('eng hoon');
  await page.getByRole('option', { name: /56 ENG HOON/ }).click();
  await page.getByTestId('submit-listing').click();
}

test.describe('browsing the board', () => {
  // Verified charities see every listing, which is what these board tests need (visibility.spec.js covers the other visitors).
  test.beforeEach(async ({ page }) => actAs(page, 'charity'));

  test('shows open listings with a map, and hides ended ones', async ({ page }) => {
    await page.goto('/browse');
    await expect(page.getByRole('heading', { name: 'Rescue surplus food' })).toBeVisible();
    await expect(card(page, 'Assorted croissants')).toBeVisible();
    await expect(card(page, 'Pandan buns')).toBeVisible();
    await expect(card(page, 'Kaya toast sets')).toHaveCount(0); // pickup window already closed
    await expect(page.getByTestId('listing-map')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
    // each card carries a countdown ring
    await expect(card(page, 'Assorted croissants').locator('svg.countdown-ring')).toHaveAttribute('data-phase', 'open');
    await expect(card(page, 'Chocolate muffins').locator('svg.countdown-ring')).toHaveAttribute('data-phase', 'upcoming');
  });

  test('filters update the results without reloading the page', async ({ page }) => {
    await page.goto('/browse');
    await expect(card(page, 'Pandan buns')).toBeVisible();
    await page.evaluate(() => (window.__sameDocument = true)); // wiped by a full page reload

    const count = page.getByTestId('result-count');
    await page.locator('label[for="f-diet-vegan"]').click();
    await expect(card(page, 'Sourdough loaves')).toBeVisible();
    await expect(card(page, 'Pandan buns')).toHaveCount(0);
    await expect(count).toContainText('2 listings');

    await page.getByRole('button', { name: /Clear all filters/ }).click();
    await page.getByLabel('Search', { exact: true }).fill('pandan');
    await expect(page.getByTestId('listing-card')).toHaveCount(1);
    await expect(card(page, 'Pandan buns')).toBeVisible();

    await page.getByLabel('Search', { exact: true }).fill('zzzz-nothing');
    await expect(page.getByTestId('empty-state')).toBeVisible();

    await page.getByRole('button', { name: /Clear all filters/ }).click();
    await page.locator('label[for="f-soon"]').click(); // "Ending soon" switch
    await expect(card(page, 'Curry puffs')).toBeVisible();
    await expect(card(page, 'Sourdough loaves')).toHaveCount(0);

    await page.getByRole('button', { name: /Clear all filters/ }).click();
    await page.locator('summary', { hasText: 'Avoid allergens' }).click();
    await page.locator('label[for="f-avoid-nuts"]').click();
    await expect(card(page, 'Vegan banana bread')).toHaveCount(0);
    await expect(card(page, 'Pandan buns')).toBeVisible();

    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  });

  test('filters by distance from a searched address, nearest first', async ({ page }) => {
    await mockGeocode(page);
    await page.goto('/browse');
    await page.getByLabel('Near').fill('eng hoon');
    await page.getByRole('option', { name: /56 ENG HOON/ }).click(); // Tiong Bahru: only Sunrise Bakery is within 2 km
    await page.getByLabel('within').selectOption('2');
    await expect(card(page, 'Assorted croissants')).toBeVisible();
    await expect(card(page, 'Pandan buns')).toHaveCount(0); // Tampines, ~15 km away
    await expect(card(page, 'Assorted croissants')).toContainText('km away');
  });

  test('opens a listing detail page and links on to reservation', async ({ page }) => {
    await page.goto('/browse');
    await card(page, 'Sourdough loaves').getByRole('link', { name: 'Sourdough loaves' }).click();
    await expect(page.getByTestId('listing-title')).toHaveText('Sourdough loaves');
    await expect(page.getByText('Contains: gluten')).toBeVisible();
    await expect(page.getByTestId('detail-quantity')).toContainText('6 of 6');
    await expect(page.getByTestId('listing-map')).toBeVisible();
    await page.getByTestId('reserve-btn').click();
    await expect(page.getByRole('heading', { name: 'Reserve food' })).toBeVisible();
  });

  test('on a phone, the map is a separate tab', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/browse');
    await expect(card(page, 'Pandan buns')).toBeVisible();
    await expect(page.getByTestId('listing-map')).toBeHidden();
    await page.getByRole('button', { name: 'Map' }).click();
    await expect(page.getByTestId('listing-map')).toBeVisible();
    // the map was created while hidden; it must still fit all three bakeries once shown
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(3);
    for (const pin of await page.locator('.leaflet-marker-icon').all()) await expect(pin).toBeInViewport();
    await page.getByRole('button', { name: 'List' }).click();
    await expect(card(page, 'Pandan buns')).toBeVisible();
    // no horizontal scrolling on a small screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('a bakery posting and managing listings', () => {
  test.beforeEach(async ({ page }) => actAs(page, 'sunrise'));

  test('posts a listing with a photo and it shows up on the board', async ({ page }) => {
    const name = unique('Cinnamon rolls');
    await postListing(page, name);
    await expect(page.getByTestId('flash')).toContainText('live on the board');
    await expect(page.getByTestId('listing-title')).toHaveText(name);
    await expect(page.getByText('Contains: gluten')).toBeVisible();
    await expect(page.getByAltText(`Photo of ${name}`)).toBeVisible();

    await page.goto('/browse');
    await expect(card(page, name)).toBeVisible();
    await expect(card(page, name)).toContainText('Sunrise Bakery');
    await expect(card(page, name)).toContainText('vegan');
  });

  test('shows clear validation errors and does not submit an incomplete form', async ({ page }) => {
    await mockGeocode(page);
    await page.goto('/listings/new');
    await expect(page.getByLabel('Pickup address')).toHaveValue(/ENG HOON/); // pre-filled from the bakery's profile
    await page.getByLabel('Pickup address').fill('');
    await page.getByLabel('Pickup closes').fill('2020-01-01T10:00');
    await page.getByTestId('submit-listing').click();

    await expect(page).toHaveURL(/\/listings\/new$/);
    await expect(page.getByText('Item name must be 2–80 characters.')).toBeVisible();
    await expect(page.getByText('Enter a whole number from 1 to 500.')).toBeVisible();
    await expect(page.getByText('Pickup must end after it starts.')).toBeVisible();
    await expect(page.getByTestId('address-error')).toBeVisible();
    await expect(page.getByText('Add a photo of the food.')).toBeVisible();

    // an invalid address text (never picked from the results) is still rejected
    await page.getByLabel('Pickup address').fill('somewhere made up');
    await expect(page.getByTestId('address-error')).toBeVisible();
  });

  test('rejects an oversized or non-image photo', async ({ page }) => {
    await page.goto('/listings/new');
    await page.getByLabel('Photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText('Photo must be a JPEG, PNG or WebP image.')).toBeVisible();
    await page.getByLabel('Photo').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 10) });
    await expect(page.getByText('Photo must be 2 MB or smaller.')).toBeVisible();
  });

  test('edits a listing from My listings', async ({ page }) => {
    const name = unique('Edit me bagels');
    await postListing(page, name, { quantity: '4' });
    await expect(page.getByTestId('listing-title')).toHaveText(name);

    await page.getByRole('link', { name: 'My listings' }).click();
    const row = page.getByTestId('my-listing').filter({ hasText: name });
    await expect(row).toContainText('4 of 4 left');
    await row.getByRole('link', { name: 'Edit', exact: true }).click();

    await expect(page.getByLabel('What are you offering?')).toHaveValue(name);
    await page.getByLabel('Quantity').fill('9');
    await page.getByLabel('What are you offering?').fill(`${name} (updated)`);
    await page.getByTestId('submit-listing').click();

    await expect(page.getByTestId('flash')).toContainText('changes have been saved');
    await expect(page.getByTestId('listing-title')).toHaveText(`${name} (updated)`);
    await expect(page.getByTestId('detail-quantity')).toContainText('9 of 9');
    await expect(page.getByAltText(/Photo of/)).toBeVisible(); // photo kept without re-uploading
  });

  test('removes a listing after confirming, and it leaves the board', async ({ page }) => {
    const name = unique('Remove me scones');
    await postListing(page, name);
    await expect(page.getByTestId('listing-title')).toHaveText(name);

    await page.goto('/my-listings');
    const row = page.getByTestId('my-listing').filter({ hasText: name });
    await row.getByRole('button', { name: `Remove ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toBeVisible(); // cancelling keeps it

    await row.getByRole('button', { name: `Remove ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove listing' }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByTestId('flash')).toContainText('was removed');

    await page.goto('/browse');
    await expect(page.getByTestId('listing-card').first()).toBeVisible();
    await expect(card(page, name)).toHaveCount(0);
  });

  test('re-posts a past listing with fresh stock and a new pickup window', async ({ page }) => {
    await page.goto('/my-listings');
    // The seed's only listing that has already closed is "Kaya toast sets", so the tab starts on Past.
    await expect(page.getByTestId('tab-past')).toContainText('1');
    await page.getByTestId('tab-past').click();
    const row = page.getByTestId('my-listing').filter({ hasText: 'Kaya toast sets' });
    await expect(row).toContainText('Ended');
    await row.getByRole('button', { name: 'Re-post' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Quantity').fill('0');
    await dialog.getByRole('button', { name: 'Post again' }).click();
    await expect(dialog.getByText('Quantity must be a whole number from 1 to 500.')).toBeVisible();

    await dialog.getByLabel('Quantity').fill('7');
    await dialog.getByRole('button', { name: 'Post again' }).click();
    await expect(page.getByTestId('listing-title')).toHaveText('Kaya toast sets');
    await expect(page.getByTestId('detail-quantity')).toContainText('7 of 7');
    await expect(page.getByAltText('Photo of Kaya toast sets')).toBeVisible(); // photo copied over

    await page.goto('/browse');
    await expect(card(page, 'Kaya toast sets')).toBeVisible();
  });
});

test.describe('permissions', () => {
  test('a charity cannot post or manage listings', async ({ page }) => {
    await actAs(page, 'charity');
    await page.goto('/browse');
    await expect(page.getByRole('link', { name: 'Post surplus' })).toHaveCount(0);
    await page.goto('/listings/new');
    await expect(page.getByTestId('forbidden')).toBeVisible();
    await page.goto('/my-listings');
    await expect(page.getByTestId('forbidden')).toBeVisible();
  });

  test('a guest is sent to log in, and returns to the page they wanted', async ({ page }) => {
    await page.goto('/listings/new');
    await expect(page).toHaveURL(/\/login\?next=.*listings.*new/);
    await page.getByLabel('Email').fill(EMAILS.sunrise);
    await page.getByLabel('Password', { exact: true }).fill('demo1234');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/listings\/new$/);
    await expect(page.getByRole('heading', { name: 'Post surplus food' })).toBeVisible();
  });

  test("another bakery cannot edit or remove a bakery's listing", async ({ page }) => {
    await actAs(page, 'crumb');
    await page.goto('/browse');
    await card(page, 'Assorted croissants').getByRole('link', { name: 'Assorted croissants' }).click(); // Sunrise's listing
    await expect(page.getByTestId('listing-title')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit listing' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove listing' })).toHaveCount(0);

    // direct URL and direct API call are both refused
    const id = page.url().split('/').pop();
    await page.goto(`/listings/${id}/edit`);
    await expect(page.getByText('only edit listings posted by your own bakery')).toBeVisible();
    const res = await page.request.delete(`/api/listings/${id}`);
    expect(res.status()).toBe(403);
  });

  test('a removed listing shows a friendly not-found page', async ({ page }) => {
    await page.goto('/listings/64b0000000000000000fffff');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});
