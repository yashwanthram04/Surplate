import { expect, test } from './test.js';

// More Charity Needs Board journeys, next to needsboard.spec.js (which covers posting, editing, cancelling and pledging):
// who may open the board, editing a pledge from "My Pledges", the status filters and the numbers strip.
// Each test creates its own uniquely named requests, so tests never depend on each other or on the seed data.

const EMAILS = {
  sunrise: 'sunrise@demo.surplate.sg',
  hope: 'hope@demo.surplate.sg',
  alex: 'alex@demo.surplate.sg',
};

async function actAs(page, who) {
  const res = await page.request.post('/api/auth/login', { data: { email: EMAILS[who], password: 'demo1234' } });
  expect(res.ok(), `login as ${who}`).toBe(true);
}

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
// A request title must name a food ("bread", "soup", ...), so every unique title starts with one.
const uniqueTitle = (label) => `Bread ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A charity posts a request through the API and gets its id back. */
async function createNeed(page, title, quantity) {
  await actAs(page, 'hope');
  const res = await page.request.post('/api/needs', {
    data: { title, description: 'Bread needed for charity meals.', quantityTarget: quantity, neededBy: inTwoDays(), dietaryTags: [] },
  });
  expect(res.ok(), `create need: ${await res.text()}`).toBe(true);
  return (await res.json()).id;
}

async function pledgeTo(page, needId, quantity) {
  await actAs(page, 'sunrise');
  const res = await page.request.post(`/api/needs/${needId}/pledge`, { data: { quantity } });
  expect(res.ok(), `pledge ${quantity}: ${await res.text()}`).toBe(true);
}

const needCard = (page, id) => page.getByTestId(`need-${id}`);

test.describe('who can open the board', () => {
  test('a guest is sent to log in, and returns to the board afterwards', async ({ page }) => {
    await page.goto('/needs');
    await expect(page).toHaveURL(/\/login\?next=.*needs/);
    await page.getByLabel('Email').fill(EMAILS.sunrise);
    await page.getByLabel('Password', { exact: true }).fill('demo1234');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/needs$/);
    await expect(page.getByRole('heading', { name: 'Charity Needs Board' })).toBeVisible();
  });

  test('an individual is told the board is for a different account type', async ({ page }) => {
    await actAs(page, 'alex');
    await page.goto('/needs');
    await expect(page.getByTestId('forbidden')).toBeVisible();
    await expect(page.getByTestId('needs-stats')).toHaveCount(0);
  });

  test('the server also refuses the wrong roles: a bakery cannot post a request and a charity cannot pledge', async ({ page, browser, baseURL }) => {
    const id = await createNeed(page, uniqueTitle('Roles'), 5);

    await actAs(page, 'sunrise');
    const bakeryPosts = await page.request.post('/api/needs', {
      data: { title: 'Not allowed', description: 'x', quantityTarget: 3, neededBy: inTwoDays(), dietaryTags: [] },
    });
    expect(bakeryPosts.status()).toBe(403);

    await actAs(page, 'hope');
    const charityPledges = await page.request.post(`/api/needs/${id}/pledge`, { data: { quantity: 1 } });
    expect(charityPledges.status()).toBe(403);

    const guest = await browser.newContext({ baseURL });
    try {
      const guestPledges = await guest.request.post(`/api/needs/${id}/pledge`, { data: { quantity: 1 } });
      expect(guestPledges.status()).toBe(401);
    } finally {
      await guest.close();
    }
  });
});

test.describe('the numbers at the top of the board', () => {
  test('show open requests, units still needed and units pledged, and move when someone pledges', async ({ page }) => {
    const id = await createNeed(page, uniqueTitle('Stats'), 6);

    await actAs(page, 'sunrise');
    await page.goto('/needs');
    await expect(needCard(page, id)).toBeVisible();
    const stats = page.getByTestId('needs-stats');
    await expect(stats).toBeVisible();
    await expect(stats).toContainText('open requests');
    await expect(stats).toContainText('units still needed');
    await expect(stats).toContainText('units pledged so far');

    // The "pledged" figure is the third tile. Read it, pledge 2 through the page, and it grows by 2.
    const pledgedTile = stats.locator('.stat-value').nth(2);
    await expect.poll(async () => Number((await pledgedTile.textContent()).replace(/\D/g, '')), { message: 'count-up finishes' }).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(1300); // let the count-up settle so the figure is final before reading it
    const before = Number((await pledgedTile.textContent()).replace(/\D/g, ''));

    await needCard(page, id).locator('input[type="number"]').first().fill('2');
    await needCard(page, id).getByRole('button', { name: /submit pledge/i }).click();
    await expect(page.getByText('Your pledge has been submitted!')).toBeVisible();
    await expect(needCard(page, id)).toContainText('2 of 6 pledged');
    await expect.poll(async () => Number((await pledgedTile.textContent()).replace(/\D/g, ''))).toBe(before + 2);
  });
});

test.describe('filtering requests by status', () => {
  test('All, Pending, Fulfilled and Cancelled each show the right requests, with a message when empty', async ({ page }) => {
    const openId = await createNeed(page, uniqueTitle('Filter open'), 8);
    const cancelledId = await createNeed(page, uniqueTitle('Filter cancelled'), 8);
    await actAs(page, 'hope');
    expect((await page.request.delete(`/api/needs/${cancelledId}`)).ok()).toBe(true);
    const fulfilledId = await createNeed(page, uniqueTitle('Filter fulfilled'), 2);
    await pledgeTo(page, fulfilledId, 2);

    await actAs(page, 'hope');
    await page.goto('/needs');

    // All shows every one of them.
    for (const id of [openId, cancelledId, fulfilledId]) await expect(needCard(page, id)).toBeVisible();

    await page.getByTestId('needs-filter-open').click();
    await expect(page.getByTestId('needs-filter-open')).toHaveAttribute('aria-pressed', 'true');
    await expect(needCard(page, openId)).toBeVisible();
    await expect(needCard(page, cancelledId)).toHaveCount(0);
    await expect(needCard(page, fulfilledId)).toHaveCount(0);

    await page.getByTestId('needs-filter-fulfilled').click();
    await expect(needCard(page, fulfilledId)).toBeVisible();
    await expect(needCard(page, fulfilledId)).toContainText('Fulfilled');
    await expect(needCard(page, openId)).toHaveCount(0);

    await page.getByTestId('needs-filter-cancelled').click();
    await expect(needCard(page, cancelledId)).toBeVisible();
    await expect(needCard(page, cancelledId)).toContainText('Cancelled');
    await expect(needCard(page, openId)).toHaveCount(0);

    await page.getByTestId('needs-filter-all').click();
    for (const id of [openId, cancelledId, fulfilledId]) await expect(needCard(page, id)).toBeVisible();
  });

  test('the filter counts add up and the page does not reload when switching', async ({ page }) => {
    await createNeed(page, uniqueTitle('Counts'), 4);
    await actAs(page, 'sunrise');
    await page.goto('/needs');

    // A marker on window survives only while the same page stays loaded.
    await page.evaluate(() => { window.__stillHere = true; });
    const count = async (key) => Number(/\((\d+)\)/.exec(await page.getByTestId(`needs-filter-${key}`).textContent())[1]);
    await expect(page.getByTestId('needs-filter-all')).toContainText('All (');
    const [all, open, fulfilled, cancelled] = [await count('all'), await count('open'), await count('fulfilled'), await count('cancelled')];
    expect(all).toBeGreaterThan(0);
    expect(open + fulfilled + cancelled).toBe(all);

    await page.getByTestId('needs-filter-cancelled').click();
    await page.getByTestId('needs-filter-all').click();
    expect(await page.evaluate(() => window.__stillHere)).toBe(true);
  });
});

test.describe('managing my pledges (bakery)', () => {
  test('a bakery changes the quantity of a pledge from My Pledges, and the request updates', async ({ page }) => {
    const title = uniqueTitle('Edit pledge');
    const id = await createNeed(page, title, 6);
    await pledgeTo(page, id, 2);

    await actAs(page, 'sunrise');
    await page.goto('/needs');
    await expect(needCard(page, id)).toContainText('2 of 6 pledged');

    const item = page.locator('.pledge-item').filter({ hasText: title });
    await expect(item).toContainText('Quantity pledged: 2');
    await item.getByRole('button', { name: 'Edit quantity' }).click();
    await item.getByLabel('New quantity').fill('4');
    await item.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Pledge quantity updated!')).toBeVisible();
    await expect(item).toContainText('Quantity pledged: 4');
    await expect(needCard(page, id)).toContainText('4 of 6 pledged');
  });

  test('a pledge quantity must be a whole number above zero and cannot exceed what is still needed', async ({ page }) => {
    const title = uniqueTitle('Bad pledge edit');
    const id = await createNeed(page, title, 5);
    await pledgeTo(page, id, 2);

    await actAs(page, 'sunrise');
    await page.goto('/needs');
    const item = page.locator('.pledge-item').filter({ hasText: title });
    await item.getByRole('button', { name: 'Edit quantity' }).click();

    await item.getByLabel('New quantity').fill('0');
    await item.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a whole number greater than 0.')).toBeVisible();

    await item.getByLabel('New quantity').fill('50');
    await item.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.pledges-panel [role="alert"]')).toBeVisible();

    // Nothing changed: the request still shows the original pledge.
    await expect(needCard(page, id)).toContainText('2 of 5 pledged');
    await item.getByRole('button', { name: 'Cancel' }).click();
    await expect(item).toContainText('Quantity pledged: 2');
  });
});
