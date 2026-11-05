import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './test.js';

// E2E tests for the Community Fridge feature (map, add/edit/remove, status updates, spoiled-food alerts).

const PHOTO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'croissant.png');

// Seeded demo accounts (server/src/seed.js); every one uses the password demo1234.
const EMAILS = {
  sunrise: 'sunrise@demo.surplate.sg', // bakery
  crumb: 'crumb@demo.surplate.sg', // another bakery
  hope: 'hope@demo.surplate.sg', // verified charity
  alex: 'alex@demo.surplate.sg', // individual
  admin: 'admin@demo.surplate.sg',
};

/** Log in as a seeded account. Logging in again as someone else simply replaces the cookie. */
async function actAs(page, who) {
  const res = await page.request.post('/api/auth/login', { data: { email: EMAILS[who], password: 'demo1234' } });
  expect(res.ok(), `login as ${who}`).toBe(true);
}

// OneMap is a live third-party API; tests mock our proxy endpoint so they stay fast and stable.
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

let counter = 0;
const unique = (name) => `${name} ${Date.now().toString(36)}${counter++}`;

// The app no longer seeds demo fridges, so this file adds its own through the API: five fridges, a status
// history for each (newest last), and one open spoiled-food report on Sunrise Bakery's first Tiong Bahru drop-off.
const FRIDGES = [
  { name: 'Tiong Bahru Community Fridge', openingHours: '24 hours', owner: 'alex', address: '30 SENG POH ROAD', postal: '168898', lat: '1.2866', lng: '103.8326',
    description: 'Beside the void deck notice board. Please label home-cooked food with the date and keep the area tidy.',
    updates: [['sunrise', 'stocked', "Left 8 sourdough loaves from today's bake."], ['alex', 'low', 'Only a few items left this afternoon.'], ['sunrise', 'stocked', 'Dropped off 12 croissants and a tray of egg tarts.']] },
  { name: 'Bugis Neighbourhood Fridge', openingHours: 'Mon–Sat 9am–8pm', owner: 'hope', address: '1 BUGIS STREET', postal: '188868', lat: '1.3', lng: '103.8559',
    description: 'Under the covered walkway, next to the bus stop. Take what you need, leave what you can.',
    updates: [['hope', 'low', 'Running low on sandwiches and drinks. Donations welcome.']] },
  { name: 'Tampines Hub Fridge', openingHours: 'Daily 8am–10pm', owner: 'alex', address: '1 TAMPINES WALK OUR TAMPINES HUB', postal: '528523', lat: '1.3541', lng: '103.9406',
    description: 'Next to the community kitchen on level 1.', updates: [['alex', 'empty', 'Completely empty at lunchtime.']] },
  { name: 'Toa Payoh Lorong 4 Fridge', openingHours: '24 hours', owner: 'admin', address: '77 LORONG 4 TOA PAYOH', postal: '310077', lat: '1.3396', lng: '103.8478',
    description: 'Bakeries nearby drop bread here in the evening.', updates: [['crumb', 'stocked', 'Dropped off 15 loaves of vegan banana bread.']] },
  // No updates: shows how an unknown status looks.
  { name: 'Jurong West Community Fridge', openingHours: 'Daily 7am–9pm', owner: 'hope', address: '1 JURONG WEST CENTRAL 2', postal: '648886', lat: '1.3404', lng: '103.7068',
    description: 'Beside the market on the ground floor.', updates: [] },
];

test.beforeAll(async ({ playwright }, testInfo) => {
  const api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const ok = async (res, what) => { expect(res.ok(), what).toBe(true); return res.json(); };
  const as = async (who) => ok(await api.post('/api/auth/login', { data: { email: EMAILS[who], password: 'demo1234' } }), `login as ${who}`);
  // A failed test restarts the worker and reruns this hook against the same server, so only add them once.
  const existing = (await ok(await api.get('/api/fridges'), 'list fridges')).items.map((f) => f.name);
  if (!existing.includes(FRIDGES[0].name)) {
    let firstDrop;
    for (const { owner, updates, ...fields } of FRIDGES) {
      await as(owner);
      const { id } = await ok(await api.post('/api/fridges', { multipart: fields }), `create ${fields.name}`);
      for (const [who, status, note] of updates) {
        await as(who);
        const update = await ok(await api.post(`/api/fridges/${id}/updates`, { multipart: { status, note } }), `post ${status} at ${fields.name}`);
        firstDrop ??= { fridgeId: id, updateId: update.id };
        await new Promise((r) => setTimeout(r, 20)); // keep the history in order
      }
    }
    await as('alex');
    await ok(await api.post(`/api/fridges/${firstDrop.fridgeId}/spoiled`, { multipart: { items: 'Sourdough loaves', note: 'Two of the loaves had gone mouldy.', updateId: firstDrop.updateId } }), 'flag sourdough');
  }
  await api.dispose();
});

// Creating fridges is capped per person per day (admins are exempt), and the whole e2e run shares one database.
// So tests that do not care who owns the fridge create it as the admin; only the owner-specific tests use a normal account.

async function createFridge(page, who, name) {
  await actAs(page, who);
  const res = await page.request.post('/api/fridges', {
    multipart: { name, openingHours: '24 hours', description: 'Created by an e2e test.', address: '1 WOODLANDS SQUARE', postal: '738099', lat: '1.4370', lng: '103.7865' },
  });
  expect(res.ok(), `create fridge as ${who}: ${res.status()} ${await res.text()}`).toBe(true);
  return (await res.json()).id;
}
async function postUpdate(page, who, fridgeId, status, note = '') {
  await actAs(page, who);
  const res = await page.request.post(`/api/fridges/${fridgeId}/updates`, { multipart: { status, note } });
  expect(res.ok(), `post ${status} update as ${who}`).toBe(true);
}
async function flagSpoiled(page, who, fridgeId, items) {
  await actAs(page, who);
  const res = await page.request.post(`/api/fridges/${fridgeId}/spoiled`, { multipart: { items } });
  expect(res.ok(), `flag spoiled food as ${who}`).toBe(true);
}
async function openAlertCount(page, who) {
  await actAs(page, who);
  return (await (await page.request.get('/api/fridges/alerts/count')).json()).open;
}

const fridgeCard = (page, name) => page.getByTestId('fridge-card').filter({ hasText: name });
const pin = (page, name) => page.locator(`.leaflet-marker-icon[title^="${name}:"]`); // marker title is "<name>: <status label>"
// The big status badge in the right-hand card of a fridge page (the history list has its own badges).
const headline = (page) => page.getByTestId('fridge-title').locator('xpath=..').getByTestId('fridge-status');
const alertCard = (page, text) => page.getByTestId('alert-card').filter({ hasText: text });
async function alertsLoaded(page) {
  await expect(page.getByRole('heading', { name: 'Spoiled food alerts' })).toBeVisible();
  await expect(page.locator('.spinner-border[role="status"]')).toHaveCount(0); // the list has finished loading
}

// ======================================================================================================
test.describe('browsing the map (no login needed)', () => {
  test('lists the fridges with their latest status and last-updated time', async ({ page }) => {
    await page.goto('/fridges');
    await expect(page.getByRole('heading', { name: 'Community fridges', level: 1 })).toBeVisible();

    const tiong = fridgeCard(page, 'Tiong Bahru Community Fridge');
    await expect(tiong.getByTestId('fridge-status')).toHaveText('Stocked');
    await expect(tiong.getByTestId('last-updated')).toContainText(/Updated (just now|.+ ago)/);
    await expect(tiong).toContainText('Dropped off 12 croissants'); // the note from the newest update
    await expect(tiong.getByTestId('spoiled-pill')).toContainText('Spoiled food reported'); // beforeAll adds one open report

    await expect(fridgeCard(page, 'Bugis Neighbourhood Fridge').getByTestId('fridge-status')).toHaveText('Running low');
    await expect(fridgeCard(page, 'Tampines Hub Fridge').getByTestId('fridge-status')).toHaveText('Empty');

    const jurong = fridgeCard(page, 'Jurong West Community Fridge');
    await expect(jurong.getByTestId('fridge-status')).toHaveText('No updates yet');
    await expect(jurong.getByTestId('last-updated')).toHaveText('No updates yet');
  });

  test('shows an interactive map with one pin per fridge, coloured by status', async ({ page }) => {
    await page.goto('/fridges');
    await expect(page.getByTestId('fridge-map')).toBeVisible();
    await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached();
    await expect(pin(page, 'Tiong Bahru Community Fridge').locator('.pin.status-stocked')).toHaveCount(1);
    await expect(pin(page, 'Bugis Neighbourhood Fridge').locator('.pin.status-low')).toHaveCount(1);
    await expect(pin(page, 'Tampines Hub Fridge').locator('.pin.status-empty')).toHaveCount(1);
    await expect(pin(page, 'Jurong West Community Fridge').locator('.pin.status-unknown')).toHaveCount(1);
  });

  test('clicking a pin opens a popup with the status, and links to the fridge page', async ({ page }) => {
    await page.goto('/fridges');
    // Tampines is far from every other fridge, so its pin can't be overlapped by a neighbour's.
    await pin(page, 'Tampines Hub Fridge').click();
    const popup = page.locator('.leaflet-popup-content');
    await expect(popup).toContainText('Tampines Hub Fridge');
    await expect(popup).toContainText('Empty');
    await expect(popup).toContainText(/Updated (just now|.+ ago)/);
    await popup.getByRole('link', { name: 'See details' }).click();
    await expect(page).toHaveURL(/\/fridges\/[0-9a-f]{24}$/);
    await expect(page.getByTestId('fridge-title')).toHaveText('Tampines Hub Fridge');
  });

  test('filters by status without reloading the page', async ({ page }) => {
    await page.goto('/fridges');
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toBeVisible();
    await page.evaluate(() => (window.__sameDocument = true)); // wiped by a full page reload

    await page.locator('label[for="fr-status-low"]').click();
    await expect(fridgeCard(page, 'Bugis Neighbourhood Fridge')).toBeVisible();
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toHaveCount(0);
    await expect(fridgeCard(page, 'Tampines Hub Fridge')).toHaveCount(0);

    await page.locator('label[for="fr-status-low"]').click(); // untick "Running low"
    await page.locator('label[for="fr-status-unknown"]').click();
    await expect(fridgeCard(page, 'Jurong West Community Fridge')).toBeVisible();
    await expect(fridgeCard(page, 'Bugis Neighbourhood Fridge')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toBeVisible();
    await expect(fridgeCard(page, 'Bugis Neighbourhood Fridge')).toBeVisible();
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  });

  test('searches by name, and says so when nothing matches', async ({ page }) => {
    await page.goto('/fridges');
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toBeVisible();

    await page.getByLabel('Search', { exact: true }).fill('tampines');
    await expect(fridgeCard(page, 'Tampines Hub Fridge')).toBeVisible();
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toHaveCount(0);

    await page.getByLabel('Search', { exact: true }).fill('zzz-no-such-fridge');
    await expect(page.getByTestId('empty-state')).toContainText('No fridges match');
  });

  test('"Near" shows only fridges within the chosen distance, with how far away they are', async ({ page }) => {
    await mockGeocode(page); // 56 Eng Hoon Street is about 200 m from the Tiong Bahru fridge
    await page.goto('/fridges');
    await page.getByLabel('Near', { exact: true }).fill('eng hoon');
    await page.getByRole('option', { name: /56 ENG HOON/ }).click();

    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toContainText(/km away/);
    await expect(fridgeCard(page, 'Tampines Hub Fridge')).toHaveCount(0); // about 12 km away, outside the default 5 km
    await expect(fridgeCard(page, 'Bugis Neighbourhood Fridge')).toBeVisible(); // about 3 km away

    await page.getByLabel('within').selectOption('1');
    await expect(fridgeCard(page, 'Bugis Neighbourhood Fridge')).toHaveCount(0);
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toBeVisible();
  });

  test('on a phone, switches between the list and the map', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/fridges');
    await expect(fridgeCard(page, 'Tiong Bahru Community Fridge')).toBeVisible();
    await expect(page.getByTestId('fridge-map')).toBeHidden();

    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByTestId('fridge-map')).toBeVisible();
    await expect(page.getByTestId('fridge-card').first()).toBeHidden();

    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByTestId('fridge-card').first()).toBeVisible();
  });

  test('a fridge page shows the status, hours, address and history, but only a login prompt to a guest', async ({ page }) => {
    await page.goto('/fridges');
    await fridgeCard(page, 'Tiong Bahru Community Fridge').getByRole('link', { name: 'Tiong Bahru Community Fridge' }).click();

    await expect(page.getByTestId('fridge-title')).toHaveText('Tiong Bahru Community Fridge');
    await expect(headline(page)).toHaveText('Stocked');
    await expect(page.getByTestId('last-updated')).toContainText('Last updated');
    await expect(page.locator('dl')).toContainText('24 hours');
    await expect(page.locator('dl')).toContainText('30 SENG POH ROAD');
    await expect(page.getByTestId('fridge-map')).toBeVisible();
    await expect(page.getByTestId('spoiled-warning')).toBeVisible(); // the beforeAll report is still open

    // history, newest first (beforeAll posts three updates here)
    const items = page.getByTestId('update-item');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toContainText('Sunrise Bakery');
    await expect(items.first()).toContainText('Supplier'); // updates from bakeries are labelled
    await expect(items.first()).toContainText('Dropped off 12 croissants');

    // a guest can read everything, but posting and flagging need an account
    await expect(page.getByTestId('login-to-post')).toBeVisible();
    await expect(page.getByTestId('status-form')).toHaveCount(0);
    await expect(page.getByTestId('flag-spoiled')).toHaveCount(0);
    await expect(page.getByTestId('flag-update')).toHaveCount(0);
  });

  test('an unknown or malformed fridge link shows a friendly message', async ({ page }) => {
    for (const id of ['64b0000000000000000000ff', 'not-an-id']) {
      await page.goto(`/fridges/${id}`);
      await expect(page.getByTestId('not-found')).toContainText('no longer on the map');
    }
  });
});

// ======================================================================================================
test.describe('adding, editing and removing a fridge', () => {
  test('a guest who tries to add a fridge is sent to log in first', async ({ page }) => {
    await page.goto('/fridges');
    await page.getByTestId('add-fridge').click();
    await expect(page).toHaveURL(/\/login\?next=.*fridges.*new/); // remembers where they were going
  });

  test('the form explains what is missing instead of submitting', async ({ page }) => {
    await actAs(page, 'alex');
    await page.goto('/fridges/new');
    await page.getByTestId('submit-fridge').click();
    await expect(page.getByText(/Name must be 2.80 characters/)).toBeVisible();
    await expect(page.getByText(/Enter the opening hours/)).toBeVisible();
    await expect(page.getByTestId('address-error')).toContainText('Choose an address from the search results.');
    await expect(page).toHaveURL(/\/fridges\/new$/);
  });

  test('a user adds a fridge with hours, notes, address and photo, and it appears on the map', async ({ page }) => {
    const name = unique('E2E new fridge');
    await actAs(page, 'alex');
    await mockGeocode(page);
    await page.goto('/fridges/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Opening hours').fill('Mon-Sat 8am-9pm');
    await page.getByLabel('Notes').fill('Next to the lift on level 1.');
    await page.getByLabel('Address', { exact: true }).fill('eng hoon');
    await page.getByRole('option', { name: /56 ENG HOON/ }).click();
    await expect(page.getByTestId('fridge-map')).toBeVisible(); // preview of the chosen address
    await page.locator('#photo').setInputFiles(PHOTO);
    await expect(page.getByAltText('Preview of the chosen photo')).toBeVisible();
    await page.getByTestId('submit-fridge').click();

    await expect(page).toHaveURL(/\/fridges\/[0-9a-f]{24}\?added=1$/);
    await expect(page.getByTestId('flash')).toContainText('on the map');
    await expect(page.getByTestId('fridge-title')).toHaveText(name);
    await expect(headline(page)).toHaveText('No updates yet'); // nobody has reported on it yet
    await expect(page.getByTestId('no-updates')).toBeVisible();
    await expect(page.locator('dl')).toContainText('Mon-Sat 8am-9pm');
    await expect(page.getByAltText(`Photo of ${name}`)).toBeVisible();
    await expect(page.getByText('Next to the lift on level 1.')).toBeVisible();

    // it is now listed and pinned for everyone
    await page.goto('/fridges');
    await expect(fridgeCard(page, name).getByTestId('fridge-status')).toHaveText('No updates yet');
    await expect(pin(page, name)).toHaveCount(1);
  });

  test('the photo is optional', async ({ page }) => {
    const name = unique('E2E no photo fridge');
    await actAs(page, 'hope');
    await mockGeocode(page);
    await page.goto('/fridges/new');
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Opening hours').fill('24 hours');
    await page.getByLabel('Address', { exact: true }).fill('eng hoon');
    await page.getByRole('option', { name: /57 ENG HOON/ }).click();
    await page.getByTestId('submit-fridge').click();

    await expect(page.getByTestId('fridge-title')).toHaveText(name);
    await expect(page.getByAltText(`Photo of ${name}`)).toHaveCount(0);
  });

  test('the person who added a fridge can edit it; other users cannot, but an admin can', async ({ page }) => {
    const id = await createFridge(page, 'alex', unique('E2E edit fridge'));

    await actAs(page, 'alex');
    await page.goto(`/fridges/${id}`);
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Opening hours')).toHaveValue('24 hours'); // the form is pre-filled
    await page.getByLabel('Opening hours').fill('Mon-Fri 8am-6pm');
    await page.getByTestId('submit-fridge').click();
    await expect(page).toHaveURL(/\?updated=1$/);
    await expect(page.getByTestId('flash')).toContainText('Your changes have been saved.');
    await expect(page.locator('dl')).toContainText('Mon-Fri 8am-6pm');

    // someone else sees no Edit/Remove buttons, and the edit page refuses them
    await actAs(page, 'hope');
    await page.goto(`/fridges/${id}`);
    await expect(page.getByTestId('fridge-title')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('remove-fridge')).toHaveCount(0);
    await page.goto(`/fridges/${id}/edit`);
    await expect(page.getByText('Only the person who added this fridge, or an admin, can edit it.')).toBeVisible();

    // an admin can manage any fridge
    await actAs(page, 'admin');
    await page.goto(`/fridges/${id}`);
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByTestId('remove-fridge')).toBeVisible();
  });

  for (const { remover, owner } of [{ remover: 'alex', owner: 'alex' }, { remover: 'admin', owner: 'hope' }]) {
    test(`removing a fridge takes it off the map (${remover === owner ? 'by the person who added it' : 'by an admin, for someone else'})`, async ({ page }) => {
      const name = unique('E2E remove fridge');
      const id = await createFridge(page, owner, name);

      await actAs(page, remover);
      await page.goto(`/fridges/${id}`);
      await page.getByTestId('remove-fridge').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(name);
      await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

      await expect(page).toHaveURL(/\/fridges$/);
      await expect(page.getByTestId('result-count')).toContainText('place'); // the list has loaded
      await expect(fridgeCard(page, name)).toHaveCount(0);
      await page.goto(`/fridges/${id}`);
      await expect(page.getByTestId('not-found')).toBeVisible();
    });
  }
});

// ======================================================================================================
test.describe('posting a status update', () => {
  test('a bakery restocks with a note and photo, then someone reports it empty: status and last-updated change each time', async ({ page }) => {
    const name = unique('E2E status fridge');
    const id = await createFridge(page, 'admin', name);

    // 1. Sunrise Bakery drops off food and says so
    await actAs(page, 'sunrise');
    await page.goto(`/fridges/${id}`);
    await expect(headline(page)).toHaveText('No updates yet');
    const form = page.getByTestId('status-form');
    await form.locator('label[for="status-stocked"]').click();
    await form.getByLabel('What was dropped off?').fill('12 croissants and a tray of egg tarts');
    await form.locator('#update-photo').setInputFiles(PHOTO);
    await form.getByTestId('submit-update').click();

    await expect(page.getByTestId('flash')).toContainText('status has been updated');
    await expect(headline(page)).toHaveText('Stocked');
    await expect(page.getByTestId('last-updated')).toContainText('just now');
    await expect(page.locator('.fridge-note')).toContainText('12 croissants and a tray of egg tarts');
    const items = page.getByTestId('update-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Sunrise Bakery');
    await expect(items.first()).toContainText('Supplier');
    await expect(items.first()).toContainText('Stocked');
    await expect(items.first().getByAltText('Photo posted with this update by Sunrise Bakery')).toBeVisible();
    await expect(form.getByLabel('What was dropped off?')).toHaveValue(''); // the form is ready for the next update

    // 2. a visitor finds it empty later
    await actAs(page, 'alex');
    await page.goto(`/fridges/${id}`);
    await page.getByTestId('status-form').locator('label[for="status-empty"]').click();
    await page.getByTestId('submit-update').click();

    await expect(headline(page)).toHaveText('Empty');
    await expect(page.locator('.fridge-note')).toHaveCount(0); // the new update has no note
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Empty'); // newest first
    await expect(items.nth(1)).toContainText('Stocked');

    // 3. the map and list show the latest status
    await page.goto('/fridges');
    await expect(fridgeCard(page, name).getByTestId('fridge-status')).toHaveText('Empty');
    await expect(fridgeCard(page, name).getByTestId('last-updated')).toContainText(/Updated (just now|\d+ min ago)/);
    await expect(pin(page, name).locator('.pin.status-empty')).toHaveCount(1);
  });

  test('a status must be chosen, and a non-image photo is refused', async ({ page }) => {
    const id = await createFridge(page, 'admin', unique('E2E invalid update fridge'));
    await page.goto(`/fridges/${id}`);
    const form = page.getByTestId('status-form');

    await form.getByTestId('submit-update').click();
    await expect(form.getByText('Choose stocked, low or empty.')).toBeVisible();

    await form.locator('label[for="status-low"]').click();
    await form.locator('#update-photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
    await form.getByTestId('submit-update').click();
    await expect(form.getByText('Photo must be a JPEG, PNG or WebP image.')).toBeVisible();
    await expect(page.getByTestId('flash')).toHaveCount(0);
    await expect(page.getByTestId('update-item')).toHaveCount(0);
  });
});

// ======================================================================================================
test.describe('flagging spoiled food and notifying suppliers', () => {
  test('flagging a drop-off alerts the bakery that made it, who can resolve it', async ({ page }) => {
    const name = unique('E2E spoiled fridge');
    const item = unique('E2E mouldy loaves');
    const id = await createFridge(page, 'admin', name);
    await postUpdate(page, 'sunrise', id, 'stocked', '8 sourdough loaves');
    const before = await openAlertCount(page, 'sunrise');

    // Hope Kitchen flags that specific drop-off
    await actAs(page, 'hope');
    await page.goto(`/fridges/${id}`);
    await page.getByTestId('update-item').first().getByTestId('flag-update').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('flag-audience')).toContainText('Sunrise Bakery'); // says up front who will be told
    await expect(dialog.getByTestId('flag-audience')).toContainText('will be told');
    await dialog.getByLabel('What is spoiled?').fill(item);
    await dialog.getByLabel('Details').fill('Two loaves had gone mouldy.');
    await dialog.getByLabel('Photo').setInputFiles(PHOTO);
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('flash')).toContainText('The supplier has been notified');
    await expect(page.getByTestId('spoiled-warning')).toBeVisible();
    await page.goto('/fridges');
    await expect(fridgeCard(page, name).getByTestId('spoiled-pill')).toBeVisible();

    // Sunrise sees it, with a count in the navigation bar
    await actAs(page, 'sunrise');
    expect(await openAlertCount(page, 'sunrise')).toBe(before + 1);
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    const card = alertCard(page, item);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(name);
    await expect(card).toContainText('reported by Hope Kitchen');
    await expect(card).toContainText('Two loaves had gone mouldy.');
    await expect(card.getByAltText(`Photo of ${item}`)).toBeVisible();
    await expect(page.getByTestId('alert-count')).toHaveText(String(before + 1));

    // another bakery was not told
    await actAs(page, 'crumb');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await expect(alertCard(page, item)).toHaveCount(0);

    // Sunrise resolves it
    await actAs(page, 'sunrise');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await alertCard(page, item).getByTestId('resolve').click();
    await alertCard(page, item).getByLabel('What did you do?').fill('Collected and binned');
    await alertCard(page, item).getByTestId('confirm-resolve').click();
    await expect(alertCard(page, item)).toHaveCount(0); // gone from "Open"
    await page.getByTestId('tab-resolved').click();
    await alertsLoaded(page);
    await expect(alertCard(page, item)).toContainText('Resolved by Sunrise Bakery: Collected and binned');
    expect(await openAlertCount(page, 'sunrise')).toBe(before);

    // and the fridge no longer warns people
    await page.goto(`/fridges/${id}`);
    await expect(page.getByTestId('fridge-title')).toBeVisible();
    await expect(page.getByTestId('spoiled-warning')).toHaveCount(0);
  });

  test('a general flag alerts every bakery that posted at that fridge recently', async ({ page }) => {
    const id = await createFridge(page, 'admin', unique('E2E general flag fridge'));
    const item = unique('E2E stale pastries');
    await postUpdate(page, 'sunrise', id, 'stocked', 'Mixed pastries');

    await actAs(page, 'alex');
    await page.goto(`/fridges/${id}`);
    await page.getByTestId('flag-spoiled').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('flag-audience')).toContainText('last 3 days');
    await dialog.getByLabel('What is spoiled?').fill(item);
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByTestId('flash')).toContainText('The supplier has been notified');

    await actAs(page, 'sunrise');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await expect(alertCard(page, item)).toContainText('reported by Alex Tan');
  });

  test('when no bakery can be matched, admins still see the report', async ({ page }) => {
    const id = await createFridge(page, 'admin', unique('E2E unmatched fridge'));
    const item = unique('E2E old salad');

    await actAs(page, 'alex');
    await page.goto(`/fridges/${id}`);
    await page.getByTestId('flag-spoiled').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('What is spoiled?').fill(item);
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByTestId('flash')).toContainText('No registered supplier could be matched');

    await actAs(page, 'admin');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await expect(alertCard(page, item)).toContainText('No supplier matched');

    await actAs(page, 'sunrise');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await expect(alertCard(page, item)).toHaveCount(0);
  });

  test('the report form needs to know what is spoiled, and stops duplicate reports', async ({ page }) => {
    const id = await createFridge(page, 'admin', unique('E2E duplicate flag fridge'));
    await flagSpoiled(page, 'alex', id, unique('E2E first report'));

    await page.goto(`/fridges/${id}`);
    await page.getByTestId('flag-spoiled').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByText(/Say what is spoiled/)).toBeVisible();
    await expect(dialog).toBeVisible(); // still open

    // the same person reporting the same fridge again within the hour is told the supplier already knows
    await dialog.getByLabel('What is spoiled?').fill('Second report');
    await dialog.getByRole('button', { name: 'Send report' }).click();
    await expect(dialog.getByRole('alert')).toContainText('You already reported spoiled food here in the last hour');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('the bakery sees the alert about its drop-off, other bakeries do not, and admins see everything', async ({ page }) => {
    await actAs(page, 'sunrise');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    const demo = alertCard(page, 'Sourdough loaves');
    await expect(demo).toContainText('Tiong Bahru Community Fridge');
    await expect(demo).toContainText('reported by Alex Tan');
    await expect(demo).toContainText('Two of the loaves had gone mouldy.');

    await actAs(page, 'crumb');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await expect(alertCard(page, 'Sourdough loaves')).toHaveCount(0);

    await actAs(page, 'admin');
    await page.goto('/spoiled-alerts');
    await alertsLoaded(page);
    await expect(alertCard(page, 'Sourdough loaves')).toBeVisible();
  });

  test('the alerts page is only for bakeries and admins', async ({ page }) => {
    await page.goto('/spoiled-alerts');
    await expect(page).toHaveURL(/\/login/); // guests are asked to log in

    for (const who of ['alex', 'hope']) {
      await actAs(page, who);
      await page.goto('/spoiled-alerts');
      await expect(page.getByTestId('forbidden')).toBeVisible();
    }
  });
});
