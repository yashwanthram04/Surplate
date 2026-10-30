import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from './test.js';

const photo = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/croissant.png'));

async function login(page, name) {
  const response = await page.request.post('/api/auth/login', { data: { email: `${name}@demo.surplate.sg`, password: 'demo1234' } });
  expect(response.ok()).toBe(true);
}
/** Logs in as someone else in a fresh browser context, so two people can be on screen at once. */
async function asUser(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, name);
  return { page, context, errors };
}
const wallUrl = async (page) => {
  const board = await (await page.request.get('/api/listings')).json();
  return `/bakeries/${board.items.find((l) => l.bakery.name === 'Sunrise Bakery').bakery.id}`;
};
const note = (page, text) => page.getByTestId('thank-you-note').filter({ hasText: text });

test('anyone can read a bakery’s Thank-you Wall: pinned note first, reply, filters, and the chip on a listing card', async ({ page }, testInfo) => {
  await page.goto('/browse');
  const card = page.getByTestId('listing-card').filter({ hasText: 'Assorted croissants' });
  await expect(card.getByTestId('thanks-chip')).toContainText('thank-yous');
  await card.getByTestId('thanks-chip').click();

  await expect(page).toHaveURL(/\/bakeries\/[a-f0-9]{24}$/);
  await expect(page.getByTestId('wall-title')).toHaveText('Sunrise Bakery');
  await expect(page.getByTestId('tier')).toContainText('Excellent');
  await expect(page.getByTestId('gauge').first()).toHaveAttribute('aria-label', /Bakery reliability: \d+ out of 100/);
  await expect(page.getByTestId('thank-you-note').first()).toContainText('Saturday residents');
  await expect(page.getByTestId('thank-you-note').first().getByTestId('pinned-badge')).toBeVisible();
  await expect(page.getByTestId('thank-you-note').first().getByTestId('on-behalf')).toContainText('40 people');
  await expect(page.getByTestId('thank-you-note').first().getByTestId('note-reply')).toContainText('See you again next Saturday');
  // guests get no staff controls
  await expect(page.getByTestId('pin-btn')).toHaveCount(0);

  await page.getByTestId('filter-charity').click();
  await expect(page.getByTestId('filter-charity')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('thank-you-note').filter({ hasNotText: 'Hope Kitchen' })).toHaveCount(0); // only the charity’s notes remain
  await expect(page.getByTestId('thank-you-note').first()).toBeVisible();
  await page.getByTestId('filter-pinned').click();
  await expect(page.getByTestId('thank-you-note')).toHaveCount(1);
  await expect(page.getByTestId('pinned-badge')).toHaveCount(1);
  await page.getByTestId('filter-all').click();
  await expect(page.getByTestId('thank-you-note')).toHaveCount(5);

  await page.waitForTimeout(1800); // let the gauge and bars finish animating
  await page.screenshot({ path: testInfo.outputPath('wall-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('wall-mobile.png'), fullPage: true });
});

test('a recipient thanks a bakery with a live preview; staff pin and reply; a fourth pin is refused', async ({ page, browser }, testInfo) => {
  const text = `Brilliant bread ${Date.now()}`;
  await login(page, 'alex');
  await page.goto('/browse');

  // the banner invites a thank-you for a collected pickup
  await expect(page.getByTestId('review-prompt')).toContainText('How was your');
  await page.getByTestId('open-review').click();
  const modal = page.getByTestId('review-modal');
  await expect(modal).toBeVisible();

  // nothing filled in: every problem is explained
  await modal.getByTestId('send-thanks').click();
  await expect(modal.getByText('Rate the food from 1 to 5 stars.')).toBeVisible();
  await expect(modal.getByText('Rate how accurate the listing was.')).toBeVisible();
  await expect(modal.getByText(/Write at least 3 characters/)).toBeVisible();

  // ratings by keyboard (arrow keys) and by click, and a quick compliment
  const food = modal.getByRole('radiogroup', { name: 'Food rating' });
  await food.getByRole('radio').first().focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); // the first press selects 1 star
  await expect(food.getByRole('radio', { name: /^5 stars/ })).toHaveAttribute('aria-checked', 'true');
  await expect(modal.getByText('Loved it!')).toBeVisible();
  await modal.getByRole('radiogroup', { name: 'Listing accuracy rating' }).getByRole('radio', { name: /^4 stars/ }).click();
  await modal.getByLabel('Your thank-you note').fill(text);
  await modal.getByRole('button', { name: 'Still warm 🔥' }).click();
  await expect(modal.getByLabel('Your thank-you note')).toHaveValue(`${text}, Still warm 🔥`);
  await modal.getByLabel('Name shown on the wall').fill('Alex the Hungry');
  // the sticky note previews exactly what will be posted
  await expect(modal.getByTestId('thank-you-note')).toContainText(`${text}, Still warm 🔥`);
  await expect(modal.getByTestId('thank-you-note')).toContainText('Alex the Hungry');
  await page.screenshot({ path: testInfo.outputPath('review-form.png') });

  await modal.getByTestId('send-thanks').click();
  await expect(modal.getByTestId('posted-check')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('review-posted.png') });
  await modal.getByTestId('see-wall').click();
  await expect(page).toHaveURL(/\/bakeries\//);
  await expect(note(page, text)).toContainText('Alex the Hungry');
  await expect(note(page, text)).toContainText('you'); // marked as theirs
  await expect(page.getByTestId('review-prompt')).toHaveCount(0); // the pickup is no longer waiting

  // bakery staff: pin, reply
  const staff = await asUser(browser, 'sunrise');
  try {
    await staff.page.goto(await wallUrl(staff.page));
    const mine = note(staff.page, text);
    await mine.getByTestId('pin-btn').click();
    await expect(mine.getByTestId('pinned-badge')).toBeVisible();
    await expect(staff.page.getByTestId('thank-you-note').first()).toContainText(text); // the newest pin goes to the top
    await mine.getByTestId('reply-btn').click();
    await mine.getByLabel('Reply to Alex the Hungry').fill('See you tomorrow!');
    await mine.getByTestId('send-reply').click();
    await expect(mine.getByTestId('note-reply')).toContainText('See you tomorrow!');

    // the seeded pin + ours = 2; a third is fine, a fourth is not offered
    const unpinned = staff.page.getByTestId('thank-you-note').filter({ hasNot: staff.page.getByTestId('pinned-badge') });
    await unpinned.first().getByTestId('pin-btn').click();
    await expect(staff.page.getByTestId('pinned-badge')).toHaveCount(3);
    await expect(unpinned.first().getByTestId('pin-btn')).toBeDisabled();
    await staff.page.screenshot({ path: testInfo.outputPath('wall-staff.png'), fullPage: true });
    // undo, so the pin limit is free for other tests
    await staff.page.getByTestId('thank-you-note').first().getByTestId('pin-btn').click();
    await expect(staff.page.getByTestId('pinned-badge')).toHaveCount(2);
  } finally {
    await staff.context.close();
  }

  // a visitor sees the reply
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  try {
    await guestPage.goto(await wallUrl(page));
    await expect(note(guestPage, text).getByTestId('note-reply')).toContainText('See you tomorrow!');
  } finally {
    await guest.close();
  }
});

test('a charity can thank a bakery on behalf of the people it serves', async ({ page, browser }) => {
  // set the pickup up through the API: Sunrise lists food, Hope reserves it, Sunrise confirms the collection
  const staff = await asUser(browser, 'sunrise');
  const now = Date.now();
  const itemName = `Charity loaves ${now}`;
  try {
    const created = await staff.page.request.post('/api/listings', { multipart: {
      itemName, quantity: '4', weightGramsPerUnit: '300',
      pickupStart: new Date(now - 60000).toISOString(), pickupEnd: new Date(now + 3600000).toISOString(), bestBefore: new Date(now + 7200000).toISOString(),
      address: '56 ENG HOON STREET', lat: '1.2851', lng: '103.8317', photo: { name: 'food.png', mimeType: 'image/png', buffer: photo },
    } });
    expect(created.status()).toBe(201);
    const listing = await created.json();
    await login(page, 'hope');
    const reserved = await page.request.post('/api/reservations', { data: { listingId: listing.id, quantity: 2, slotStart: listing.pickupStart } });
    expect(reserved.status()).toBe(201);
    const reservation = await reserved.json();
    expect((await staff.page.request.post(`/api/reservations/${reservation.id}/collect`, { data: { code: reservation.code } })).ok()).toBe(true);
  } finally {
    await staff.context.close();
  }

  await page.goto('/reservations');
  const row = page.getByTestId('reservation-row').filter({ hasText: itemName });
  await row.getByTestId('say-thanks').click();
  const modal = page.getByTestId('review-modal');
  await expect(modal.getByLabel('Who are they?')).toHaveCount(0);
  await modal.getByLabel('Thank them on behalf of the people we serve').check();
  await modal.getByLabel('Who are they?').fill('our Tuesday kitchen volunteers');
  await modal.getByLabel('People served').fill('0');
  await modal.getByRole('radiogroup', { name: 'Food rating' }).getByRole('radio', { name: /^5 stars/ }).click();
  await modal.getByRole('radiogroup', { name: 'Listing accuracy rating' }).getByRole('radio', { name: /^5 stars/ }).click();
  await modal.getByLabel('Your thank-you note').fill('Fed the whole kitchen!');
  await modal.getByTestId('send-thanks').click();
  await expect(modal.getByText('Enter a whole number from 1 to 5000.')).toBeVisible();
  await modal.getByLabel('People served').fill('30');
  await expect(modal.getByTestId('on-behalf')).toContainText('our Tuesday kitchen volunteers');
  await modal.getByTestId('send-thanks').click();
  await expect(modal.getByTestId('posted-check')).toBeVisible();
  await modal.getByTestId('see-wall').click();
  await expect(note(page, 'Fed the whole kitchen!').getByTestId('on-behalf')).toContainText('30 people');
  await expect(note(page, 'Fed the whole kitchen!')).toContainText('Hope Kitchen');
});

test('bakery staff rate customers, which counts towards the customer’s reliability score', async ({ page, browser }, testInfo) => {
  await login(page, 'sunrise');
  await page.goto('/orders');
  await page.getByTestId('nav-wall').click();
  await expect(page.getByTestId('wall-title')).toHaveText('Sunrise Bakery');
  await expect(page.getByTestId('to-rate-count')).toBeVisible();
  await page.getByTestId('rate-customers-link').click();

  await expect(page).toHaveURL(/\/ratings$/);
  const card = page.getByTestId('rate-card').filter({ hasText: 'Alex Tan' }).first();
  await expect(card).toContainText('Kaya toast sets');
  await card.getByTestId('submit-rating').click();
  await expect(card.getByText('Choose a star rating first.')).toBeVisible();
  await card.getByRole('radio', { name: /^4 stars/ }).click();
  await expect(card.getByText('On time')).toBeVisible();
  await card.getByLabel('Comment (optional)').fill('Right on time, very polite');
  const before = await page.getByTestId('rate-card').count();
  await page.screenshot({ path: testInfo.outputPath('rate-customers.png') });
  await card.getByTestId('submit-rating').click();
  await expect(card).toContainText('Rated, thank you!');
  await expect(page.getByTestId('rate-card')).toHaveCount(before - 1);
  await expect(page.getByRole('progressbar', { name: 'Customers rated' })).toContainText('1 of');

  // the customer sees it on their account page, with the breakdown of how the score is built
  const customer = await asUser(browser, 'alex');
  try {
    await customer.page.goto('/profile');
    const panel = customer.page.getByTestId('reliability-panel');
    await expect(panel).toContainText('Pickups collected');
    await expect(panel).toContainText('Punctuality (from bakeries)');
    await expect(panel).toContainText('Right on time, very polite');
    await expect(panel.getByTestId('gauge')).toHaveAttribute('aria-label', /Reliability: \d+ out of 100/);
    await customer.page.waitForTimeout(1800);
    await customer.page.screenshot({ path: testInfo.outputPath('reliability-panel.png') });
  } finally {
    await customer.context.close();
  }
});

test('a blocked recipient sees why and for how long, appeals, and the admin’s decision', async ({ page, browser }, testInfo) => {
  await login(page, 'sam');
  await page.goto('/reservations');
  const notice = page.getByTestId('reliability');
  await expect(notice).toContainText('Reliability score: 25%');
  await expect(notice).toContainText('Reservations paused');
  await expect(notice.getByTestId('lifts-in')).toContainText(/\d+d/);

  await notice.getByTestId('appeal-open').click();
  await notice.getByTestId('appeal-send').click();
  await expect(notice.getByText(/at least 20 characters/)).toBeVisible();
  await notice.getByLabel('What happened?').fill('I was in hospital that week and could not let anyone know.');
  await page.screenshot({ path: testInfo.outputPath('appeal-form.png') });
  await notice.getByTestId('appeal-send').click();
  await expect(notice.getByTestId('appeal-pending')).toBeVisible();
  await expect(notice.getByTestId('appeal-open')).toHaveCount(0); // one appeal at a time

  const admin = await asUser(browser, 'admin');
  try {
    await admin.page.goto('/admin/appeals');
    await expect(admin.page.getByTestId('appeal-count')).toBeVisible();
    const row = admin.page.getByTestId('appeal-row').filter({ hasText: 'Sam Lee' });
    await expect(row).toContainText('hospital');
    await admin.page.screenshot({ path: testInfo.outputPath('admin-appeals.png') });
    await row.getByTestId('deny').click();
    const dialog = admin.page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Decline' }).click();
    await expect(dialog.getByText(/Tell them why/)).toBeVisible();
    await dialog.getByLabel('Reason (shown to them)').fill('Please send proof of the hospital stay.');
    await dialog.getByRole('button', { name: 'Decline' }).click();
    await expect(admin.page.getByTestId('flash')).toContainText('declined');
    await expect(row).toHaveCount(0);
    await admin.page.getByTestId('tab-denied').click();
    await expect(admin.page.getByTestId('appeal-row').filter({ hasText: 'Sam Lee' })).toContainText('Please send proof');
  } finally {
    await admin.context.close();
  }

  await page.reload();
  await expect(page.getByTestId('appeal-denied')).toContainText('Please send proof of the hospital stay.');
  await expect(page.getByTestId('appeal-retry')).toContainText('You can appeal again in'); // 24 hour cool-off
  await expect(page.getByTestId('appeal-open')).toHaveCount(0);
});

test('the reduced-motion setting turns the animations off but keeps every number', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(await wallUrl(page));
  await expect(page.getByTestId('gauge').first()).toHaveAttribute('aria-label', /out of 100/);
  await expect(page.getByTestId('thank-you-note').first()).toBeVisible();
  const motion = await page.evaluate(() => getComputedStyle(document.querySelector('.gauge-halo')).animationName);
  expect(motion).toBe('none');
});
