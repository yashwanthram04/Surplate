import { expect, test } from './test.js';

test.describe('home page', () => {
  test('explains the app and offers the two sign-up paths', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText("Good food shouldn't end up in the bin");
    await expect(page.getByTestId('cta-bakery')).toHaveAttribute('href', '/register?role=bakery');
    await expect(page.getByTestId('cta-individual')).toHaveAttribute('href', '/register?role=individual');

    // the three audiences, each with its own register link
    for (const [key, role] of [['bakery', 'bakery'], ['charity', 'charity'], ['individual', 'individual']]) {
      const card = page.getByTestId(`audience-${key}`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole('link')).toHaveAttribute('href', `/register?role=${role}`);
    }
  });

  test('shows live numbers from the API and the cited problem statistic', async ({ page }) => {
    const stats = await (await page.request.get('/api/stats')).json();
    await page.goto('/');

    await expect(page.getByTestId('stat-items')).toHaveAttribute('data-value', String(stats.items));
    await expect(page.getByTestId('stat-listings')).toHaveAttribute('data-value', String(stats.listings));
    await expect(page.getByTestId('stat-bakeries')).toHaveAttribute('data-value', String(stats.bakeries));

    const waste = page.getByTestId('waste-number');
    await waste.scrollIntoViewIfNeeded();
    // the visible digits count up and must land on the real figure
    await expect(waste.locator('[aria-hidden="true"]')).toHaveText('790,000', { timeout: 6000 });
    await expect(page.getByRole('link', { name: /Waste statistics and overall recycling rate/ })).toHaveAttribute('href', /nea\.gov\.sg/);
  });

  test('previews the newest listings and links on to the board', async ({ page }) => {
    await page.goto('/');
    const latest = page.getByTestId('latest-listings');
    await latest.scrollIntoViewIfNeeded();
    await expect(latest.getByTestId('listing-card')).toHaveCount(3);

    await page.getByTestId('cta-browse').click();
    await expect(page).toHaveURL(/\/browse$/);
    await expect(page.getByRole('heading', { name: 'Rescue surplus food' })).toBeVisible();
  });

  test('navigation: the logo goes home and "Browse food" goes to the board', async ({ page }) => {
    await page.goto('/browse');
    await page.getByRole('link', { name: 'Surplate' }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('navigation').getByRole('link', { name: 'Browse food' }).click();
    await expect(page).toHaveURL(/\/browse$/);
  });

  test('respects "reduce motion": numbers appear immediately, nothing is left hidden', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const waste = page.getByTestId('waste-number');
    await waste.scrollIntoViewIfNeeded();
    await expect(waste.locator('[aria-hidden="true"]')).toHaveText('790,000', { timeout: 500 });
    await expect(page.getByTestId('audience-bakery')).toBeVisible();
  });

  test('works on a phone: no sideways scrolling and the sign-up buttons are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.getByTestId('cta-bakery')).toBeInViewport();
    await expect(page.getByTestId('cta-individual')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
