import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import Listing from '../src/models/Listing.js';
import Reservation from '../src/models/Reservation.js';
import { releaseMissed } from '../src/services/reservations.js';
import { slotsFor } from '../src/utils/slots.js';
import { parseListingInput } from '../src/utils/validate.js';
import { boot } from './helpers.js';

const MIN = 60000;
let ctx, bakery, otherBakery, charity, blocked, users = 0;
before(async () => {
  ctx = await boot();
  [bakery, otherBakery, charity, blocked] = await Promise.all(['sunrise', 'crumb', 'hope', 'sam'].map((n) => ctx.login(`${n}@demo.surplate.sg`)));
});
after(() => ctx?.close());

const call = (path, as, json, method = 'POST') => ctx.call(path, { as, json, method });
const body = async (res) => ({ ...(await res.json()), http: res.status });
/** A fresh individual, so one test's misses never change another test's reliability. */
async function recipient() {
  const res = await ctx.call('/auth/register', { method: 'POST', json: { name: 'Slot tester', email: `slots-${++users}@example.com`, password: 'Passw0rdOK', role: 'individual' } });
  return ctx.cookieFrom(res);
}
/** A public listing whose window opened `openedMin` minutes ago (negative: opens later). */
async function listing({ openedMin = 10, lengthMin = 120, slotMinutes = 30, quantity = 5 } = {}) {
  const source = (await Listing.findOne({ itemName: 'Assorted croissants' })).toObject();
  delete source._id;
  const pickupStart = new Date(Date.now() - openedMin * MIN);
  return Listing.create({ ...source, itemName: `Slot test ${Date.now()}`, quantity, quantityRemaining: quantity, slotMinutes,
    pickupStart, pickupEnd: new Date(pickupStart.getTime() + lengthMin * MIN), priorityUntil: new Date(Date.now() - 1000) });
}
const slot = (l, i) => slotsFor(l)[i].start.toISOString();
const reserve = (l, as, slotStart = slot(l, 1), quantity = 1) => call('/reservations', as, { listingId: String(l._id), quantity, slotStart });
const remaining = async (l) => (await Listing.findById(l._id)).quantityRemaining;

test('slots split the pickup window by the listing slot length; the last slot ends with the window', () => {
  const start = new Date('2030-01-01T10:00:00Z');
  const slots = slotsFor({ pickupStart: start, pickupEnd: new Date(start.getTime() + 50 * MIN), slotMinutes: 15 });
  assert.deepEqual(slots.map((s) => (s.end - s.start) / MIN), [15, 15, 15, 5]);
  const base = { itemName: 'Buns', quantity: 1, pickupStart: '2030-01-01T10:00:00Z', pickupEnd: '2030-01-01T11:00:00Z', bestBefore: '2030-01-02T00:00:00Z', address: 'x', lat: 1.3, lng: 103.8 };
  assert.equal(parseListingInput({ ...base, slotMinutes: '20' }).errors.slotMinutes !== undefined, true);
  assert.equal(parseListingInput({ ...base, slotMinutes: '60' }).value.slotMinutes, 60);
  assert.equal(parseListingInput(base).value.slotMinutes, 30);
});

test('a reservation needs a slot that is inside the window, on the slot grid and not over', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: 40 }); // slot 0 (40–10 min ago) has ended
  assert.equal((await call('/reservations', as, { listingId: String(l._id), quantity: 1 })).status, 422);
  assert.equal((await reserve(l, as, slot(l, 0))).status, 422);
  assert.equal((await reserve(l, as, new Date(l.pickupStart.getTime() + 35 * MIN).toISOString())).status, 422);
  assert.equal((await reserve(l, as, l.pickupEnd.toISOString())).status, 422);
  assert.equal((await reserve(l, as, 'not a date')).status, 422);
  const r = await body(await reserve(l, as, slot(l, 1), 2));
  assert.equal(r.http, 201);
  assert.match(r.code, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(r.slotStart, slot(l, 1));
  assert.equal(new Date(r.slotEnd) - new Date(r.slotStart), 30 * MIN);
  assert.equal(await remaining(l), 3);
});

test('a recipient can change quantity and slot until the slot ends, within the stock left', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: -10, quantity: 5 }); // opens in 10 minutes
  const r = await body(await reserve(l, as, slot(l, 0), 2));
  assert.equal((await call(`/reservations/${r.id}`, charity, { quantity: 1 }, 'PATCH')).status, 403);
  assert.equal((await call(`/reservations/${r.id}`, as, { quantity: 6 }, 'PATCH')).status, 409);
  assert.equal((await call(`/reservations/${r.id}`, as, { slotStart: new Date(l.pickupStart.getTime() + 7 * MIN).toISOString() }, 'PATCH')).status, 422);
  const changed = await body(await call(`/reservations/${r.id}`, as, { quantity: 5, slotStart: slot(l, 2) }, 'PATCH'));
  assert.equal(changed.http, 200);
  assert.equal(changed.quantity, 5);
  assert.equal(changed.slotStart, slot(l, 2));
  assert.equal(await remaining(l), 0);
  await call(`/reservations/${r.id}`, as, { quantity: 1 }, 'PATCH');
  assert.equal(await remaining(l), 4);
  await Reservation.updateOne({ _id: r.id }, { slotStart: new Date(Date.now() - 60000) }); // under way: still changeable
  assert.equal((await call(`/reservations/${r.id}`, as, { quantity: 2 }, 'PATCH')).status, 200);
  await Reservation.updateOne({ _id: r.id }, { slotEnd: new Date(Date.now() - 1000) });
  assert.equal((await call(`/reservations/${r.id}`, as, { quantity: 1 }, 'PATCH')).status, 409);
});

test('bakery staff look up a reservation by code and must give the matching code to confirm it', async () => {
  const as = await recipient();
  const l = await listing();
  const r = await body(await reserve(l, as));
  const spaced = `${r.code.slice(0, 3).toLowerCase()}-${r.code.slice(3)}`;
  const found = await body(await ctx.call(`/reservations/lookup?code=${spaced}`, { as: bakery }));
  assert.equal(found.id, r.id);
  assert.equal((await ctx.call(`/reservations/lookup?code=${r.code}`, { as: otherBakery })).status, 404);
  assert.equal((await ctx.call(`/reservations/lookup?code=${r.code}`, { as })).status, 403);
  assert.equal((await ctx.call('/reservations/lookup?code=ABC', { as: bakery })).status, 422);
  assert.equal((await call(`/reservations/${r.id}/collect`, bakery, { code: 'ZZZZZZ' })).status, 422);
  assert.equal((await call(`/reservations/${r.id}/collect`, bakery)).status, 422);
  assert.equal((await call(`/reservations/${r.id}/collect`, bakery, { code: spaced })).status, 200);
  assert.equal((await body(await ctx.call(`/reservations/lookup?code=${r.code}`, { as: bakery }))).status, 'collected');
});

test('staff can release a no-show once its slot has started, which puts the food back', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: 10 });
  const later = await body(await reserve(l, as, slot(l, 1)));
  assert.equal((await call(`/reservations/${later.id}/release`, bakery)).status, 409);
  const now = await body(await reserve(l, as, slot(l, 0), 2));
  assert.equal(await remaining(l), 2);
  assert.equal((await call(`/reservations/${now.id}/release`, as)).status, 403);
  assert.equal((await call(`/reservations/${now.id}/release`, otherBakery)).status, 403);
  const released = await body(await call(`/reservations/${now.id}/release`, bakery));
  assert.equal(released.status, 'missed');
  assert.equal(released.releasedBy, 'bakery');
  assert.equal(await remaining(l), 4);
  assert.equal((await call(`/reservations/${now.id}/release`, bakery)).status, 409);
  assert.equal((await call(`/reservations/${now.id}/collect`, bakery, { code: now.code })).status, 409);
});

test('uncollected reservations are released automatically after the slot plus the grace period', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: 10 });
  const r = await body(await reserve(l, as, slot(l, 0), 2));
  const slotEnd = new Date(r.slotEnd).getTime();
  await releaseMissed(new Date(slotEnd + 14 * MIN));
  assert.equal((await Reservation.findById(r.id)).status, 'reserved');
  await releaseMissed(new Date(slotEnd + 15 * MIN));
  const row = await Reservation.findById(r.id);
  assert.equal(row.status, 'missed');
  assert.equal(row.releasedBy, 'system');
  assert.equal(await remaining(l), 5);
  await releaseMissed(new Date(slotEnd + 20 * MIN)); // released once only
  assert.equal(await remaining(l), 5);
});

test('reliability: a blocked recipient cannot reserve; one with a recent miss can hold one reservation', async () => {
  const l = await listing({ quantity: 20 });
  const sam = await body(await ctx.call('/reservations/reliability', { as: blocked }));
  assert.equal(sam.level, 'blocked');
  assert.equal(sam.score, 25);
  const refused = await body(await reserve(l, blocked));
  assert.equal(refused.http, 403);
  assert.match(refused.error, /reliability score is 25%/);

  const as = await recipient();
  assert.equal((await body(await ctx.call('/reservations/reliability', { as }))).score, 100);
  const first = await body(await reserve(l, as, slot(l, 0)));
  await call(`/reservations/${first.id}/release`, bakery);
  const limited = await body(await ctx.call('/reservations/reliability', { as }));
  assert.deepEqual([limited.level, limited.score, limited.maxActive], ['limited', 0, 1]);
  assert.equal((await reserve(l, as)).status, 201);
  assert.equal((await reserve(l, as)).status, 403);
  assert.equal((await ctx.call('/reservations/reliability', { as: bakery })).status, 403);
});

test('reminders list reservations whose slot starts within 30 minutes, for the recipient and the bakery', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: -10, lengthMin: 180 });
  const soon = await body(await reserve(l, as, slot(l, 0)));
  const later = await body(await reserve(l, as, slot(l, 3)));
  const mine = (await body(await ctx.call('/reservations/upcoming', { as }))).items.map((r) => r.id);
  assert.ok(mine.includes(soon.id));
  assert.ok(!mine.includes(later.id));
  const staff = (await body(await ctx.call('/reservations/upcoming', { as: bakery }))).items.map((r) => r.id);
  assert.ok(staff.includes(soon.id));
  assert.ok(!(await body(await ctx.call('/reservations/upcoming', { as: otherBakery }))).items.some((r) => r.id === soon.id));
});

test('open orders list only the bakery’s own open reservations, earliest slot first', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: -10 });
  const late = await body(await reserve(l, as, slot(l, 2)));
  const early = await body(await reserve(l, as, slot(l, 0)));
  const ids = (await body(await ctx.call('/reservations/orders', { as: bakery }))).items.map((r) => r.id);
  assert.ok(ids.indexOf(early.id) < ids.indexOf(late.id));
  assert.ok(!(await body(await ctx.call('/reservations/orders', { as: otherBakery }))).items.some((r) => r.id === early.id));
  assert.equal((await ctx.call('/reservations/orders', { as })).status, 403);
});

test('order filters: to collect, due soon (released within 30 minutes) and recent no-shows, with counts', async () => {
  const as = await recipient();
  const l = await listing({ openedMin: 10, lengthMin: 180 }); // slot 0 ends in 20 min: released in 35 min; slot 1 ends in 50
  const current = await body(await reserve(l, as, slot(l, 0)));
  const later = await body(await reserve(l, as, slot(l, 1)));
  const view = async (v) => body(await ctx.call(`/reservations/orders?view=${v}`, { as: bakery }));
  const ids = (res) => res.items.map((r) => r.id);

  const open = await view('open');
  assert.ok(ids(open).includes(current.id) && ids(open).includes(later.id));
  assert.ok(!ids(await view('due')).includes(current.id));
  await Reservation.updateOne({ _id: current.id }, { slotEnd: new Date(Date.now() + 10 * MIN) }); // released in 25 min
  const due = await view('due');
  assert.ok(ids(due).includes(current.id));
  assert.ok(!ids(due).includes(later.id));

  const before = (await view('missed')).counts;
  await call(`/reservations/${current.id}/release`, bakery);
  const missed = await view('missed');
  assert.equal(missed.items.find((r) => r.id === current.id).releasedBy, 'bakery');
  assert.equal(missed.counts.missed, before.missed + 1);
  assert.equal(missed.counts.open, before.open - 1);
  assert.ok(!ids(await view('open')).includes(current.id));
  assert.ok(!ids(await body(await ctx.call('/reservations/orders?view=missed', { as: otherBakery }))).includes(current.id));
  assert.equal((await view('nonsense')).view, 'open');
});
