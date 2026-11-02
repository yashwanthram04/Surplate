import { expect, test } from './test.js';

// Seeded demo data (server/src/seed.js): "Assorted croissants" has 3 photos, "Vegan banana bread" has 1.
// Both are shared with individuals, so the individual demo account can open them.
async function openListing(page, name) {
  const res = await page.request.post('/api/auth/login', { data: { email: 'alex@demo.surplate.sg', password: 'demo1234' } });
  expect(res.ok(), 'login as alex').toBe(true);
  await page.goto('/browse');
  await page.getByRole('link', { name }).first().click();
  await expect(page.getByTestId('listing-title')).toHaveText(name);
}

test.describe('listing photo carousel', () => {
  test('a listing with several photos can be clicked through and back', async ({ page }) => {
    await openListing(page, 'Assorted croissants');
    const carousel = page.getByTestId('photo-carousel');
    const prev = page.getByTestId('photo-prev');
    const next = page.getByTestId('photo-next');

    await expect(carousel.locator('img')).toHaveCount(3);
    await expect(carousel.getByText('1 / 3')).toBeVisible();
    await expect(prev).toBeDisabled();

    await next.click();
    await expect(carousel.getByText('2 / 3')).toBeVisible();
    await next.click();
    await expect(carousel.getByText('3 / 3')).toBeVisible();
    await expect(next).toBeDisabled();

    await prev.click();
    await expect(carousel.getByText('2 / 3')).toBeVisible();
  });

  test('the dots and the arrow keys move between photos', async ({ page }) => {
    await openListing(page, 'Assorted croissants');
    const carousel = page.getByTestId('photo-carousel');

    await carousel.getByRole('button', { name: 'Show photo 3' }).click();
    await expect(carousel.getByText('3 / 3')).toBeVisible();

    await carousel.locator('.pc-track').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(carousel.getByText('2 / 3')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(carousel.getByText('3 / 3')).toBeVisible();
  });

  test('every photo in the gallery actually loads', async ({ page }) => {
    await openListing(page, 'Assorted croissants');
    const images = page.getByTestId('photo-carousel').locator('img');
    for (let i = 0; i < 3; i++) {
      const src = await images.nth(i).getAttribute('src');
      const res = await page.request.get(src);
      expect(res.status(), `photo ${i + 1}`).toBe(200);
      expect(res.headers()['content-type']).toMatch(/^image\//);
    }
  });

  test('a listing with one photo shows no arrows, dots or counter', async ({ page }) => {
    await openListing(page, 'Vegan banana bread');
    await expect(page.getByTestId('photo-carousel').locator('img')).toHaveCount(1);
    await expect(page.getByTestId('photo-next')).toHaveCount(0);
    await expect(page.getByTestId('photo-prev')).toHaveCount(0);
    await expect(page.getByTestId('photo-carousel').getByText(/\d \/ \d/)).toHaveCount(0);
  });
});
