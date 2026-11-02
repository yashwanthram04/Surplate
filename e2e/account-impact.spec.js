import { test, expect } from './test.js';

for (const { account, heading } of [
  { account: 'alex', heading: 'Your collections' },
  { account: 'sunrise', heading: 'Your bakery’s donations' },
  { account: 'hope', heading: 'Your charity’s collections' },
  { account: 'admin', heading: null },
]) {
  test(`${account} sees the dashboard totals and controls for their account role`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const login = await page.request.post('/api/auth/login', {
      data: { email: `${account}@demo.surplate.sg`, password: 'demo1234' },
    });
    expect(login.ok()).toBe(true);
    const response = await page.request.get('/api/impact');
    expect(response.ok()).toBe(true);
    const impact = await response.json();

    await page.goto('/impact');
    await expect(page).toHaveURL(/\/impact$/);
    await expect(page.getByRole('heading', { name: 'Together on Surplate', exact: true })).toBeVisible();

    if (heading) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Your impact', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: account === 'sunrise' ? 'Manage collections' : 'Reservation history' })).toHaveAttribute('href', account === 'sunrise' ? '/orders' : '/reservations');
    } else {
      await expect(page.getByRole('heading', { name: /^Your (collections|bakery’s donations|charity’s collections)$/ })).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Trend scope' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^(Manage collections|Reservation history)$/ })).toHaveCount(0);
    }

    const format = (value) => new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 }).format(value);
    for (const metric of ['collectedKg', 'estimatedMeals', 'collections']) {
      await expect(page.getByTestId(metric)).toHaveText(
        (heading ? [impact.mine, impact.platform] : [impact.platform]).map((totals) => format(totals[metric])),
      );
    }
  });
}

test('a guest returns to the impact dashboard after logging in', async ({ page }) => {
  await page.goto('/impact');
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/impact');
  await page.getByLabel('Email').fill('alex@demo.surplate.sg');
  await page.getByLabel('Password', { exact: true }).fill('demo1234');
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/impact$/);
  await expect(page.getByRole('heading', { name: 'Your collections', exact: true })).toBeVisible();
});
