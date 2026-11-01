import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByTestId('nav-login').click();
  await page.getByTestId('login-submit').click();
  await page.getByText('Demo accounts').click();
  await page.getByRole('button', { name: 'Bakery' }).click();
  await page.getByTestId('login-submit').click();
  await page.getByRole('link', { name: 'Orders' }).click();
  await page.goto('http://localhost:5173/orders');
});