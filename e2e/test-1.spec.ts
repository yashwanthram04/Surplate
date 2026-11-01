import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByTestId('nav-login').click();
  await page.getByText('Demo accounts').click();
  await page.getByRole('button', { name: 'Individual' }).click();
  await page.getByTestId('login-submit').click();
  await page.getByRole('link', { name: 'Pandan buns' }).click();
  await page.getByTestId('reserve-btn').click();
  await page.getByRole('spinbutton', { name: 'Quantity to reserve' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Quantity to reserve' }).click();
  await page.getByLabel('Collection slot').selectOption('2026-11-01T10:38:32.482Z');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await page.getByRole('button', { name: 'Change' }).first().click();
  await page.getByRole('spinbutton', { name: 'Quantity to reserve' }).click();
  await page.getByRole('spinbutton', { name: 'Quantity to reserve' }).fill('999');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.locator('#main').click();
  await page.getByRole('spinbutton', { name: 'Quantity to reserve' }).fill('3');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Cancel reservation' }).first().click();
});