import { test as base, expect } from '@playwright/test';

// Same as Playwright's `test`, but a test also fails if the page throws an uncaught error or an
// unhandled promise rejection. Those can pass every assertion and still be real bugs.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(page);
    expect(errors, 'the page threw uncaught errors').toEqual([]);
  },
});

export { expect };
