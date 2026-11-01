import { test, expect } from './test.js';

async function login(page, name) {
  const response = await page.request.post('/api/auth/login', { data: { email: `${name}@demo.surplate.sg`, password: 'demo1234' } });
  expect(response.ok()).toBe(true);
}

test('bakery navigation keeps tasks and community links in tidy desktop rows', async ({ page }, testInfo) => {
  await login(page, 'sunrise');
  await page.route('**/api/auth/me', async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.user.name = 'Sunrise Artisan Bakery and Community Kitchen';
    await route.fulfill({ response, json });
  });
  await page.goto('/my-listings');
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'My listings', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const width of [1440, 1280, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(nav.getByRole('button', { name: 'Toggle navigation' })).toBeHidden();
    for (const group of ['.workspace-primary-links', '.workspace-community-links']) {
      const boxes = await nav.locator(`${group} .nav-link`).evaluateAll((links) => links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { top: rect.top, left: rect.left, right: rect.right };
      }));
      expect(new Set(boxes.map((box) => Math.round(box.top))).size).toBe(1);
      expect(boxes.every((box) => box.left >= 0 && box.right <= width)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await nav.screenshot({ path: testInfo.outputPath('bakery-navbar-desktop.png') });
  await nav.getByRole('link', { name: 'Orders', exact: true }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(nav.getByRole('link', { name: 'Orders', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByTestId('nav-alerts')).toBeVisible();
  await expect(nav.getByTestId('alert-count')).toBeVisible();
  await nav.getByRole('link', { name: 'Post surplus', exact: true }).click();
  await expect(page).toHaveURL(/\/listings\/new$/);
});

test('bakery mobile and tablet menus are reachable, close on selection and support Escape', async ({ page }, testInfo) => {
  await login(page, 'sunrise');
  await page.goto('/my-listings');
  const nav = page.getByRole('navigation');
  const toggle = nav.getByRole('button', { name: 'Toggle navigation' });
  for (const width of [1024, 375]) {
    await page.setViewportSize({ width, height: 812 });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['My listings', 'Orders', 'Impact dashboard', 'Post surplus', 'Browse food', 'Community fridges', 'Charity Needs Board', 'Thank-you wall', 'Spoiled alerts']) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await nav.getByRole('link', { name: 'Orders', exact: true }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await nav.getByRole('link', { name: 'Orders', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  }
  await toggle.click();
  await nav.screenshot({ path: testInfo.outputPath('bakery-navbar-mobile.png') });
  await nav.getByTestId('account-link').click();
  await expect(page).toHaveURL(/\/profile$/);
  await toggle.click();
  await nav.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/$/);
  await toggle.click();
  await expect(nav.getByTestId('nav-login')).toBeVisible();
});

test('guest and charity accounts keep their own navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('nav-login')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Post surplus', exact: true })).toHaveCount(0);
  await login(page, 'hope');
  await page.goto('/impact');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'My reservations', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'My listings', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Post surplus', exact: true })).toHaveCount(0);
});

for (const { account, links, twoRows } of [
  { account: null, links: ['Browse food', 'Community fridges'], twoRows: false },
  { account: 'alex', links: ['Browse food', 'Community fridges', 'My reservations', 'Impact dashboard'], twoRows: false },
  { account: 'hope', links: ['Browse food', 'Community fridges', 'Charity Needs Board', 'My reservations', 'Impact dashboard'], twoRows: false },
  { account: 'newhope', links: ['Browse food', 'Community fridges', 'My reservations', 'Impact dashboard'], twoRows: false },
  { account: 'admin', links: ['Verify charities', 'Appeals', 'Impact dashboard'], twoRows: true },
]) {
  test(`${account || 'guest'} navigation shares the design and fits its desktop and mobile layout`, async ({ page }, testInfo) => {
    if (account) {
      await login(page, account);
      await page.route('**/api/auth/me', async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        json.user.name = 'A very long community organisation account name';
        if (account === 'newhope') json.user.verification.status = 'pending';
        await route.fulfill({ response, json });
      });
    }
    await page.goto(account ? '/impact' : '/');
    const nav = page.getByRole('navigation');
    const toggle = nav.getByRole('button', { name: 'Toggle navigation' });
    await expect(nav.locator('.workspace-primary-links .nav-link')).toHaveCount(links.length);
    await expect(nav.locator('.workspace-secondary')).toHaveCount(twoRows ? 1 : 0);
    for (const width of [1440, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(toggle).toBeHidden();
      const rows = await nav.locator('.workspace-primary-links .nav-link').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
      expect(new Set(rows).size).toBe(1);
      const primary = await nav.locator('.workspace-primary-links').boundingBox();
      const accountBox = await nav.getByTestId('account-nav').boundingBox();
      expect(primary.x + primary.width).toBeLessThanOrEqual(accountBox.x - 8);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await nav.screenshot({ path: testInfo.outputPath(`${account || 'guest'}-navbar-desktop.png`) });
    for (const name of links) {
      const link = nav.getByRole('link', { name: new RegExp(`^${name}`) });
      await expect(link).toBeVisible();
      await expect(link.locator('.bi')).toHaveCount(1);
    }
    if (account === 'newhope') await expect(nav.getByTestId('account-link')).toContainText('Pending');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    for (const name of links) await expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await nav.screenshot({ path: testInfo.outputPath(`${account || 'guest'}-navbar-mobile.png`) });
    await page.keyboard.press('Escape');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const first = nav.locator('.workspace-primary-links .nav-link').first();
    const destination = await first.getAttribute('href');
    await first.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => new URL(page.url()).pathname).toBe(destination);
  });
}
