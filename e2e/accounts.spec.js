import { expect, test } from './test.js';

const PASSWORD = 'Passw0rdOK';
let counter = 0;
const uniqueEmail = (tag) => `${tag}.${Date.now().toString(36)}${counter++}@example.com`;
const nav = (page) => page.getByTestId('account-nav');

// OneMap is mocked (see listings.spec.js): the real lookup is covered by the API tests.
async function mockGeocode(page) {
  await page.route('**/api/geocode*', (route) =>
    route.fulfill({ json: { results: [{ address: '56 ENG HOON STREET SINGAPORE 160056', postal: '160056', lat: 1.2851, lng: 103.8317 }] } })
  );
}

async function signUp(page, { role, name, email = uniqueEmail(role), password = PASSWORD, registrationNo }) {
  await page.goto(`/register?role=${role}`);
  await page.getByLabel(role === 'bakery' ? 'Business name' : role === 'charity' ? 'Organisation name' : 'Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  if (registrationNo) await page.getByLabel('Registration number').fill(registrationNo);
  // wait for the server's reply: the login cookie is set by then, so it is safe to navigate on
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/auth/register')), page.getByTestId('register-submit').click()]);
  return email;
}

async function logIn(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await Promise.all([page.waitForResponse((r) => r.url().includes('/api/auth/login')), page.getByTestId('login-submit').click()]);
}

test.describe('signing up', () => {
  test('an individual signs up, is active at once (no verification), and can log out', async ({ page }) => {
    await expect(async () => {
      await page.goto('/');
      await expect(nav(page).getByTestId('nav-login')).toBeVisible(); // a guest sees Log in / Sign up
    }).toPass();

    await signUp(page, { role: 'individual', name: 'Indy Viduals' });
    await expect(page).toHaveURL(/\/browse$/);
    await expect(nav(page)).toContainText('Indy Viduals');
    await expect(nav(page)).toContainText('Individual');
    await expect(nav(page)).not.toContainText('Pending');

    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(nav(page).getByTestId('nav-login')).toBeVisible();
  });

  test('a bakery signs up from the home page and its saved address pre-fills new listings', async ({ page }) => {
    await mockGeocode(page);
    await page.goto('/');
    await page.getByTestId('cta-bakery').click();
    await expect(page).toHaveURL(/\/register\?role=bakery$/);
    await expect(page.getByLabel('Bakery / restaurant')).toBeChecked();

    await page.getByLabel('Business name').fill('Fresh Crust');
    await page.getByLabel('Email').fill(uniqueEmail('bakery'));
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel(/Pickup address/).fill('eng hoon');
    await page.getByRole('option', { name: /56 ENG HOON/ }).click();
    await page.getByTestId('register-submit').click();

    // straight on to posting their first listing, address already filled in
    await expect(page).toHaveURL(/\/listings\/new$/);
    await expect(page.getByLabel('Pickup address')).toHaveValue(/56 ENG HOON STREET/);
    await expect(nav(page)).toContainText('Bakery / restaurant');
    await expect(page.getByRole('link', { name: 'My listings' })).toBeVisible();
  });

  test('a charity must give a registration number and then waits for verification', async ({ page }) => {
    await page.goto('/register?role=charity');
    await expect(page.getByTestId('charity-note')).toContainText('An admin checks your registration number');
    await page.getByLabel('Organisation name').fill('Helping Hands');
    await page.getByLabel('Email').fill(uniqueEmail('charity'));
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByTestId('register-submit').click();
    await expect(page.getByText('Enter your charity or UEN registration number')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);

    await page.getByLabel('Registration number').fill('T08GB0054G');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('verification-banner')).toContainText('Waiting for verification');
    await expect(nav(page)).toContainText('Pending');

    // a pending charity has no admin powers
    await page.goto('/admin/charities');
    await expect(page.getByTestId('forbidden')).toBeVisible();
  });

  test('shows clear errors for bad details and for an email that is already registered', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-submit').click();
    await expect(page.getByText('Name must be at least 2 characters.')).toBeVisible();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();

    await page.getByLabel('Your name').fill('Dup Licate');
    await page.getByLabel('Email').fill('alex@demo.surplate.sg'); // already seeded
    await page.getByLabel('Password', { exact: true }).fill('onlyletters');
    await expect(page.getByText('Password must contain at least one letter and one number.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByTestId('register-submit').click();
    await expect(page.getByText('An account with this email already exists')).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('logging in', () => {
  test('wrong password is refused with one generic message; the password can be shown', async ({ page }) => {
    await logIn(page, 'alex@demo.surplate.sg', 'not-the-password1');
    await expect(page.getByTestId('login-error')).toHaveText('Incorrect email or password.');
    await expect(page).toHaveURL(/\/login/);

    const field = page.getByLabel('Password', { exact: true });
    await expect(field).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(field).toHaveAttribute('type', 'text');
  });

  test('the demo account buttons fill in a working login for each role', async ({ page }) => {
    await page.goto('/login');
    await page.getByText('Demo accounts').click();
    await page.getByRole('button', { name: 'Bakery', exact: true }).click();
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/my-listings$/); // bakeries land on their listings
    await expect(nav(page)).toContainText('Sunrise Bakery');
  });

  test('a logged-in user is kept away from the login and sign-up pages', async ({ page }) => {
    await logIn(page, 'alex@demo.surplate.sg', 'demo1234');
    await expect(page).toHaveURL(/\/browse$/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/$/);
  });

  test('the home page offers a bakery its own next step, not sign-up', async ({ page }) => {
    await logIn(page, 'sunrise@demo.surplate.sg', 'demo1234');
    await page.goto('/');
    await expect(page.getByTestId('cta-post')).toBeVisible();
    await expect(page.getByTestId('cta-bakery')).toHaveCount(0);
  });
});

test.describe('my account', () => {
  test('edits details, changes the password, and logs in with the new one', async ({ page }) => {
    const email = await signUp(page, { role: 'individual', name: 'Pat Profile' });
    await page.goto('/profile');
    await page.getByLabel('Name', { exact: true }).fill('Patricia Profile');
    await page.getByLabel('Phone').fill('+65 9123 4567');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-saved')).toBeVisible();
    await expect(nav(page)).toContainText('Patricia Profile');

    // wrong current password is refused
    await page.getByLabel('Current password').fill('wrong-wrong1');
    await page.getByLabel('New password').fill('BrandNew123');
    await page.getByTestId('profile-save').click();
    await expect(page.getByText('Your current password is not correct.')).toBeVisible();

    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-saved')).toBeVisible();

    await page.getByTestId('logout').click();
    await logIn(page, email, PASSWORD);
    await expect(page.getByTestId('login-error')).toBeVisible(); // old password no longer works
    await page.getByLabel('Password', { exact: true }).fill('BrandNew123');
    await page.getByTestId('login-submit').click();
    await expect(nav(page)).toContainText('Patricia Profile');
  });

  test('deletes the account after confirming with the password', async ({ page }) => {
    const email = await signUp(page, { role: 'individual', name: 'Gone Soon' });
    await page.goto('/profile');
    await page.getByTestId('delete-account').click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Password', { exact: true }).fill('wrong-wrong1');
    await dialog.getByRole('button', { name: 'Delete account' }).click();
    await expect(dialog.getByText('That password is not correct.')).toBeVisible();

    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Delete account' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(nav(page).getByTestId('nav-login')).toBeVisible();

    await logIn(page, email, PASSWORD);
    await expect(page.getByTestId('login-error')).toBeVisible();
  });
});

test.describe('charity verification', () => {
  test('an admin approves one charity and rejects another with a reason the charity can read', async ({ page, request, browser }) => {
    // two fresh charities, registered through the API in their own cookie jar
    const name = (tag) => `${tag} Charity ${Date.now().toString(36)}`;
    const approveMe = { name: name('Approve'), email: uniqueEmail('approve') };
    const rejectMe = { name: name('Reject'), email: uniqueEmail('reject') };
    for (const c of [approveMe, rejectMe]) {
      const res = await request.post('/api/auth/register', { data: { role: 'charity', name: c.name, email: c.email, password: PASSWORD, registrationNo: 'REG-12345' } });
      expect(res.status()).toBe(201);
    }

    await logIn(page, 'admin@demo.surplate.sg', 'demo1234');
    await expect(page).toHaveURL(/\/admin\/charities$/);
    const row = (n) => page.getByTestId('charity-row').filter({ hasText: n });
    await expect(row(approveMe.name)).toContainText('REG-12345');
    await expect(row('New Hope Shelter')).toBeVisible(); // seeded, waiting in the queue

    await row(approveMe.name).getByRole('button', { name: `Approve ${approveMe.name}`, exact: true }).click();
    await expect(page.getByTestId('flash')).toContainText(`${approveMe.name} was approved`);
    await expect(row(approveMe.name)).toHaveCount(0);

    // rejecting needs a reason
    await row(rejectMe.name).getByRole('button', { name: `Reject ${rejectMe.name}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(dialog.getByText('Tell the charity why')).toBeVisible();
    await dialog.getByLabel(/Reason/).fill('We could not find this registration number.');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByTestId('flash')).toContainText(`${rejectMe.name} was rejected`);
    await page.getByTestId('tab-rejected').click();
    await expect(row(rejectMe.name)).toContainText('We could not find this registration number.');

    // each charity sees its own outcome
    const other = await browser.newContext();
    const charityPage = await other.newPage();
    await logIn(charityPage, approveMe.email, PASSWORD);
    await expect(charityPage.getByTestId('verification-banner')).toContainText('Verified charity');
    await expect(charityPage.getByTestId('account-nav')).not.toContainText('Pending');
    await charityPage.getByTestId('logout').click();
    await logIn(charityPage, rejectMe.email, PASSWORD);
    await expect(charityPage.getByTestId('verification-banner')).toContainText('We could not find this registration number.');
    await other.close();
  });

  test('only admins can open the verification page', async ({ page }) => {
    await logIn(page, 'alex@demo.surplate.sg', 'demo1234');
    await page.goto('/admin/charities');
    await expect(page.getByTestId('forbidden')).toBeVisible();
    expect((await page.request.get('/api/admin/charities')).status()).toBe(403);
  });
});
