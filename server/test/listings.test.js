import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot } from './helpers.js';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let ctx, base, SUNRISE, CRUMB, CHARITY;
before(async () => {
  ctx = await boot();
  base = ctx.base;
  // cookie strings for three logged-in demo users
  SUNRISE = await ctx.login('sunrise@demo.surplate.sg');
  CRUMB = await ctx.login('crumb@demo.surplate.sg');
  CHARITY = await ctx.login('hope@demo.surplate.sg');
});
after(() => ctx?.close());

const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
const validFields = (over = {}) => ({
  weightGramsPerUnit: '100', itemName: 'Test rolls', description: 'fresh', quantity: '5', dietaryTags: ['vegan'], allergens: ['gluten'],
  pickupStart: inHours(-0.1), pickupEnd: inHours(2), bestBefore: inHours(6),
  address: '56 ENG HOON STREET', postal: '160056', lat: '1.2851', lng: '103.8317', ...over,
});
function form(fields, { photo = PNG } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  if (photo) fd.append('photo', new Blob([photo], { type: 'image/png' }), 'p.png');
  return fd;
}
const call = (path, { user, ...init } = {}) => ctx.call(path, { ...init, as: user });
const create = (fields, user = SUNRISE, opts) => call('/listings', { method: 'POST', user, body: form(fields, opts) });
// Board contents as a verified charity (who sees every listing); visibility rules have their own tests.
const names = async (qs, as = CHARITY) => (await (await call(`/listings?${qs}`, { user: as })).json()).items.map((i) => i.itemName);

describe('creating listings', () => {
  test('a bakery can post a listing with a photo, and it appears on the board', async () => {
    const res = await create(validFields({ itemName: 'Create-me rolls' }));
    assert.equal(res.status, 201);
    const listing = await res.json();
    assert.equal(listing.quantityRemaining, 5);
    assert.equal(listing.bakery.name, 'Sunrise Bakery');
    assert.ok((await names('')).includes('Create-me rolls'));
    const photo = await call(listing.photoUrl.replace('/api', ''), { user: SUNRISE }); // new listings are charities-only by default
    assert.equal(photo.headers.get('content-type'), 'image/png');
  });

  test('requires a signed-in bakery', async () => {
    assert.equal((await create(validFields(), null)).status, 401);
    assert.equal((await create(validFields(), CHARITY)).status, 403);
  });

  test('rejects bad input with per-field messages', async () => {
    const res = await create(
      validFields({ itemName: 'x', quantity: '0', pickupEnd: inHours(-1), bestBefore: 'nonsense', lat: '', lng: '', address: '' }),
      SUNRISE,
      { photo: null }
    );
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    for (const f of ['itemName', 'quantity', 'pickupEnd', 'bestBefore', 'address', 'photo']) assert.ok(fields[f], `expected an error for ${f}`);
  });

  test('rejects windows over 24h, best-before before pickup end, and coordinates outside Singapore', async () => {
    let r = await (await create(validFields({ pickupEnd: inHours(30), bestBefore: inHours(40) }))).json();
    assert.ok(r.fields.pickupEnd);
    r = await (await create(validFields({ bestBefore: inHours(1) }))).json();
    assert.ok(r.fields.bestBefore);
    r = await (await create(validFields({ lat: '51.5', lng: '-0.12' }))).json();
    assert.ok(r.fields.address);
  });

  test('rejects a non-image file even if it claims to be a PNG', async () => {
    const r = await (await create(validFields(), SUNRISE, { photo: Buffer.from('<script>alert(1)</script>') })).json();
    assert.match(r.fields.photo, /JPEG, PNG or WebP/);
  });
});

describe('browsing and expiry', () => {
  test('ended listings and sold-out listings are not on the board', async () => {
    const all = await names('');
    assert.ok(!all.includes('Kaya toast sets'));
    assert.ok(all.includes('Assorted croissants'));
  });

  test('a listing disappears once its pickup window closes', async () => {
    // pickup ends in ~1.2s: valid when created, expired a moment later
    const end = new Date(Date.now() + 1200).toISOString();
    const res = await create(validFields({ itemName: 'Short-lived buns', pickupStart: new Date(Date.now() - 1000).toISOString(), pickupEnd: end, bestBefore: inHours(3) }));
    assert.equal(res.status, 201);
    assert.ok((await names('')).includes('Short-lived buns'));
    await new Promise((r) => setTimeout(r, 1500));
    assert.ok(!(await names('')).includes('Short-lived buns'));
  });

  test('filters: dietary, avoid allergens, ending soon, search', async () => {
    assert.deepEqual((await names('dietary=halal')).sort(), ['Curry puffs', 'Pandan buns']);
    assert.ok(!(await names('avoid=nuts')).includes('Vegan banana bread'));
    assert.ok((await names('endingSoon=true')).includes('Curry puffs'));
    assert.ok(!(await names('endingSoon=true')).includes('Sourdough loaves'));
    assert.deepEqual(await names('q=pandan'), ['Pandan buns']);
    assert.deepEqual(await names('q=.*'), []); // regex characters are treated literally
  });

  test('distance filter returns nearest-first within the radius', async () => {
    const res = await (await call('/listings?lat=1.2999&lng=103.8553&radiusKm=2', { user: CHARITY })).json();
    assert.ok(res.items.length > 0);
    assert.ok(res.items.every((i) => i.distanceKm <= 2));
    assert.deepEqual(res.items.map((i) => i.distanceKm), res.items.map((i) => i.distanceKm).sort((a, b) => a - b));
    assert.ok(res.items.every((i) => i.bakery.name === 'Crumb & Co'));
  });

  test('garbage query params do not crash the board', async () => {
    assert.equal((await call('/listings?lat=abc&lng=&dietary[$ne]=x&q[$gt]=')).status, 200);
  });
});

describe('managing my listings', () => {
  test('edit, ownership, and removal', async () => {
    const { id } = await (await create(validFields({ itemName: 'Manage me' }))).json();

    const mine = await (await call('/listings/mine', { user: SUNRISE })).json();
    assert.ok(mine.items.some((i) => i.id === id));
    assert.ok(!(await (await call('/listings/mine', { user: CRUMB })).json()).items.some((i) => i.id === id));

    // another bakery can't edit or delete it
    assert.equal((await call(`/listings/${id}`, { method: 'PUT', user: CRUMB, body: form(validFields(), { photo: null }) })).status, 403);
    assert.equal((await call(`/listings/${id}`, { method: 'DELETE', user: CRUMB })).status, 403);

    // the owner can edit without re-uploading the photo
    const edited = await call(`/listings/${id}`, { method: 'PUT', user: SUNRISE, body: form(validFields({ itemName: 'Managed!', quantity: '9' }), { photo: null }) });
    assert.equal(edited.status, 200);
    const body = await edited.json();
    assert.equal(body.itemName, 'Managed!');
    assert.equal(body.quantityRemaining, 9);
    assert.ok(body.photoUrl, 'photo is kept');

    assert.equal((await call(`/listings/${id}`, { method: 'DELETE', user: SUNRISE })).status, 204);
    assert.equal((await call(`/listings/${id}`)).status, 404);
    assert.ok(!(await names('')).includes('Managed!'));
  });

  test('quantity cannot be lowered below what is already reserved', async () => {
    const { id } = await (await create(validFields({ itemName: 'Reserved rolls', quantity: '10' }))).json();
    // Simulate the Reservations feature taking 6 items.
    const { default: Listing } = await import('../src/models/Listing.js');
    await Listing.updateOne({ _id: id }, { $inc: { quantityRemaining: -6 } });
    const low = await call(`/listings/${id}`, { method: 'PUT', user: SUNRISE, body: form(validFields({ itemName: 'Reserved rolls', quantity: '4' }), { photo: null }) });
    assert.equal(low.status, 422);
    const original = await Listing.findById(id);
    const ok = await call(`/listings/${id}`, { method: 'PUT', user: SUNRISE, body: form(validFields({ itemName: 'Reserved rolls', quantity: '8', pickupStart: original.pickupStart.toISOString(), pickupEnd: original.pickupEnd.toISOString() }), { photo: null }) });
    assert.equal((await ok.json()).quantityRemaining, 2);
  });

  test('re-post copies an ended listing (photo included) with fresh stock and window', async () => {
    const mine = await (await call('/listings/mine', { user: SUNRISE })).json();
    const old = mine.items.find((i) => i.itemName === 'Kaya toast sets');
    assert.equal(old.phase, 'ended');

    // a listing that is still open can't be edited into the past, and a bad repost is rejected
    const bad = await call(`/listings/${old.id}/repost`, { method: 'POST', user: SUNRISE, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quantity: 0 }) });
    assert.equal(bad.status, 422);

    const res = await call(`/listings/${old.id}/repost`, {
      method: 'POST', user: SUNRISE, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity: 7, pickupStart: inHours(0), pickupEnd: inHours(3), bestBefore: inHours(5) }),
    });
    assert.equal(res.status, 201);
    const copy = await res.json();
    assert.notEqual(copy.id, old.id);
    assert.equal(copy.itemName, 'Kaya toast sets');
    assert.equal(copy.quantityRemaining, 7);
    assert.ok(copy.photoUrl);
    assert.ok((await names('')).includes('Kaya toast sets'));
  });

  test('an ended listing can no longer be edited', async () => {
    const mine = await (await call('/listings/mine', { user: SUNRISE })).json();
    const old = mine.items.find((i) => i.phase === 'ended');
    const res = await call(`/listings/${old.id}`, { method: 'PUT', user: SUNRISE, body: form(validFields(), { photo: null }) });
    assert.equal(res.status, 409);
  });
});

describe('home page stats', () => {
  test('counts only what is currently on the board', async () => {
    const stats = await (await call('/stats')).json();
    const board = (await (await call('/listings')).json()).items;
    assert.equal(stats.listings, board.length);
    assert.equal(stats.items, board.reduce((n, l) => n + l.quantityRemaining, 0));
    assert.equal(stats.bakeries, new Set(board.map((l) => l.bakery.id)).size);
  });
});
