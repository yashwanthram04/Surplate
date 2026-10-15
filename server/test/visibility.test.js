import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot } from './helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// the demo listings that the seeded bakeries share only with charities
const CHARITY_ONLY = ['Sourdough loaves', 'Chocolate muffins', 'Curry puffs'];

let ctx, SUNRISE, CRUMB, VERIFIED_CHARITY, ADMIN, INDIVIDUAL, PENDING_CHARITY;
before(async () => {
  ctx = await boot();
  [SUNRISE, CRUMB, VERIFIED_CHARITY, ADMIN, INDIVIDUAL, PENDING_CHARITY] = await Promise.all(
    ['sunrise', 'crumb', 'hope', 'admin', 'alex', 'newhope'].map((n) => ctx.login(`${n}@demo.surplate.sg`))
  );
});
after(() => ctx?.close());

const call = (path, as, init = {}) => ctx.call(path, { ...init, as });
const board = async (as) => (await (await call('/listings', as)).json()).items;
const boardNames = async (as) => (await board(as)).map((l) => l.itemName);

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();
function listingForm(over = {}) {
  const fd = new FormData();
  const fields = { weightGramsPerUnit: 100, itemName: 'Visibility test buns', quantity: 4, pickupStart: inHours(-0.1), pickupEnd: inHours(2), bestBefore: inHours(5), address: '56 ENG HOON STREET', lat: 1.2851, lng: 103.8317, ...over };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('photo', new Blob([PNG], { type: 'image/png' }), 'p.png');
  return fd;
}
const create = (over, as = SUNRISE) => call('/listings', as, { method: 'POST', body: listingForm(over) });
const put = (id, over, as = SUNRISE) => call(`/listings/${id}`, as, { method: 'PUT', body: listingForm(over) });

describe('who sees which listings on the board', () => {
  test('guests, individuals and pending charities only see what is shared with individuals', async () => {
    for (const as of [undefined, INDIVIDUAL, PENDING_CHARITY]) {
      const names = await boardNames(as);
      assert.ok(names.includes('Assorted croissants'), 'shared listing is visible');
      for (const hidden of CHARITY_ONLY) assert.ok(!names.includes(hidden), `${hidden} should be hidden`);
    }
  });

  test('a bakery sees the shared listings plus its own charity-only ones, but not charity-only ones from other bakeries', async () => {
    const names = await boardNames(CRUMB);
    assert.ok(names.includes('Assorted croissants'));
    assert.ok(names.includes('Chocolate muffins'), 'its own charity-only listing');
    assert.ok(!names.includes('Sourdough loaves'), "another bakery's charity-only listing");
    assert.ok(!names.includes('Curry puffs'));
    // and text search keeps working alongside that rule
    const found = (await (await call('/listings?q=muffins', CRUMB)).json()).items.map((l) => l.itemName);
    assert.deepEqual(found, ['Chocolate muffins']);
  });

  test('verified charities and admins see everything', async () => {
    for (const as of [VERIFIED_CHARITY, ADMIN]) {
      const names = await boardNames(as);
      for (const listing of CHARITY_ONLY) assert.ok(names.includes(listing), `${listing} should be visible`);
    }
  });

  test('filters and the distance search respect the same rule', async () => {
    const asGuest = async (qs) => (await (await call(`/listings?${qs}`)).json()).items.map((i) => i.itemName);
    assert.deepEqual(await asGuest('dietary=halal'), ['Pandan buns']); // Curry puffs are charity-only
    assert.ok(!(await asGuest('q=curry')).includes('Curry puffs'));
    const near = await (await call('/listings?lat=1.3527&lng=103.9449&radiusKm=2')).json(); // Tampines
    assert.ok(!near.items.some((i) => i.itemName === 'Curry puffs'));
    assert.ok((await (await call('/listings?q=curry', VERIFIED_CHARITY)).json()).items.some((i) => i.itemName === 'Curry puffs'));
  });

  test('the home page counts match what the visitor can actually see', async () => {
    const asGuest = await (await call('/stats')).json();
    const asCharity = await (await call('/stats', VERIFIED_CHARITY)).json();
    assert.equal(asGuest.listings, (await board()).length);
    assert.equal(asCharity.listings, (await board(VERIFIED_CHARITY)).length);
    assert.ok(asCharity.listings > asGuest.listings);
  });
});

describe('opening a hidden listing directly', () => {
  let hidden;
  before(async () => {
    hidden = (await board(VERIFIED_CHARITY)).find((l) => l.itemName === 'Sourdough loaves');
  });

  test('is a 404 for people who may not see it, photo included, so nothing leaks', async () => {
    for (const as of [undefined, INDIVIDUAL, PENDING_CHARITY, CRUMB]) {
      assert.equal((await call(`/listings/${hidden.id}`, as)).status, 404);
      assert.equal((await call(hidden.photoUrl.replace('/api', ''), as)).status, 404);
    }
  });

  test('works for verified charities, admins and the bakery that owns it', async () => {
    for (const as of [VERIFIED_CHARITY, ADMIN, SUNRISE]) {
      assert.equal((await call(`/listings/${hidden.id}`, as)).status, 200);
      assert.equal((await call(hidden.photoUrl.replace('/api', ''), as)).status, 200);
    }
  });

  test('a bakery sees its own charity-only listings under My listings', async () => {
    const mine = (await (await call('/listings/mine', SUNRISE)).json()).items;
    assert.equal(mine.find((l) => l.itemName === 'Sourdough loaves').visibleToIndividuals, false);
  });
});

describe('a bakery choosing who sees a listing', () => {
  test('new listings have priority even when an old client sets the sharing flag', async () => {
    const hidden = await (await create({ itemName: 'Default-hidden rolls' })).json();
    assert.equal(hidden.visibleToIndividuals, false);
    assert.ok(!(await boardNames(INDIVIDUAL)).includes('Default-hidden rolls'));
    assert.ok((await boardNames(VERIFIED_CHARITY)).includes('Default-hidden rolls'));

    const shared = await (await create({ itemName: 'Shared rolls', visibleToIndividuals: true })).json();
    assert.equal(shared.visibleToIndividuals, true);
    assert.ok(!(await boardNames(INDIVIDUAL)).includes('Shared rolls'));
    assert.ok(!(await boardNames()).includes('Shared rolls'));
  });

  test('editing does not restart or bypass priority', async () => {
    const original = await (await create({ itemName: 'Toggle rolls' })).json();
    await put(original.id, { itemName: 'Toggle rolls', visibleToIndividuals: true });
    const updated = await (await call(`/listings/${original.id}`, SUNRISE)).json();
    assert.equal(updated.priorityUntil, original.priorityUntil);
    assert.equal((await call(`/listings/${original.id}`, INDIVIDUAL)).status, 404);
  });

  test('re-posting keeps the original choice', async () => {
    const past = (await (await call('/listings/mine', SUNRISE)).json()).items.find((l) => l.itemName === 'Kaya toast sets'); // seeded as shared
    assert.equal(past.visibleToIndividuals, true);
    const res = await call(`/listings/${past.id}/repost`, SUNRISE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 5, pickupStart: inHours(0), pickupEnd: inHours(2), bestBefore: inHours(4) }),
    });
    assert.equal((await res.json()).visibleToIndividuals, true);
  });
});

describe('charity verification changes what a charity can see', () => {
  test('a new charity sees the public board until an admin approves it, then everything', async () => {
    const reg = await ctx.call('/auth/register', {
      method: 'POST',
      json: { role: 'charity', name: 'Vis Charity', email: `vis${Date.now()}@example.com`, password: 'Passw0rdOK', registrationNo: 'VIS-00001' },
    });
    const cookie = ctx.cookieFrom(reg);
    const { user } = await reg.json();
    assert.ok(!(await boardNames(cookie)).includes('Curry puffs'));

    assert.equal((await call(`/admin/charities/${user.id}/decision`, ADMIN, { method: 'POST', json: { decision: 'approve' } })).status, 200);
    assert.ok((await boardNames(cookie)).includes('Curry puffs'));
  });
});
