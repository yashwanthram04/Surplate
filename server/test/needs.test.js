import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import User from '../src/models/User.js';
import { boot } from './helpers.js';

// Charity Needs Board backend tests
let ctx;
let HOPE, OTHER_CHARITY, PENDING_CHARITY;
let SUNRISE, CRUMB, ALEX;


before(async () => {
  ctx = await boot();
  // Log in with existing seeded accounts
  HOPE = await ctx.login('hope@demo.surplate.sg');
  PENDING_CHARITY = await ctx.login('newhope@demo.surplate.sg');
  SUNRISE = await ctx.login('sunrise@demo.surplate.sg');
  CRUMB = await ctx.login('crumb@demo.surplate.sg');
  ALEX = await ctx.login('alex@demo.surplate.sg');

  // Create a second approved charity ONLY in the test database.
  const hopeUser = await User.findOne({
    email: 'hope@demo.surplate.sg',
  }).select('+passwordHash');

  assert.ok(hopeUser, 'Hope Kitchen should exist in test database');

  await User.create({
    name: 'Test Community Charity',
    email: 'testcharity@demo.surplate.sg',
    role: 'charity',
    passwordHash: hopeUser.passwordHash,
    registrationNo: 'TEST-CHARITY-003',
    verification: {
      status: 'approved',
      reviewedAt: new Date(),
    },
  });

  OTHER_CHARITY = await ctx.login('testcharity@demo.surplate.sg');
});

after(async () => {
  await ctx?.close();
});

// ---------- Helper functions ----------
// Make API requests
const get = (path, as) =>
  ctx.call(path, { as });

const send = (path, as, json, method = 'POST') =>
  ctx.call(path, { as, json, method });

// Future date in ISO format
const inDays = (n) =>
  new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

// YYYY-MM-DD format for board filtering
const dateOnly = (n) =>
  inDays(n).slice(0, 10);

// Valid food request
const validNeed = (over = {}) => ({
  title: 'Bread',
  description: 'Bread needed for charity meals.',
  quantityTarget: 20,
  neededBy: inDays(5),
  dietaryTags: [],
  ...over,
});

// Create a request and return its data
const addNeed = async (over = {}, as = HOPE) => {
  const res = await send('/needs', as, validNeed(over));

  const body = await res.json();

  assert.equal(
    res.status,
    201,
    `Creating a need failed: ${JSON.stringify(body)}`
  );

  return body;
};

// Get charity requests using the bakery account
const board = async (query = '', as = SUNRISE) => {
  const res = await get(`/needs${query}`, as);
  assert.equal(res.status, 200);

  const data = await res.json();
  return data.items;
};

// Submit a pledge
const pledge = (needId, quantity, as = SUNRISE) =>
  send(`/needs/${needId}/pledge`, as, { quantity });

// Get one request by ID
const oneNeed = async (id) => {
  const res = await get(`/needs/${id}`);
  assert.equal(res.status, 200);
  return res.json();
};

// READ - Viewing the Charity Needs Board
describe('the needs board', () => {

  test('a bakery can view food requests and pledge progress', async () => {
    const need = await addNeed({
      quantityTarget: 60,
    });

    // Bakery pledges 25 units
    const res = await pledge(need.id, 25);
    assert.equal(res.status, 201);

    // Anyone can read the board without logging in
    const items = await board();

    const bread = items.find((n) => n.id === need.id);

    assert.ok(bread);
    assert.equal(bread.quantityPledged, 25);
    assert.equal(bread.quantityRemaining, 35);
    assert.equal(bread.percent, 42);
    assert.equal(bread.charity.name, 'Hope Kitchen');
  });

  test('can be filtered by dietary type, needed-by date and search words', async () => {
    const halalNeed = await addNeed({
      title: 'Bread',
      quantityTarget: 10,
      neededBy: inDays(3),
      dietaryTags: ['halal'],
    });

    const regularNeed = await addNeed({
      title: 'Bread',
      quantityTarget: 10,
      neededBy: inDays(5),
      dietaryTags: [],
    });

    // Filter by dietary requirements
    const halal = await board('?dietary=halal');

    assert.ok(halal.some((n) => n.id === halalNeed.id));
    assert.ok(
      halal.every((n) => n.dietaryTags.includes('halal'))
    );

    // Filter by needed-by date
    const soon = await board(`?neededBy=${dateOnly(4)}`);

    assert.ok(soon.some((n) => n.id === halalNeed.id));

    assert.ok(
      !soon.some((n) => n.id === regularNeed.id)
    );

    // Search by food name
    const searched = await board('?q=Bread');

    assert.ok(
      searched.some((n) => n.id === halalNeed.id)
    );

    // Invalid date should be rejected
    const invalid = await get('/needs?neededBy=hello');
    assert.equal(invalid.status, 422);
  });
});


// CREATE - Posting Food Requests
describe('posting a need', () => {

  test('a verified charity can post a need and it appears on the board', async () => {
    const res = await send(
      '/needs',
      HOPE,
      validNeed({
        title: 'Bread',
        quantityTarget: 12,
      })
    );

    assert.equal(res.status, 201);

    const need = await res.json();

    assert.equal(need.status, 'open');
    assert.equal(need.quantityPledged, 0);

    const items = await board();

    assert.ok(
      items.some((n) => n.id === need.id)
    );
  });

  test('guests, bakeries, individuals and charities not yet approved cannot post', async () => {
    // Guest
    assert.equal(
      (await send('/needs', undefined, validNeed())).status,
      401
    );

    // Bakery
    assert.equal(
      (await send('/needs', SUNRISE, validNeed())).status,
      403
    );

    // Individual
    assert.equal(
      (await send('/needs', ALEX, validNeed())).status,
      403
    );

    // Unapproved charity
    assert.equal(
      (await send('/needs', PENDING_CHARITY, validNeed())).status,
      403
    );
  });

  test('bad input is rejected, field by field', async () => {
    const res = await send('/needs', HOPE, {
      title: 'x',
      quantityTarget: 0,
      neededBy: 'not-a-date',
      dietaryTags: ['made-up'],
    });

    assert.equal(res.status, 422);

    const { fields } = await res.json();

    for (const field of [
      'title',
      'quantityTarget',
      'neededBy',
      'dietaryTags',
    ]) {
      assert.ok(
        fields[field],
        `Expected an error for ${field}`
      );
    }

    // Past deadlines must be rejected
    const past = await send(
      '/needs',
      HOPE,
      validNeed({
        neededBy: inDays(-1),
      })
    );

    assert.equal(past.status, 422);

    const pastBody = await past.json();
    assert.ok(pastBody.fields.neededBy);
  });
});


// PLEDGING - Bakery Contributions
describe('pledging', () => {

  test('a bakery can pledge part of a need, never more than what is left, and the last pledge fulfils it', async () => {
    const need = await addNeed({
      quantityTarget: 20,
    });

    // First bakery pledges 10
    assert.equal(
      (await pledge(need.id, 10)).status,
      201
    );

    let now = await oneNeed(need.id);

    assert.equal(now.quantityPledged, 10);
    assert.equal(now.percent, 50);

    // Bakery attempts to pledge more than remaining
    const tooMany = await pledge(need.id, 15);

    assert.equal(tooMany.status, 409);

    // Second bakery pledges remaining 10
    assert.equal(
      (await pledge(need.id, 10, CRUMB)).status,
      201
    );

    now = await oneNeed(need.id);

    assert.equal(now.status, 'fulfilled');
    assert.equal(now.quantityPledged, 20);

    // Fulfilled need should leave the open board
    const items = await board();
    const item = items.find((n) => n.id === need.id);

    assert.ok(item);
    assert.equal(item.status, 'fulfilled');

    // No additional pledges allowed
    assert.equal(
      (await pledge(need.id, 1)).status,
      409
    );
  });

  test('only bakeries can pledge, and the quantity must be a whole number', async () => {
    const need = await addNeed();

    // Guest cannot pledge
    assert.equal(
      (await send(`/needs/${need.id}/pledge`, undefined, {
        quantity: 1,
      })).status,
      401
    );

    // Charity cannot pledge
    assert.equal(
      (await pledge(need.id, 1, HOPE)).status,
      403
    );

    // Individual cannot pledge
    assert.equal(
      (await pledge(need.id, 1, ALEX)).status,
      403
    );

    // Invalid quantities
    for (const quantity of [0, -3, 1.5, 'lots']) {
      assert.equal(
        (await pledge(need.id, quantity)).status,
        422
      );
    }

    // Invalid need ID
    assert.equal(
      (await get('/needs/not-an-id')).status,
      404
    );
  });

  test('two bakeries pledging at the same moment cannot over-fulfil a need', async () => {
    const need = await addNeed({
      quantityTarget: 10,
    });

    // Two bakeries simultaneously pledge 10 units
    const results = await Promise.all([
      pledge(need.id, 10, SUNRISE),
      pledge(need.id, 10, CRUMB),
    ]);

    const statuses = results
      .map((r) => r.status)
      .sort();

    // Only one bakery should succeed
    assert.deepEqual(statuses, [201, 409]);

    const updated = await oneNeed(need.id);

    assert.equal(updated.quantityPledged, 10);
  });

  test('withdrawing a pledge gives the quantity back and re-opens a fulfilled need', async () => {
    const need = await addNeed({
      quantityTarget: 5,
    });

    const pledgeRes = await pledge(need.id, 5);

    assert.equal(pledgeRes.status, 201);

    const mine = await pledgeRes.json();

    assert.equal(
      (await oneNeed(need.id)).status,
      'fulfilled'
    );

    // Another bakery cannot withdraw Sunrise's pledge
    assert.equal(
      (await send(
        `/needs/pledges/${mine.id}/withdraw`,
        CRUMB
      )).status,
      404
    );

    // Sunrise withdraws its own pledge
    const done = await send(
      `/needs/pledges/${mine.id}/withdraw`,
      SUNRISE
    );

    assert.equal(done.status, 200);

    const withdrawn = await done.json();

    assert.equal(withdrawn.status, 'withdrawn');

    const now = await oneNeed(need.id);

    assert.equal(now.quantityPledged, 0);
    assert.equal(now.status, 'open');

    // Cannot withdraw the same pledge again
    assert.equal(
      (await send(
        `/needs/pledges/${mine.id}/withdraw`,
        SUNRISE
      )).status,
      404
    );
  });

  test('a bakery can see its own pledges', async () => {
    const need = await addNeed({
      quantityTarget: 20,
    });

    await pledge(need.id, 5);

    const res = await get('/needs/pledges/mine', SUNRISE);

    assert.equal(res.status, 200);

    const data = await res.json();

    assert.ok(
      data.items.some(
        (p) =>
          p.needId === need.id &&
          p.quantity === 5
      )
    );

    // Charities cannot access bakery pledge history
    assert.equal(
      (await get('/needs/pledges/mine', HOPE)).status,
      403
    );
  });
});


// MY NEEDS - Updating and Cancelling Requests
describe('my needs (charity)', () => {

  test('a charity sees only its own needs, each with the pledges on it', async () => {
    const need = await addNeed({
      quantityTarget: 20,
    });

    await pledge(need.id, 5);

    // Hope Kitchen sees its own request and pledges
    const res = await get('/needs/mine', HOPE);

    assert.equal(res.status, 200);

    const data = await res.json();

    const bread = data.items.find(
      (n) => n.id === need.id
    );

    assert.ok(bread);
    assert.equal(bread.pledges.length, 1);
    assert.equal(bread.pledges[0].bakery.name, 'Sunrise Bakery');
    assert.equal(bread.pledges[0].quantity, 5);

    // Another charity cannot see Hope Kitchen's private request
    const otherRes = await get(
      '/needs/mine',
      OTHER_CHARITY
    );

    assert.equal(otherRes.status, 200);

    const otherData = await otherRes.json();

    assert.ok(
      !otherData.items.some((n) => n.id === need.id)
    );

    // Bakeries cannot access /needs/mine
    assert.equal(
      (await get('/needs/mine', SUNRISE)).status,
      403
    );
  });

  test('only the owner can edit, and the target cannot drop below what is pledged', async () => {
    const need = await addNeed({
      quantityTarget: 20,
    });

    await pledge(need.id, 8);

    const edit = (body, as = HOPE) =>
      send(`/needs/${need.id}`, as, body, 'PUT');

    // Another charity cannot edit Hope's request
    const otherEdit = await edit(
      validNeed({
        quantityTarget: 12,
      }),
      OTHER_CHARITY
    );

    assert.equal(otherEdit.status, 403);

    // Cannot reduce target below the pledged quantity
    const tooLow = await edit(
      validNeed({
        quantityTarget: 5,
      })
    );

    assert.equal(tooLow.status, 422);

    const tooLowBody = await tooLow.json();

    assert.ok(tooLowBody.fields.quantityTarget);

    // Valid update
    const ok = await edit(
      validNeed({
        title: 'Bread',
        quantityTarget: 12,
      })
    );

    assert.equal(ok.status, 200);

    const body = await ok.json();

    assert.equal(body.title, 'Bread');
    assert.equal(body.quantityTarget, 12);
    assert.equal(body.quantityPledged, 8);
  });

  test('cancelling a need updates its status and releases its pledges', async () => {
    const need = await addNeed({
      quantityTarget: 20,
    });

    await pledge(need.id, 6);

    // Another charity cannot cancel Hope's request
    assert.equal(
      (await send(
        `/needs/${need.id}`,
        OTHER_CHARITY,
        undefined,
        'DELETE'
      )).status,
      403
    );

    // Hope Kitchen cancels its own request
    assert.equal(
      (await send(
        `/needs/${need.id}`,
        HOPE,
        undefined,
        'DELETE'
      )).status,
      204
    );

    const cancelled = await oneNeed(need.id);

    assert.equal(cancelled.status, 'cancelled');

    // Cancelled need should remain visible with its status
    const items = await board();
    const item = items.find((n) => n.id === need.id);

    assert.ok(item);
    assert.equal(item.status, 'cancelled');

    // Existing pledge should be withdrawn
    const pledgeRes = await get(
      '/needs/pledges/mine',
      SUNRISE
    );

    const pledgeData = await pledgeRes.json();

    const existingPledge = pledgeData.items.find(
      (p) => p.needId === need.id
    );

    assert.ok(existingPledge);
    assert.equal(existingPledge.status, 'withdrawn');

    // Cannot pledge to a cancelled request
    assert.equal(
      (await pledge(need.id, 1)).status,
      409
    );

    // Cannot edit a cancelled request
    assert.equal(
      (await send(
        `/needs/${need.id}`,
        HOPE,
        validNeed(),
        'PUT'
      )).status,
      409
    );
  });
});
