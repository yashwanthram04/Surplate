import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Listing from '../src/models/Listing.js';
import Reservation from '../src/models/Reservation.js';
import User from '../src/models/User.js';
import { canView, visibilityFilter } from '../src/utils/visibility.js';
import { slotsFor } from '../src/utils/slots.js';
import { boot } from './helpers.js';

let ctx, bakery, charity, individual, pending, otherBakery, recipient, owner;
before(async () => {
  ctx = await boot();
  [bakery, charity, individual, pending, otherBakery] = await Promise.all(
    ['sunrise', 'hope', 'alex', 'newhope', 'crumb'].map((n) => ctx.login(`${n}@demo.surplate.sg`))
  );
  owner = await User.findOne({ role: 'bakery', name: 'Sunrise Bakery' });
  recipient = await User.findOne({ role: 'individual' });
});
after(() => ctx?.close());
const call = (path, as, json, method = 'POST') => ctx.call(path, { as, json, method });
async function listing(overrides = {}) {
  const source = (await Listing.findOne({ itemName: 'Assorted croissants' })).toObject();
  delete source._id;
  return Listing.create({ ...source, itemName: `Impact test ${Date.now()}`, quantity: 5, quantityRemaining: 5,
    weightGramsPerUnit: 250, priorityUntil: new Date(Date.now() - 1000), ...overrides });
}
const openSlot = (l) => slotsFor(l).find((s) => s.end > new Date()).start.toISOString();
const reserve = (l, as = individual, quantity = 1) => call('/reservations', as, { listingId: String(l._id), quantity, slotStart: openSlot(l) });
const collect = (r, as) => call(`/reservations/${r.id}/collect`, as, { code: r.code });
async function newRecipient(email) {
  const res = await ctx.call('/auth/register', { method: 'POST', json: { name: 'Test recipient', email, password: 'Passw0rdOK', role: 'individual' } });
  assert.equal(res.status, 201);
  return ctx.cookieFrom(res);
}
const impact = async (as, query = '') => (await ctx.call(`/impact${query}`, { as })).json();

test('priority boundary is identical in the query and direct access rules', async () => {
  const boundary = new Date('2030-01-01T00:15:00Z');
  const l = await listing({ priorityUntil: boundary });
  const before = new Date(boundary.getTime() - 1);
  assert.equal(canView(l, recipient, before), false);
  assert.equal(canView(l, recipient, boundary), true);
  assert.equal(await Listing.countDocuments({ _id: l._id, ...visibilityFilter(recipient, before) }), 0);
  assert.equal(await Listing.countDocuments({ _id: l._id, ...visibilityFilter(recipient, boundary) }), 1);
});

test('priority blocks individual and pending charity API access; verified charity can reserve', async () => {
  const l = await listing({ priorityUntil: new Date(Date.now() + 60000), visibleToIndividuals: true });
  for (const as of [individual, pending]) {
    assert.equal((await reserve(l, as)).status, 404);
    assert.equal((await ctx.call(`/listings/${l.id}`, { as })).status, 404);
    assert.equal((await ctx.call(`/listings/${l.id}/photo`, { as })).status, 404);
    assert.equal((await (await ctx.call(`/listings?q=${encodeURIComponent(l.itemName)}`, { as })).json()).items.some((r) => r.id === l.id), false);
  }
  assert.equal((await reserve(l, charity)).status, 201);
  await Listing.updateOne({ _id: l.id }, { priorityUntil: new Date(Date.now() - 1) });
  assert.equal((await reserve(l)).status, 201);
});

test('concurrent reservations cannot oversell stock', async () => {
  const l = await listing({ quantity: 1, quantityRemaining: 1 });
  const results = await Promise.all([reserve(l), reserve(l, charity), reserve(l, pending)]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal((await Listing.findById(l.id)).quantityRemaining, 0);
  assert.equal(await Reservation.countDocuments({ listing: l.id }), 1);
});

test('failure to create history rolls back the stock decrement', async () => {
  const l = await listing();
  const original = Reservation.create;
  Reservation.create = async () => { throw Object.assign(new Error('Simulated write failure'), { status: 503 }); };
  try { assert.equal((await reserve(l)).status, 503); }
  finally { Reservation.create = original; }
  assert.equal((await Listing.findById(l.id)).quantityRemaining, 5);
  assert.equal(await Reservation.countDocuments({ listing: l.id }), 0);
});

test('only eligible recipients can reserve and invalid quantities are rejected', async () => {
  const l = await listing();
  assert.equal((await reserve(l, bakery)).status, 403);
  assert.equal((await reserve(l, null)).status, 401);
  for (const quantity of [0, -1, 1.5, '2', 501]) assert.equal((await reserve(l, individual, quantity)).status, 422);
  assert.equal((await reserve(l, individual, 6)).status, 409);
});

test('collection is bakery-scoped, counts once, and preserves the original weight', async () => {
  const l = await listing();
  const before = await impact(bakery);
  const r = await (await reserve(l, individual, 2)).json();
  assert.equal((await impact(bakery)).mine.collectedKg, before.mine.collectedKg);
  assert.equal((await collect(r, individual)).status, 403);
  assert.equal((await collect(r, otherBakery)).status, 403);
  await Listing.updateOne({ _id: l.id }, { weightGramsPerUnit: 999 });
  assert.equal((await collect(r, bakery)).status, 200);
  assert.equal((await collect(r, bakery)).status, 409);
  assert.equal((await call(`/reservations/${r.id}/cancel`, individual)).status, 409);
  const after = await impact(bakery);
  assert.equal(after.mine.collectedKg - before.mine.collectedKg, 0.5);
  assert.equal(after.platform.collectedKg - before.platform.collectedKg, 0.5);
  assert.equal(after.mine.estimatedMeals - before.mine.estimatedMeals, 1);
  assert.equal(after.mine.collections - before.mine.collections, 1);
});

test('cancellation restores stock once and cannot be performed by another recipient', async () => {
  const l = await listing();
  const r = await (await reserve(l, individual, 2)).json();
  assert.equal((await call(`/reservations/${r.id}/cancel`, charity)).status, 403);
  assert.equal((await call(`/reservations/${r.id}/cancel`, individual)).status, 200);
  assert.equal((await call(`/reservations/${r.id}/cancel`, individual)).status, 409);
  assert.equal((await Listing.findById(l.id)).quantityRemaining, 5);
});

test('future and missed collections cannot be confirmed; history reports a miss', async () => {
  const as = await newRecipient('missed-history@example.com'); // a miss lowers reliability, so keep it off the shared demo account
  const l = await listing({ pickupStart: new Date(Date.now() + 30000) });
  const r = await (await reserve(l, as)).json();
  assert.equal((await collect(r, bakery)).status, 409);
  await Reservation.updateOne({ _id: r.id }, { pickupStart: new Date(Date.now() - 3600000), slotEnd: new Date(Date.now() - 3600000) });
  assert.equal((await collect(r, bakery)).status, 409);
  const history = await (await ctx.call('/reservations/mine', { as })).json();
  assert.equal(history.items.find((row) => row.id === r.id).status, 'missed');
});

test('history is scoped to its recipient and paginated', async () => {
  const l = await listing();
  const r = await (await reserve(l)).json();
  const own = await (await ctx.call('/reservations/mine', { as: individual })).json();
  const other = await (await ctx.call('/reservations/mine', { as: charity })).json();
  assert.ok(own.items.some((row) => row.id === r.id));
  assert.ok(!other.items.some((row) => row.id === r.id));
  const blank = await (await ctx.call('/reservations/mine?page=100', { as: individual })).json();
  assert.deepEqual(blank.items, []);
});

test('removal cancels open reservations and preserves completed impact', async () => {
  const l = await listing();
  const collected = await (await reserve(l)).json();
  const open = await (await reserve(l)).json();
  await collect(collected, bakery);
  const before = await impact(bakery);
  assert.equal((await ctx.call(`/listings/${l.id}`, { method: 'DELETE', as: bakery })).status, 204);
  assert.equal((await Reservation.findById(open.id)).status, 'cancelled');
  assert.equal((await Reservation.findById(collected.id)).status, 'collected');
  assert.equal((await impact(bakery)).mine.collectedKg, before.mine.collectedKg);
});

test('impact requires login, validates dates and filters using collection time', async () => {
  assert.equal((await ctx.call('/impact')).status, 401);
  for (const query of ['?from=bad', '?from=2026-02-30', '?from=2026-12-01&to=2026-01-01']) {
    assert.equal((await ctx.call(`/impact${query}`, { as: individual })).status, 422);
  }
  assert.equal((await impact(individual, '?from=2099-01-01')).platform.collections, 0);
  const l = await listing();
  const r = await (await reserve(l)).json();
  await collect(r, bakery);
  await Reservation.updateOne({ _id: r.id }, { collectedAt: new Date('2040-01-01T16:00:00Z') }); // Jan 2 in Singapore
  assert.equal((await impact(individual, '?from=2040-01-02&to=2040-01-02')).mine.collectedKg, 0.25);
  assert.equal((await impact(individual, '?from=2040-01-01&to=2040-01-01')).mine.collectedKg, 0);
});

test('recipient deletion restores open stock while keeping completed snapshots', async () => {
  const registration = await ctx.call('/auth/register', { method: 'POST', json: { name: 'Temporary recipient', email: 'delete-impact@example.com', password: 'Passw0rdOK', role: 'individual' } });
  const as = ctx.cookieFrom(registration);
  const l = await listing();
  const r = await (await reserve(l, as, 2)).json();
  assert.equal((await ctx.call('/auth/me', { method: 'DELETE', as, json: { password: 'Passw0rdOK' } })).status, 204);
  assert.equal((await Reservation.findById(r.id)).status, 'cancelled');
  assert.equal((await Listing.findById(l.id)).quantityRemaining, 5);
});

test('listing edits and reservations preserve stock when they happen together', async () => {
  const l = await listing();
  const fd = new FormData();
  const fields = { itemName: l.itemName, quantity: 7, weightGramsPerUnit: 250,
    pickupStart: l.pickupStart.toISOString(), pickupEnd: l.pickupEnd.toISOString(), bestBefore: l.bestBefore.toISOString(),
    address: l.address, postal: l.postal, lat: l.location.coordinates[1], lng: l.location.coordinates[0] };
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  const [reservation, edit] = await Promise.all([
    reserve(l), ctx.call(`/listings/${l.id}`, { method: 'PUT', as: bakery, body: fd }),
  ]);
  assert.equal(reservation.status, 201);
  assert.equal(edit.status, 200);
  assert.equal((await Listing.findById(l.id)).quantityRemaining, 6);
});

test('a collection racing cancellation has exactly one outcome', async () => {
  const l = await listing();
  const r = await (await reserve(l, individual, 2)).json();
  const responses = await Promise.all([
    collect(r, bakery), call(`/reservations/${r.id}/cancel`, individual),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const final = await Reservation.findById(r.id);
  assert.equal((await Listing.findById(l.id)).quantityRemaining, final.status === 'collected' ? 3 : 5);
});

test('bakery deletion cancels open collections and retains completed organisation totals', async () => {
  const registration = await ctx.call('/auth/register', { method: 'POST', json: {
    name: 'Historical Bakery', email: 'delete-bakery-impact@example.com', password: 'Passw0rdOK', role: 'bakery', address: '1 Test Road', lat: 1.3, lng: 103.85,
  } });
  assert.equal(registration.status, 201);
  const as = ctx.cookieFrom(registration);
  const { user } = await registration.json();
  const l = await listing({ bakery: user.id, bakeryName: user.name });
  const collected = await (await reserve(l, charity)).json();
  const pending = await (await reserve(l, individual)).json();
  await collect(collected, as);
  assert.equal((await ctx.call('/auth/me', { method: 'DELETE', as, json: { password: 'Passw0rdOK' } })).status, 204);
  assert.equal((await Reservation.findById(pending.id)).status, 'cancelled');
  assert.equal((await Reservation.findById(collected.id)).status, 'collected');
  assert.equal((await Listing.findById(l.id)).status, 'removed');
  assert.ok((await impact(charity)).bakeries.some((row) => row.name === 'Historical Bakery' && row.collectedKg === 0.25));
});
