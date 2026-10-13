import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot } from './helpers.js';

let ctx, ADMIN, SUNRISE, CHARITY, ALEX;
before(async () => {
  ctx = await boot();
  ADMIN = await ctx.login('admin@demo.surplate.sg');
  SUNRISE = await ctx.login('sunrise@demo.surplate.sg');
  CHARITY = await ctx.login('hope@demo.surplate.sg');
  ALEX = await ctx.login('alex@demo.surplate.sg');
});
after(() => ctx?.close());

const { call } = new Proxy({}, { get: (_t, k) => (...a) => ctx[k](...a) }); // ctx is set in before()
const post = (path, json, as) => call(path, { method: 'POST', json, as });
const me = async (as) => (await (await call('/auth/me', { as })).json()).user;
let n = 0;
const fresh = (over = {}) => ({ role: 'individual', name: 'Test Person', email: `person${Date.now()}${n++}@example.com`, password: 'Passw0rdOK', ...over });

describe('registration', () => {
  test('an individual registers, is active straight away and is logged in', async () => {
    const body = fresh();
    const res = await post('/auth/register', body);
    assert.equal(res.status, 201);
    const { user } = await res.json();
    assert.equal(user.role, 'individual');
    assert.equal(user.verification.status, 'not_required'); // no verification for individuals
    assert.ok(!('passwordHash' in user));
    const cookie = ctx.cookieFrom(res);
    assert.match(res.headers.getSetCookie().join(';'), /HttpOnly/i); // token is not readable from page JavaScript
    assert.equal((await me(cookie)).email, body.email);
  });

  test('a bakery registers with an address that pre-fills its listings, no verification needed', async () => {
    const res = await post('/auth/register', fresh({ role: 'bakery', name: 'New Bakery', address: '1 Test Road', postal: '123456', lat: 1.3, lng: 103.85 }));
    assert.equal(res.status, 201);
    const { user } = await res.json();
    assert.equal(user.verification.status, 'not_required');
    assert.equal(user.lat, 1.3);
  });

  test('a charity needs a registration number and starts out pending', async () => {
    const missing = await post('/auth/register', fresh({ role: 'charity', name: 'Helping Hands' }));
    assert.equal(missing.status, 422);
    assert.ok((await missing.json()).fields.registrationNo);

    const res = await post('/auth/register', fresh({ role: 'charity', name: 'Helping Hands', registrationNo: 'T08GB0054G' }));
    assert.equal(res.status, 201);
    assert.equal((await res.json()).user.verification.status, 'pending');
  });

  test('rejects bad input field by field, and duplicate emails', async () => {
    const res = await post('/auth/register', { role: 'individual', name: 'x', email: 'nope', password: 'short' });
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    for (const f of ['name', 'email', 'password']) assert.ok(fields[f], `expected an error for ${f}`);

    assert.equal((await post('/auth/register', fresh({ password: 'allletters' }))).status, 422); // needs a number
    const dupe = await post('/auth/register', fresh({ email: 'ALEX@demo.surplate.sg' })); // case-insensitive
    assert.equal(dupe.status, 409);
    assert.ok((await dupe.json()).fields.email);
  });

  test('nobody can register as an admin, or pick a role that does not exist', async () => {
    assert.equal((await post('/auth/register', fresh({ role: 'admin' }))).status, 422);
    assert.equal((await post('/auth/register', fresh({ role: 'superuser' }))).status, 422);
  });
});

describe('logging in and out', () => {
  test('logs in with the right password and out again', async () => {
    const res = await post('/auth/login', { email: 'Alex@Demo.surplate.sg', password: 'demo1234' });
    assert.equal(res.status, 200);
    const cookie = ctx.cookieFrom(res);
    assert.equal((await me(cookie)).name, 'Alex Tan');

    const out = await call('/auth/logout', { method: 'POST', as: cookie });
    assert.equal(out.status, 204);
    assert.match(out.headers.getSetCookie().join(';'), /sp_token=;/); // cookie cleared
    assert.equal(await me(), null); // guests get user: null, not an error
  });

  test('wrong password and unknown email give the same message', async () => {
    const a = await post('/auth/login', { email: 'alex@demo.surplate.sg', password: 'wrong-password1' });
    const b = await post('/auth/login', { email: 'nobody@example.com', password: 'wrong-password1' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal((await a.json()).error, (await b.json()).error);
  });

  test('five wrong passwords lock the account for a while, even for the right password', async () => {
    const email = 'goldenloaf@demo.surplate.sg';
    for (let i = 0; i < 5; i++) assert.equal((await post('/auth/login', { email, password: 'bad-password1' })).status, 401);
    assert.equal((await post('/auth/login', { email, password: 'demo1234' })).status, 429);
  });

  test('a tampered login cookie is treated as logged out', async () => {
    assert.equal(await me('sp_token=not.a.real.token'), null);
  });
});

describe('profile', () => {
  test('edits details; a charity changing its registration number goes back to pending', async () => {
    const edited = await call('/auth/me', { method: 'PUT', as: ALEX, json: { name: 'Alex T.', phone: '+65 9123 4567' } });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).user.name, 'Alex T.');

    const bad = await call('/auth/me', { method: 'PUT', as: ALEX, json: { name: '', phone: 'abc' } });
    assert.equal(bad.status, 422);

    const same = await call('/auth/me', { method: 'PUT', as: CHARITY, json: { name: 'Hope Kitchen', registrationNo: 'DEMO-CHARITY-001' } });
    assert.equal((await same.json()).user.verification.status, 'approved'); // unchanged number keeps approval
    const changed = await call('/auth/me', { method: 'PUT', as: CHARITY, json: { name: 'Hope Kitchen', registrationNo: 'DEMO-CHARITY-999' } });
    assert.equal((await changed.json()).user.verification.status, 'pending');
  });

  test('changing the password needs the current one', async () => {
    const reg = await post('/auth/register', fresh());
    const cookie = ctx.cookieFrom(reg);
    const { user } = await reg.json();

    const wrong = await call('/auth/me', { method: 'PUT', as: cookie, json: { name: user.name, currentPassword: 'nope-nope1', newPassword: 'BrandNew123' } });
    assert.equal(wrong.status, 422);
    assert.ok((await wrong.json()).fields.currentPassword);

    const ok = await call('/auth/me', { method: 'PUT', as: cookie, json: { name: user.name, currentPassword: 'Passw0rdOK', newPassword: 'BrandNew123' } });
    assert.equal(ok.status, 200);
    assert.equal((await post('/auth/login', { email: user.email, password: 'Passw0rdOK' })).status, 401);
    assert.equal((await post('/auth/login', { email: user.email, password: 'BrandNew123' })).status, 200);
  });

  test('deleting an account needs the password; a bakery takes its listings off the board', async () => {
    const reg = await post('/auth/register', fresh({ role: 'bakery', name: 'Doomed Bakery', address: '1 Test Road', lat: 1.3, lng: 103.85 }));
    const cookie = ctx.cookieFrom(reg);
    const { user } = await reg.json();
    const fd = new FormData();
    const when = (h) => new Date(Date.now() + h * 3600e3).toISOString();
    Object.entries({ itemName: 'Doomed buns', quantity: 3, pickupStart: when(-0.1), pickupEnd: when(2), bestBefore: when(5), address: '1 Test Road', lat: 1.3, lng: 103.85, visibleToIndividuals: true }).forEach(([k, v]) => fd.append(k, v));
    fd.append('photo', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'p.png');
    assert.equal((await call('/listings', { method: 'POST', as: cookie, body: fd })).status, 201);
    const onBoard = async () => (await (await call('/listings')).json()).items.some((l) => l.itemName === 'Doomed buns'); // as a guest
    assert.ok(await onBoard());

    const wrong = await call('/auth/me', { method: 'DELETE', as: cookie, json: { password: 'not-my-password1' } });
    assert.equal(wrong.status, 422);
    assert.equal((await call('/auth/me', { method: 'DELETE', as: cookie, json: { password: 'Passw0rdOK' } })).status, 204);

    assert.equal(await me(cookie), null); // the old cookie no longer maps to an account
    assert.equal((await post('/auth/login', { email: user.email, password: 'Passw0rdOK' })).status, 401);
    assert.ok(!(await onBoard()));
  });

  test('guests cannot edit or delete, and admins cannot delete themselves', async () => {
    assert.equal((await call('/auth/me', { method: 'PUT', json: { name: 'x' } })).status, 401);
    assert.equal((await call('/auth/me', { method: 'DELETE', json: { password: 'demo1234' } })).status, 401);
    assert.equal((await call('/auth/me', { method: 'DELETE', as: ADMIN, json: { password: 'demo1234' } })).status, 403);
  });
});

describe('charity verification (admin)', () => {
  const queue = async (status) => (await (await call(`/admin/charities?status=${status}`, { as: ADMIN })).json());

  test('only admins can see or use the queue', async () => {
    for (const as of [undefined, ALEX, SUNRISE, CHARITY]) {
      assert.equal((await call('/admin/charities', { as })).status, as ? 403 : 401);
    }
  });

  test('approve and reject, with a reason that the charity can read', async () => {
    const reg = await post('/auth/register', fresh({ role: 'charity', name: 'Queue Charity', registrationNo: 'QUEUE-0001' }));
    const cookie = ctx.cookieFrom(reg);
    const { user } = await reg.json();
    const before = await queue('pending');
    assert.ok(before.items.some((c) => c.id === user.id));

    const noReason = await post(`/admin/charities/${user.id}/decision`, { decision: 'reject' }, ADMIN);
    assert.equal(noReason.status, 422);

    const rejected = await post(`/admin/charities/${user.id}/decision`, { decision: 'reject', note: 'Registration number not found.' }, ADMIN);
    assert.equal(rejected.status, 200);
    const seen = await me(cookie);
    assert.equal(seen.verification.status, 'rejected');
    assert.equal(seen.verification.note, 'Registration number not found.');

    // fixing the number puts them back in the queue, and an approval clears the note
    await call('/auth/me', { method: 'PUT', as: cookie, json: { name: 'Queue Charity', registrationNo: 'QUEUE-0002' } });
    assert.equal((await me(cookie)).verification.status, 'pending');
    assert.equal((await post(`/admin/charities/${user.id}/decision`, { decision: 'approve' }, ADMIN)).status, 200);
    const approved = await me(cookie);
    assert.equal(approved.verification.status, 'approved');
    assert.equal(approved.verification.note, '');

    const counts = (await queue('approved')).counts;
    assert.ok(counts.approved >= 1);
  });

  test('decisions only apply to charities', async () => {
    const alex = await me(ALEX);
    assert.equal((await post(`/admin/charities/${alex.id}/decision`, { decision: 'approve' }, ADMIN)).status, 404);
    assert.equal((await post('/admin/charities/not-an-id/decision', { decision: 'approve' }, ADMIN)).status, 404);
  });
});
