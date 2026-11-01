# E2E testing (Playwright)

## Do I need to connect a database?

No. If `server/.env` has no `MONGODB_URI`, the server (`server/src/db.js`) starts a
**temporary in-memory MongoDB** and seeds it with demo data. On startup it prints:

```
No MONGODB_URI set: using a temporary in-memory MongoDB (data is lost on restart).
```

The database is wiped on every restart, so IDs (listings, reservations) change every time.

## One-time setup

```bash
npm run install:all
npx playwright install chromium
```

## Running the tests

```bash
npm run test:e2e
```

Don't start anything first. Playwright (`playwright.config.js`) starts its own throwaway stack:

- API on **:3100** with a fresh in-memory DB
- Web app on **:5273**, which sends API calls to the :3100 API

Then it runs everything in `e2e/` and shuts the stack down.

Useful variants:

```bash
npx playwright test e2e/reservations.spec.js   # one file
npx playwright test --headed                   # watch the browser
npx playwright test --ui                       # interactive runner
npx playwright show-report                     # open the last HTML report
```

## Writing a new test

1. Start the app: `npm run dev` (web on http://localhost:5173).
2. Record a flow: `npx playwright codegen localhost:5173`.
3. Clean up the recording before saving it in `e2e/`:
   - Import from the local helper: `import { test, expect } from './test.js';`
   - Use **relative URLs** (`page.goto('/login')`), never `http://localhost:5173/...`.
     The tests run on :5273 and `baseURL` fills in the host.
   - **No hardcoded IDs.** Look things up by name through the API, for example:
     ```js
     const pandanBuns = async (page) =>
       (await (await page.request.get('/api/listings')).json()).items.find((l) => l.itemName === 'Pandan buns');
     ```
   - **No hardcoded slot timestamps.** Use `selectOption({ index: 1 })`.
   - Delete trailing recorded `page.goto(...)` redirects and replace them with assertions.
   - **Add `expect(...)` checks.** Without them a test only proves the clicks didn't crash.
     ```js
     await expect(page).toHaveURL(/\/reservations\?reserved=/);
     await expect(page.getByText(/You can reserve at most \d+/)).toBeVisible();
     ```
   - Give each test a descriptive name (not `'test'`).
4. Stop the dev server, then run `npx playwright test e2e/<your-file>.spec.js`.

Logging in quickly (skips the UI), as done in `reservations.spec.js`:

```js
async function login(page, name) {
  const res = await page.request.post('/api/auth/login', {
    data: { email: `${name}@demo.surplate.sg`, password: 'demo1234' },
  });
  expect(res.ok()).toBe(true);
}
```

## Before committing

```bash
npm test   # server tests, then e2e tests
```

## Is the database up? (during `npm run dev`)

- Open http://localhost:5173. If you can see listings (e.g. Pandan buns), it's working.
- Or check the API health endpoint `/api/stats`. It should return JSON.
