import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Appeal from '../src/models/Appeal.js';
import Listing from '../src/models/Listing.js';
import Reservation from '../src/models/Reservation.js';
import User from '../src/models/User.js';
import { slotsFor } from '../src/utils/slots.js';
import { defaultNickname } from '../src/utils/validateReview.js';
import { boot } from './helpers.js';

let ctx, sunrise, crumb, hope, alex, sam, admin, sunriseId, users = 0;
before(async () => {
  ctx = await boot();
  [sunrise, crumb, hope, alex, sam, admin] = await Promise.all(['sunrise', 'crumb', 'hope', 'alex', 'sam', 'admin'].map((n) => ctx.login(`${n}@demo.surplate.sg`)));
  sunriseId = String((await User.findOne({ email: 'sunrise@demo.surplate.sg' }))._id);
});
after(() => ctx?.close());

const call = (path, as, json, method = 'POST') => ctx.call(path, { as, json, method });
const body = async (res) => ({ ...(await res.json()), http: res.status });
const GOOD = { note: 'Thank you, this made our morning!', foodRating: 5, accuracyRating: 4 };

async function newRecipient(role = 'individual') {
  const res = await ctx.call('/auth/register', { method: 'POST', json: {
    name: 'Casey Tester Lim', email: `reviews-${++users}@example.com`, password: 'Passw0rdOK', role,
    ...(role === 'charity' ? { registrationNo: `TEST-${users}0000` } : {}),
  } });
  assert.equal(res.status, 201);
  return ctx.cookieFrom(res);
}
/** A listing at `bakeryLogin`'s bakery, open now. */
async function listing(owner = 'sunrise@demo.surplate.sg') {
  const source = (await Listing.findOne({ itemName: 'Assorted croissants' })).toObject();
  const bakery = await User.findOne({ email: owner });
  delete source._id;
  return Listing.create({ ...source, bakery: bakery._id, bakeryName: bakery.name, itemName: `Review test ${Date.now()}-${++users}`, quantity: 20, quantityRemaining: 20,
    pickupStart: new Date(Date.now() - 600000), pickupEnd: new Date(Date.now() + 7200000), priorityUntil: new Date(Date.now() - 1000) });
}
/** Reserves and (unless told not to) collects, returning the reservation. */
async function pickup(as, { collect = true, bakery = sunrise, owner } = {}) {
  const l = await listing(owner);
  const r = await body(await call('/reservations', as, { listingId: String(l._id), quantity: 1, slotStart: slotsFor(l)[0].start.toISOString() }));
  assert.equal(r.http, 201);
  if (collect) assert.equal((await call(`/reservations/${r.id}/collect`, bakery, { code: r.code })).status, 200);
  return r;
}
const thank = (as, reservationId, extra = {}) => call('/reviews', as, { reservationId, ...GOOD, ...extra });

describe('the Thank-you Wall', () => {
  test('anyone can read a bakery wall: pinned first, nicknames only, with its reputation', async () => {
    const wall = await body(await ctx.call(`/reviews/bakery/${sunriseId}`));
    assert.equal(wall.http, 200);
    assert.equal(wall.bakery.name, 'Sunrise Bakery');
    assert.equal(wall.items.length, 5);
    assert.equal(wall.items[0].pinned, true);
    assert.equal(wall.items[0].reply.text, 'See you again next Saturday! 🍞');
    assert.equal(wall.reputation.thankYouCount, 5);
    assert.equal(wall.reputation.tier, 'excellent');
    assert.equal(wall.reputation.peopleServed, 65);
    assert.equal(wall.reputation.stars[5], 3);
    // 0.6 × accuracy (4.4 stars = 85%) + 0.4 × food (4.6 stars = 90%)
    assert.deepEqual([wall.reputation.foodAverage, wall.reputation.accuracyAverage, wall.reputation.score], [4.6, 4.4, 87]);
    // privacy: nothing identifies the account behind a note
    assert.ok(wall.items.every((n) => !('author' in n) && !('email' in n)));
    assert.ok(wall.items.every((n) => n.mine === false));
  });

  test('a recipient sees which note is theirs; a missing or non-bakery id is a 404', async () => {
    const mine = (await body(await ctx.call(`/reviews/bakery/${sunriseId}`, { as: alex }))).items.filter((n) => n.mine);
    assert.deepEqual(mine.map((n) => n.nickname), ['Alex T.']);
    assert.equal((await ctx.call('/reviews/bakery/not-an-id')).status, 404);
    const hopeId = String((await User.findOne({ email: 'hope@demo.surplate.sg' }))._id);
    assert.equal((await ctx.call(`/reviews/bakery/${hopeId}`)).status, 404);
  });

  test('listings carry their bakery’s thank-you count for the card', async () => {
    const board = await body(await ctx.call('/listings'));
    const sunriseItem = board.items.find((l) => l.bakery.name === 'Sunrise Bakery');
    assert.ok(sunriseItem.bakery.thankYouCount >= 5);
    const crumbItem = board.items.find((l) => l.bakery.name === 'Crumb & Co');
    assert.equal(crumbItem.bakery.thankYouCount, 0);
    assert.equal((await body(await ctx.call(`/listings/${sunriseItem.id}`))).bakery.thankYouCount, sunriseItem.bakery.thankYouCount);
  });
});

describe('leaving a thank-you', () => {
  test('lists collected pickups that have no note yet', async () => {
    const pending = await body(await ctx.call('/reviews/pending', { as: alex }));
    assert.equal(pending.count, 1);
    assert.equal(pending.items[0].itemName, 'Kaya toast sets');
    assert.equal(pending.items[0].quantity, 3);
    assert.equal((await ctx.call('/reviews/pending', { as: sunrise })).status, 403);
    assert.equal((await ctx.call('/reviews/pending')).status, 401);
  });

  test('validates the note, ratings and nickname', async () => {
    const as = await newRecipient();
    const r = await pickup(as);
    const bad = await body(await thank(as, r.id, { note: 'a', foodRating: 6, accuracyRating: 0, nickname: 'x' }));
    assert.equal(bad.http, 422);
    assert.deepEqual(Object.keys(bad.fields).sort(), ['accuracyRating', 'foodRating', 'nickname', 'note']);
    assert.equal((await body(await thank(as, r.id, { note: 'x'.repeat(201) }))).fields.note.includes('200'), true);
    assert.equal((await thank(as, 'nope')).status, 422);
    assert.equal((await thank(as, r.id, { foodRating: 4.5 })).status, 422);
  });

  test('a collected pickup can be thanked once; the nickname defaults to first name and initial', async () => {
    const as = await newRecipient();
    const r = await pickup(as);
    const made = await body(await thank(as, r.id));
    assert.equal(made.http, 201);
    assert.equal(made.nickname, 'Casey L.');
    assert.equal(made.mine, true);
    assert.equal((await thank(as, r.id)).status, 409);
    const wall = await body(await ctx.call(`/reviews/bakery/${sunriseId}`));
    assert.ok(wall.items.some((n) => n.id === made.id && n.note === GOOD.note));
    assert.equal((await body(await ctx.call('/reviews/pending', { as }))).count, 0);
    assert.equal(defaultNickname({ role: 'charity', name: 'Hope Kitchen' }), 'Hope Kitchen');
  });

  test('only the recipient of a collected pickup can thank for it', async () => {
    const as = await newRecipient();
    const open = await pickup(as, { collect: false });
    assert.equal((await thank(as, open.id)).status, 409); // not collected yet
    const done = await pickup(as);
    assert.equal((await thank(await newRecipient(), done.id)).status, 404); // someone else's
    assert.equal((await thank(sunrise, done.id)).status, 403); // bakeries cannot write thank-yous
    assert.equal((await call('/reviews', null, { reservationId: done.id, ...GOOD })).status, 401);
  });

  test('a charity can thank on behalf of the people it serves; an individual cannot', async () => {
    const charity = await newRecipient('charity');
    const mine = await pickup(charity);
    const ok = await body(await thank(charity, mine.id, { onBehalfOf: 'our after-school club', peopleServed: 18 }));
    assert.equal(ok.http, 201);
    assert.equal(ok.onBehalfOf, 'our after-school club');
    assert.equal(ok.peopleServed, 18);
    const person = await newRecipient();
    const refused = await body(await thank(person, (await pickup(person)).id, { onBehalfOf: 'my family' }));
    assert.equal(refused.http, 422);
    assert.ok(refused.fields.onBehalfOf);
    const other = await newRecipient('charity');
    assert.equal((await body(await thank(other, (await pickup(other)).id, { onBehalfOf: 'x', peopleServed: 0 }))).fields.peopleServed.includes('whole number'), true);
  });

  test('notes cannot be left for a pickup collected more than 30 days ago', async () => {
    const as = await newRecipient();
    const r = await pickup(as);
    await Reservation.updateOne({ _id: r.id }, { collectedAt: new Date(Date.now() - 31 * 86400000) });
    assert.equal((await thank(as, r.id)).status, 409);
  });
});

describe('bakery staff: pin and reply', () => {
  let noteId;
  before(async () => {
    const as = await newRecipient();
    noteId = (await body(await thank(as, (await pickup(as)).id))).id;
  });

  test('only the owning bakery can pin, and no more than three notes', async () => {
    assert.equal((await call(`/reviews/${noteId}/pin`, crumb, {}, 'PATCH')).status, 404);
    assert.equal((await call(`/reviews/${noteId}/pin`, hope, {}, 'PATCH')).status, 403);
    const wall = (await body(await ctx.call(`/reviews/bakery/${sunriseId}`))).items;
    assert.equal(wall.filter((n) => n.pinned).length, 1);
    const others = wall.filter((n) => !n.pinned && n.id !== noteId).slice(0, 2);
    for (const n of others) assert.equal((await call(`/reviews/${n.id}/pin`, sunrise, {}, 'PATCH')).status, 200);
    const refused = await body(await call(`/reviews/${noteId}/pin`, sunrise, {}, 'PATCH'));
    assert.equal(refused.http, 409);
    assert.match(refused.error, /up to 3/);
    // unpinning frees a slot, and pinned notes sort first
    assert.equal((await call(`/reviews/${others[0].id}/pin`, sunrise, { pinned: false }, 'PATCH')).status, 200);
    assert.equal((await call(`/reviews/${noteId}/pin`, sunrise, {}, 'PATCH')).status, 200);
    const sorted = (await body(await ctx.call(`/reviews/bakery/${sunriseId}`))).items;
    assert.equal(sorted[0].id, noteId, 'the newest pin is shown first');
    assert.ok(sorted.slice(0, 3).every((n) => n.pinned));
  });

  test('the bakery can reply, change the reply and remove it', async () => {
    assert.equal((await call(`/reviews/${noteId}/reply`, crumb, { text: 'hi' }, 'PUT')).status, 404);
    assert.equal((await call(`/reviews/${noteId}/reply`, alex, { text: 'hi' }, 'PUT')).status, 403);
    assert.equal((await call(`/reviews/${noteId}/reply`, sunrise, { text: 'x'.repeat(141) }, 'PUT')).status, 422);
    const set = await body(await call(`/reviews/${noteId}/reply`, sunrise, { text: '  See you   tomorrow!  ' }, 'PUT'));
    assert.equal(set.reply.text, 'See you tomorrow!');
    const cleared = await body(await call(`/reviews/${noteId}/reply`, sunrise, { text: '' }, 'PUT'));
    assert.equal(cleared.reply, null);
  });
});

describe('bakeries rating customers', () => {
  test('lists collected pickups not rated yet, for that bakery only', async () => {
    const queue = await body(await ctx.call('/reviews/to-rate', { as: sunrise }));
    assert.ok(queue.items.some((i) => i.recipientName === 'Alex Tan' && i.quantity === 3));
    assert.ok(!(await body(await ctx.call('/reviews/to-rate', { as: crumb }))).items.some((i) => i.recipientName === 'Alex Tan'));
    assert.equal((await ctx.call('/reviews/to-rate', { as: alex })).status, 403);
  });

  test('a rating is validated, belongs to a collected pickup at that bakery, and is only given once', async () => {
    const as = await newRecipient();
    const open = await pickup(as, { collect: false });
    const done = await pickup(as);
    assert.equal((await call('/reviews/rate', sunrise, { reservationId: done.id, punctuality: 0 })).status, 422);
    assert.equal((await call('/reviews/rate', sunrise, { reservationId: done.id, punctuality: 4, comment: 'x'.repeat(141) })).status, 422);
    assert.equal((await call('/reviews/rate', sunrise, { reservationId: open.id, punctuality: 4 })).status, 409);
    assert.equal((await call('/reviews/rate', crumb, { reservationId: done.id, punctuality: 4 })).status, 404);
    assert.equal((await call('/reviews/rate', as, { reservationId: done.id, punctuality: 4 })).status, 403);
    assert.equal((await call('/reviews/rate', sunrise, { reservationId: done.id, punctuality: 4, comment: 'On time' })).status, 201);
    assert.equal((await call('/reviews/rate', sunrise, { reservationId: done.id, punctuality: 5 })).status, 409);
  });
});

describe('reliability scores', () => {
  test('a recipient’s score blends pickups with punctuality, once there are three ratings', async () => {
    const as = await newRecipient();
    const reliability = async () => (await body(await ctx.call('/reservations/reliability', { as })));
    const pickups = [await pickup(as), await pickup(as), await pickup(as)];
    assert.equal((await reliability()).score, 100);
    await call('/reviews/rate', sunrise, { reservationId: pickups[0].id, punctuality: 1 });
    await call('/reviews/rate', sunrise, { reservationId: pickups[1].id, punctuality: 1 });
    const two = await reliability();
    assert.equal(two.score, 100, 'two ratings are not enough to move the score');
    assert.equal(two.punctuality.counted, false);
    await call('/reviews/rate', sunrise, { reservationId: pickups[2].id, punctuality: 1 });
    const three = await reliability();
    assert.equal(three.pickupScore, 100);
    assert.equal(three.punctuality.percent, 0);
    assert.equal(three.score, 80); // 100 × 0.8 + 0 × 0.2
    assert.equal(three.level, 'good');
    const me = await body(await ctx.call('/reviews/me', { as }));
    assert.equal(me.role, 'individual');
    assert.equal(me.ratings.length, 3);
    assert.equal(me.reliability.rules.limitedBelow, 80);
  });

  test('a bakery’s score comes from accuracy and food ratings, and is "new" until it has three reviews', async () => {
    const mine = await body(await ctx.call('/reviews/me', { as: sunrise }));
    assert.equal(mine.role, 'bakery');
    assert.equal(mine.reputation.thankYouCount >= 5, true);
    assert.equal(typeof mine.reputation.score, 'number');
    const fresh = await body(await ctx.call('/reviews/me', { as: crumb }));
    assert.equal(fresh.reputation.score, null);
    assert.equal(fresh.reputation.tier, 'new');
    assert.equal(fresh.reputation.thankYouCount, 0);
  });

  test('the block is temporary and says when it should lift', async () => {
    const sams = await body(await ctx.call('/reservations/reliability', { as: sam }));
    assert.equal(sams.level, 'blocked');
    assert.equal(sams.score, 25);
    assert.ok(new Date(sams.blockedUntil) > new Date(Date.now() + 25 * 86400000), 'three misses age out about 30 days after they happened');
    assert.equal((await body(await ctx.call('/reservations/reliability', { as: alex }))).blockedUntil, null);
  });
});

describe('appealing a block', () => {
  test('only a blocked recipient can appeal, with a real reason', async () => {
    assert.equal((await call('/appeals', alex, { reason: 'I would like to appeal this please thanks' })).status, 409);
    assert.equal((await call('/appeals', sunrise, { reason: 'I would like to appeal this please thanks' })).status, 403);
    assert.equal((await call('/appeals', null, { reason: 'I would like to appeal this please thanks' })).status, 401);
    const short = await body(await call('/appeals', sam, { reason: 'please' }));
    assert.equal(short.http, 422);
    assert.ok(short.fields.reason);
  });

  test('one open appeal at a time; admin sees it; a denial needs a reason and starts a cool-off', async () => {
    const filed = await body(await call('/appeals', sam, { reason: 'I was in hospital that week and could not collect.' }));
    assert.equal(filed.http, 201);
    assert.equal(filed.status, 'pending');
    assert.equal(filed.snapshot.score, 25);
    assert.equal((await call('/appeals', sam, { reason: 'Please look at my appeal again, thank you.' })).status, 409);

    assert.equal((await ctx.call('/appeals', { as: sam })).status, 403);
    const queue = await body(await ctx.call('/appeals', { as: admin }));
    assert.equal(queue.counts.pending, 1);
    assert.equal(queue.items[0].userName, 'Sam Lee');

    assert.equal((await call(`/appeals/${filed.id}/decision`, sam, { decision: 'approve' })).status, 403);
    assert.equal((await call(`/appeals/${filed.id}/decision`, admin, { decision: 'maybe' })).status, 422);
    assert.equal((await call(`/appeals/${filed.id}/decision`, admin, { decision: 'deny' })).status, 422);
    const denied = await body(await call(`/appeals/${filed.id}/decision`, admin, { decision: 'deny', note: 'Please send proof of the hospital stay.' }));
    assert.equal(denied.status, 'denied');
    assert.equal((await call(`/appeals/${filed.id}/decision`, admin, { decision: 'approve' })).status, 409, 'decided once');

    const cooloff = await body(await call('/appeals', sam, { reason: 'Here is my hospital letter, please reconsider.' }));
    assert.equal(cooloff.http, 409);
    assert.match(cooloff.error, /24 hours/);
    assert.equal((await body(await ctx.call('/reservations/reliability', { as: sam }))).appeal.adminNote, 'Please send proof of the hospital stay.');
  });

  test('an approved appeal lifts the block for a week: one reservation at a time', async () => {
    await Appeal.updateMany({ status: 'denied' }, { decidedAt: new Date(Date.now() - 25 * 3600000) });
    const filed = await body(await call('/appeals', sam, { reason: 'Here is my hospital letter, please reconsider.' }));
    assert.equal(filed.http, 201);
    const approved = await body(await call(`/appeals/${filed.id}/decision`, admin, { decision: 'approve', note: '' }));
    assert.equal(approved.status, 'approved');
    assert.ok(new Date(approved.waivedUntil) > new Date(Date.now() + 6 * 86400000));

    const after = await body(await ctx.call('/reservations/reliability', { as: sam }));
    assert.equal(after.level, 'limited');
    assert.equal(after.maxActive, 1);
    assert.ok(after.waivedUntil);
    const l = await listing('crumb@demo.surplate.sg');
    const slot = slotsFor(l)[0].start.toISOString();
    assert.equal((await call('/reservations', sam, { listingId: String(l._id), quantity: 1, slotStart: slot })).status, 201);
    assert.equal((await call('/reservations', sam, { listingId: String(l._id), quantity: 1, slotStart: slot })).status, 403, 'one at a time');
    assert.equal((await call('/appeals', sam, { reason: 'Another appeal even though I am fine now.' })).status, 409, 'not blocked any more');
  });
});
