import { test, expect } from './test.js';

for (const { account, routes } of [
  { account: null, routes: ['/browse', '/login', '/register', '/forbidden', '/missing-page', '/fridges'] },
  { account: 'sunrise', routes: ['/my-listings', '/listings/new', '/orders', '/reservations', '/impact', '/profile', '/ratings', '/needs', '/spoiled-alerts'] },
  { account: 'hope', routes: ['/needs', '/reservations', '/profile', '/fridges/new'] },
  { account: 'admin', routes: ['/admin/charities', '/admin/appeals', '/spoiled-alerts'] },
]) {
  test(`${account || 'guest'} page banners fit desktop and mobile with reduced motion`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (account) {
      const login = await page.request.post('/api/auth/login', {
        data: { email: `${account}@demo.surplate.sg`, password: 'demo1234' },
      });
      expect(login.ok()).toBe(true);
    }
    for (const route of routes) {
      await page.goto(route);
      const banner = page.locator('.community-banner, .fridge-hero').first();
      await expect(banner).toBeVisible();
      await expect(page.locator('.fridge-backdrop')).toHaveCount(1);
      const heading = banner.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible();
      for (const width of [1280, 375]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const bounds = await banner.boundingBox();
        const title = await heading.boundingBox();
        expect(title.x).toBeGreaterThanOrEqual(bounds.x);
        expect(title.x + title.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
        if (['/spoiled-alerts', '/login', '/profile', '/needs', '/browse'].includes(route)) {
          await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${width}.png`), animations: 'disabled' });
        }
      }
      if (await heading.locator('.title-word').count()) {
        await expect(heading.locator('.title-word').first()).toHaveCSS('animation-name', 'none');
      }
    }
  });
}

test('banner titles bounce by word and preserve an accessible heading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  const title = page.getByRole('heading', { level: 1, name: 'Welcome back', exact: true });
  await expect(title.locator('.title-word')).toHaveCount(2);
  await expect(title.locator('.title-word').first()).toHaveCSS('animation-name', /^title-bounce/);
});
