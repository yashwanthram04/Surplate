import { expect, test } from './test.js';

// ---------- Demo accounts ----------
const EMAILS = {
  sunrise: 'sunrise@demo.surplate.sg',
  hope: 'hope@demo.surplate.sg',
};

// Log in as a charity or bakery
async function actAs(page, who) {
  const res = await page.request.post('/api/auth/login', {
    data: {
      email: EMAILS[who],
      password: 'demo1234',
    },
  });

  expect(res.ok(), `login as ${who}`).toBe(true);
}

// Get a date and time two days from now
function inTwoDays() {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');

  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    iso: d.toISOString(),
  };
}

// API helpers
// Create a need and return its unique ID
async function createNeed(page, who, title, quantity) {
  await actAs(page, who);

  const res = await page.request.post('/api/needs', {
    data: {
      title,
      description: 'Bread needed for charity meals.',
      quantityTarget: quantity,
      neededBy: inTwoDays().iso,
      dietaryTags: [],
    },
  });

  const body = await res.text();

  expect(
    res.ok(),
    `create need as ${who}: ${body}`
  ).toBe(true);

  return JSON.parse(body).id;
}

// Submit a pledge through the API
async function pledgeTo(page, who, needId, quantity) {
  await actAs(page, who);

  const res = await page.request.post(
    `/api/needs/${needId}/pledge`,
    { data: { quantity } }
  );

  expect(
    res.ok(),
    `pledge ${quantity} as ${who}: ${await res.text()}`
  ).toBe(true);
}

//  Page helpers
// Find a specific request using its database ID
const needCard = (page, id) =>
  page.getByTestId(`need-${id}`);

const pledgeInput = (card) =>
  card.locator('input[type="number"]').first();

// Open the board as a particular user
async function openBoard(page, who, id) {
  await actAs(page, who);
  await page.goto('/needs');

  await expect(needCard(page, id)).toBeVisible();
}

function watchForBrowserPopup(page) {
  const seen = { popup: false };

  page.on('dialog', async (dialog) => {
    seen.popup = true;
    await dialog.dismiss();
  });

  return seen;
}

// CREATE - Posting food requests
test.describe('posting a need (charity)', () => {

  test('a verified charity posts a need through the form and sees it on the board', async ({ page }) => {
    const title = 'Bread';
    const when = inTwoDays();

    await actAs(page, 'hope');
    await page.goto('/needs');

    await page.getByLabel('Request title').fill(title);
    await page.getByLabel('Quantity needed').fill('5');
    await page.getByLabel('Date needed').fill(when.date);
    await page.getByLabel('Time needed').fill(when.time);

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/needs') &&
          r.request().method() === 'POST'
      ),
      page.getByRole('button', { name: /post request/i }).click(),
    ]);

    expect(response.status()).toBe(201);

    const createdNeed = await response.json();
    const id = createdNeed.id;

    await expect(
      page.getByText('Your need has been posted!')
    ).toBeVisible();

    const card = needCard(page, id);

    await expect(card).toBeVisible();
    await expect(card).toContainText('Bread');
    await expect(card).toContainText('0 of 5 pledged');
    await expect(card).toContainText('Hope Kitchen');
  });

  test('the form will not send without a title', async ({ page }) => {
    await actAs(page, 'hope');
    await page.goto('/needs');

    await page.getByRole('button', { name: /post request/i }).click();

    const titleIsEmpty = await page
      .getByLabel('Request title')
      .evaluate((box) => box.validity.valueMissing);

    expect(titleIsEmpty).toBe(true);

    await expect(
      page.getByText('Your need has been posted!')
    ).toHaveCount(0);
  });

  test('a need dated in the past is refused', async ({ page }) => {
    await actAs(page, 'hope');
    await page.goto('/needs');

    await page.getByLabel('Request title').fill('Bread');
    await page.getByLabel('Date needed').fill('2020-01-01');

    await page.getByLabel('Date needed').evaluate(
      (box) => box.removeAttribute('min')
    );

    await page.getByLabel('Time needed').fill('09:00');

    await page.getByRole('button', { name: /post request/i }).click();

    await expect(
      page.getByText('Please choose a future date and time.')
    ).toBeVisible();
  });
});


// READ - Viewing food requests
test.describe('reading the board', () => {

  test('a bakery sees a need that a charity posted', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 7);

    await openBoard(page, 'sunrise', id);

    const card = needCard(page, id);

    await expect(card).toContainText('Bread');
    await expect(card).toContainText('0 of 7 pledged');
    await expect(card).toContainText('Hope Kitchen');
  });

  test('a bakery sees the pledge box and no posting form; a charity sees the form and no pledge box', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 4);

    // Bakery view
    await openBoard(page, 'sunrise', id);

    const bakeryCard = needCard(page, id);

    await expect(pledgeInput(bakeryCard)).toBeVisible();

    await expect(
      page.getByText('Post a food request')
    ).toHaveCount(0);

    // Charity view
    await openBoard(page, 'hope', id);

    await expect(
      page.getByText('Post a food request')
    ).toBeVisible();

    await expect(
      pledgeInput(needCard(page, id))
    ).toHaveCount(0);
  });
});

// UPDATE - Editing food requests
test.describe('updating a need (charity)', () => {

  test('the charity changes the quantity of its own need', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 5);

    await openBoard(page, 'hope', id);

    const card = needCard(page, id);

    await card.getByRole('button', { name: 'Edit quantity' }).click();

    await card.getByLabel('Update quantity needed').fill('8');

    await card.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText('Request quantity updated!')
    ).toBeVisible();

    await expect(card).toContainText('0 of 8 pledged');
  });

  test('the quantity cannot go below what bakeries already pledged', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 10);

    // Bakery has already pledged 4 units
    await pledgeTo(page, 'sunrise', id, 4);

    await openBoard(page, 'hope', id);

    const card = needCard(page, id);

    await card.getByRole('button', { name: 'Edit quantity' }).click();

    await card.getByLabel('Update quantity needed').fill('2');

    await card.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText(/You already have 4 units pledged/)
    ).toBeVisible();

    // The original quantity should remain unchanged
    await expect(card).toContainText('4 of 10 pledged');
  });
});


// DELETE - Cancelling food requests
test.describe('cancelling a need (charity)', () => {

  test('cancelling uses our own confirm box, and "Keep request" changes nothing', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 4);

    const browserPopup = watchForBrowserPopup(page);

    await openBoard(page, 'hope', id);

    const card = needCard(page, id);

    await card.getByRole('button', { name: 'Cancel request' }).click();

    await expect(
      page.getByText('Cancel this request?')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Keep request' }).click();

    await expect(
      page.getByText('Cancel this request?')
    ).toHaveCount(0);

    await expect(
      card.getByRole('button', { name: 'Cancel request' })
    ).toBeVisible();

    await card.getByRole('button', { name: 'Cancel request' }).click();

    await page.getByRole('button', { name: 'Yes, cancel request' }).click();

    await expect(
      page.getByText('Your request has been cancelled.')
    ).toBeVisible();

    await expect(
      card.getByText('Cancelled', { exact: true })
    ).toBeVisible();

    expect(browserPopup.popup).toBe(false);
  });
});


// PLEDGING - Bakery contributions
test.describe('pledging (bakery)', () => {

  test('a bakery pledges, then the charity sees which bakery and where to collect', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 10);

    await openBoard(page, 'sunrise', id);

    const bakeryCard = needCard(page, id);

    await pledgeInput(bakeryCard).fill('4');

    await bakeryCard
      .getByRole('button', { name: /submit pledge/i })
      .click();

    await expect(
      page.getByText('Your pledge has been submitted!')
    ).toBeVisible();

    await expect(bakeryCard).toContainText('4 of 10 pledged');

    await openBoard(page, 'hope', id);

    const charityCard = needCard(page, id);

    await expect(charityCard).toContainText('Bakeries who pledged');
    await expect(charityCard).toContainText('Sunrise Bakery');
    await expect(charityCard).toContainText('4 units');

    await expect(
      charityCard.getByText(/Collect at|No pickup address saved yet/)
    ).toBeVisible();
  });

  test('a bakery cannot pledge more than is still needed', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 3);

    await openBoard(page, 'sunrise', id);

    const card = needCard(page, id);

    await pledgeInput(card).fill('50');

    await card.getByRole('button', { name: /submit pledge/i }).click();

    await expect(
      page.getByText(/Only 3 more units are needed/)
    ).toBeVisible();

    await expect(card).toContainText('0 of 3 pledged');
  });

  test('withdrawing a pledge uses our own confirm box and frees the units again', async ({ page }) => {
    const id = await createNeed(page, 'hope', 'Bread', 6);

    await pledgeTo(page, 'sunrise', id, 2);

    const browserPopup = watchForBrowserPopup(page);

    await openBoard(page, 'sunrise', id);

    const card = needCard(page, id);

    await expect(card).toContainText('2 of 6 pledged');

    // Withdraw the newest pledge
    await page.getByRole('button', { name: /withdraw/i }).first().click();

    await expect(
      page.getByText('Withdraw this pledge?')
    ).toBeVisible();

    await page.getByRole('button', { name: 'Yes, withdraw' }).click();

    await expect(
      page.getByText('Your pledge has been withdrawn!')
    ).toBeVisible();

    // The pledged quantity returns to zero
    await expect(card).toContainText('0 of 6 pledged');

    expect(browserPopup.popup).toBe(false);
  });
});
