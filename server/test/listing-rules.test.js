// Unit tests for the pure rules behind food listings: input validation, photo checks and who may see a
// listing. No server and no database, so they run in milliseconds (the API tests cover the same rules end to end).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkPhoto, checkPhotos, isInSingapore, MAX_PHOTO_BYTES, MAX_PHOTOS, parseListingInput, toList } from '../src/utils/validate.js';
import { canView, hasFullAccess, visibilityFilter } from '../src/utils/visibility.js';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-01T10:00:00Z');
const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();

/** A valid listing body; each test changes only what it is about. */
const body = (overrides = {}) => ({
  itemName: 'Butter croissants',
  description: 'Baked this morning',
  quantity: 12,
  weightGramsPerUnit: 80,
  dietaryTags: ['vegetarian'],
  allergens: ['gluten', 'dairy'],
  pickupStart: iso(HOUR),
  pickupEnd: iso(3 * HOUR),
  bestBefore: iso(6 * HOUR),
  address: '1 Raffles Place',
  postal: '048616',
  lat: 1.2841,
  lng: 103.8515,
  ...overrides,
});
const parse = (overrides) => parseListingInput(body(overrides), NOW);

describe('isInSingapore', () => {
  test('accepts places in Singapore and rejects everywhere else', () => {
    assert.equal(isInSingapore(1.3521, 103.8198), true);
    assert.equal(isInSingapore(51.5, -0.12), false); // London
    assert.equal(isInSingapore(3.139, 101.6869), false); // Kuala Lumpur
  });

  test('rejects missing or non-numeric coordinates', () => {
    assert.equal(isInSingapore(NaN, 103.8), false);
    assert.equal(isInSingapore(undefined, undefined), false);
    assert.equal(isInSingapore(Infinity, 103.8), false);
  });
});

describe('toList', () => {
  test('accepts an array, a comma-separated string, or nothing', () => {
    assert.deepEqual(toList(['a', 'b']), ['a', 'b']);
    assert.deepEqual(toList('a, b ,c'), ['a', 'b', 'c']);
    assert.deepEqual(toList(''), []);
    assert.deepEqual(toList(undefined), []);
  });

  test('drops anything that is not a string', () => {
    assert.deepEqual(toList(['a', 5, null, { x: 1 }]), ['a']);
  });
});

describe('parseListingInput: a valid listing', () => {
  test('has no errors and keeps the cleaned-up values', () => {
    const { value, errors } = parse();
    assert.deepEqual(errors, {});
    assert.equal(value.itemName, 'Butter croissants');
    assert.equal(value.quantity, 12);
    assert.equal(value.weightGramsPerUnit, 80);
    assert.deepEqual(value.dietaryTags, ['vegetarian']);
    assert.deepEqual(value.location, { type: 'Point', coordinates: [103.8515, 1.2841] }); // GeoJSON is [lng, lat]
    assert.ok(value.pickupStart instanceof Date);
  });

  test('trims text and removes duplicate tags', () => {
    const { value, errors } = parse({ itemName: '  Bagels  ', dietaryTags: ['vegan', 'vegan'], allergens: 'nuts,nuts' });
    assert.deepEqual(errors, {});
    assert.equal(value.itemName, 'Bagels');
    assert.deepEqual(value.dietaryTags, ['vegan']);
    assert.deepEqual(value.allergens, ['nuts']);
  });

  test('defaults the collection slots to 30 minutes', () => {
    assert.equal(parse().value.slotMinutes, 30);
    assert.equal(parse({ slotMinutes: '' }).value.slotMinutes, 30);
  });

  test('reads the sharing flag from a form ("true") as well as from JSON', () => {
    assert.equal(parse({ visibleToIndividuals: 'true' }).value.visibleToIndividuals, true);
    assert.equal(parse({ visibleToIndividuals: true }).value.visibleToIndividuals, true);
    assert.equal(parse({ visibleToIndividuals: 'false' }).value.visibleToIndividuals, false);
    assert.equal(parse().value.visibleToIndividuals, false);
  });
});

describe('parseListingInput: item name and description', () => {
  test('needs a name of 2 to 80 characters', () => {
    assert.ok(parse({ itemName: '' }).errors.itemName);
    assert.ok(parse({ itemName: 'A' }).errors.itemName);
    assert.ok(parse({ itemName: 'x'.repeat(81) }).errors.itemName);
    assert.equal(parse({ itemName: 'x'.repeat(80) }).errors.itemName, undefined);
    assert.ok(parse({ itemName: 42 }).errors.itemName);
  });

  test('allows a description of up to 500 characters', () => {
    assert.equal(parse({ description: 'x'.repeat(500) }).errors.description, undefined);
    assert.ok(parse({ description: 'x'.repeat(501) }).errors.description);
  });
});

describe('parseListingInput: quantity and weight', () => {
  test('quantity is a whole number from 1 to 500', () => {
    for (const bad of [0, -3, 501, 2.5, 'lots', null]) assert.ok(parse({ quantity: bad }).errors.quantity, `quantity ${bad}`);
    for (const good of [1, 500, '40']) assert.equal(parse({ quantity: good }).errors.quantity, undefined, `quantity ${good}`);
  });

  test('weight per unit is a whole number from 1 to 100000 grams', () => {
    for (const bad of [0, -1, 100001, 1.5, 'heavy']) assert.ok(parse({ weightGramsPerUnit: bad }).errors.weightGramsPerUnit, `weight ${bad}`);
    assert.equal(parse({ weightGramsPerUnit: 100000 }).errors.weightGramsPerUnit, undefined);
  });
});

describe('parseListingInput: tags and allergens', () => {
  test('rejects tags that are not in the lists', () => {
    assert.ok(parse({ dietaryTags: ['paleo'] }).errors.dietaryTags);
    assert.ok(parse({ allergens: ['kryptonite'] }).errors.allergens);
  });
});

describe('parseListingInput: pickup times', () => {
  test('all three times are required', () => {
    const { errors } = parse({ pickupStart: '', pickupEnd: undefined, bestBefore: 'not a date' });
    assert.ok(errors.pickupStart);
    assert.ok(errors.pickupEnd);
    assert.ok(errors.bestBefore);
  });

  test('pickup must end after it starts', () => {
    assert.ok(parse({ pickupStart: iso(2 * HOUR), pickupEnd: iso(HOUR) }).errors.pickupEnd);
    assert.ok(parse({ pickupStart: iso(HOUR), pickupEnd: iso(HOUR) }).errors.pickupEnd);
  });

  test('pickup must end in the future', () => {
    assert.ok(parse({ pickupStart: iso(-3 * HOUR), pickupEnd: iso(-HOUR) }).errors.pickupEnd);
  });

  test('a window can be at most 24 hours', () => {
    assert.equal(parse({ pickupStart: iso(HOUR), pickupEnd: iso(25 * HOUR), bestBefore: iso(30 * HOUR) }).errors.pickupEnd, undefined);
    assert.ok(parse({ pickupStart: iso(HOUR), pickupEnd: iso(25 * HOUR + 1000), bestBefore: iso(30 * HOUR) }).errors.pickupEnd);
  });

  test('best-before cannot be earlier than the end of the pickup window', () => {
    assert.ok(parse({ pickupEnd: iso(3 * HOUR), bestBefore: iso(2 * HOUR) }).errors.bestBefore);
    assert.equal(parse({ pickupEnd: iso(3 * HOUR), bestBefore: iso(3 * HOUR) }).errors.bestBefore, undefined);
  });

  test('collection slots are 15, 30 or 60 minutes', () => {
    for (const good of [15, 30, 60, '15']) assert.equal(parse({ slotMinutes: good }).errors.slotMinutes, undefined);
    for (const bad of [5, 45, 120, 'x']) assert.ok(parse({ slotMinutes: bad }).errors.slotMinutes, `slots ${bad}`);
  });
});

describe('parseListingInput: pickup address', () => {
  test('needs an address picked from the search, in Singapore', () => {
    assert.ok(parse({ address: '' }).errors.address);
    assert.ok(parse({ address: 'x'.repeat(201) }).errors.address);
    assert.ok(parse({ lat: 51.5, lng: -0.12 }).errors.address);
    assert.ok(parse({ lat: undefined, lng: undefined }).errors.address);
  });

  test('truncates an over-long postal code instead of failing', () => {
    assert.equal(parse({ postal: '0486160000000000' }).value.postal.length, 10);
  });
});

describe('parseListingInput: several mistakes at once', () => {
  test('reports every problem together so the form can mark each field', () => {
    const { errors } = parse({ itemName: '', quantity: 0, address: '' });
    assert.deepEqual(Object.keys(errors).sort(), ['address', 'itemName', 'quantity']);
  });
});

describe('checkPhoto', () => {
  const file = (bytes, size = bytes.length) => ({ buffer: Buffer.from(bytes), size });
  const pad = (head) => [...head, ...new Array(20).fill(0)];
  const PNG = pad([0x89, 0x50, 0x4e, 0x47]);
  const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
  const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP'), 0, 0, 0, 0];

  test('requires a photo', () => {
    assert.match(checkPhoto(undefined).error, /required/);
  });

  test('recognises PNG, JPEG and WebP by their first bytes', () => {
    assert.equal(checkPhoto(file(PNG)).photo.contentType, 'image/png');
    assert.equal(checkPhoto(file(JPEG)).photo.contentType, 'image/jpeg');
    assert.equal(checkPhoto(file(WEBP)).photo.contentType, 'image/webp');
  });

  test('rejects other files even when they are named like images', () => {
    const text = file([...Buffer.from('this is not an image at all')]);
    text.mimetype = 'image/png'; // the claimed type is ignored
    assert.match(checkPhoto(text).error, /JPEG, PNG or WebP/);
  });

  test('rejects a file that is too short to identify', () => {
    assert.match(checkPhoto(file([0x89, 0x50])).error, /JPEG, PNG or WebP/);
  });

  test('rejects photos over 2 MB, accepts exactly 2 MB', () => {
    assert.match(checkPhoto(file(PNG, MAX_PHOTO_BYTES + 1)).error, /2 MB/);
    assert.ok(checkPhoto(file(PNG, MAX_PHOTO_BYTES)).photo);
  });
});

describe('checkPhotos', () => {
  const png = () => ({ buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, ...new Array(20).fill(0)]), size: 24 });

  test('needs at least one photo', () => {
    assert.match(checkPhotos([]).error, /required/);
    assert.match(checkPhotos(undefined).error, /required/);
  });

  test('keeps the upload order, so the first is the cover', () => {
    assert.equal(checkPhotos([png(), png(), png()]).photos.length, 3);
  });

  test(`allows ${MAX_PHOTOS} photos but not more`, () => {
    assert.ok(checkPhotos(Array.from({ length: MAX_PHOTOS }, png)).photos);
    assert.match(checkPhotos(Array.from({ length: MAX_PHOTOS + 1 }, png)).error, /up to/);
  });

  test('names the photo that is not an image', () => {
    const bad = { buffer: Buffer.from('not an image at all, just text'), size: 30 };
    assert.match(checkPhotos([png(), bad]).error, /^Photo 2:/);
  });
});

describe('who can see a listing', () => {
  const owner = { _id: 'owner-id' };
  const sameId = { equals: (other) => other === 'owner-id' };
  const otherId = { equals: () => false };
  const listing = (overrides = {}) => ({ bakery: otherId, visibleToIndividuals: false, priorityUntil: null, ...overrides });
  const verifiedCharity = { role: 'charity', verification: { status: 'approved' } };
  const pendingCharity = { role: 'charity', verification: { status: 'pending' } };

  test('only admins and approved charities have full access', () => {
    assert.equal(hasFullAccess({ role: 'admin' }), true);
    assert.equal(hasFullAccess(verifiedCharity), true);
    assert.equal(hasFullAccess(pendingCharity), false);
    assert.equal(hasFullAccess({ role: 'individual' }), false);
    assert.equal(hasFullAccess({ role: 'bakery' }), false);
    assert.equal(hasFullAccess(null), false);
  });

  test('a listing shared with individuals is visible to everyone, signed in or not', () => {
    assert.equal(canView(listing({ visibleToIndividuals: true }), null, NOW), true);
  });

  test('a charities-only listing is hidden from guests, individuals and pending charities', () => {
    for (const viewer of [null, { role: 'individual', _id: 'x' }, pendingCharity]) {
      assert.equal(canView(listing(), viewer, NOW), false);
    }
  });

  test('a listing in its priority period is hidden until the period ends', () => {
    const inPriority = listing({ priorityUntil: new Date(NOW.getTime() + 60000) });
    assert.equal(canView(inPriority, { role: 'individual', _id: 'x' }, NOW), false);
    assert.equal(canView(inPriority, { role: 'individual', _id: 'x' }, new Date(NOW.getTime() + 60001)), true);
  });

  test('the priority period overrides the old sharing flag', () => {
    const l = listing({ visibleToIndividuals: true, priorityUntil: new Date(NOW.getTime() + 60000) });
    assert.equal(canView(l, null, NOW), false);
  });

  test('verified charities, admins and the owning bakery always see it', () => {
    assert.equal(canView(listing(), verifiedCharity, NOW), true);
    assert.equal(canView(listing(), { role: 'admin' }, NOW), true);
    assert.equal(canView(listing({ bakery: sameId }), owner, NOW), true);
  });

  test('the database filter matches the same rule', () => {
    assert.deepEqual(visibilityFilter(verifiedCharity, NOW), {});
    assert.deepEqual(visibilityFilter({ role: 'admin' }, NOW), {});

    const guest = visibilityFilter(null, NOW).$and[0].$or;
    assert.equal(guest.length, 2);
    assert.deepEqual(guest[0], { priorityUntil: { $lte: NOW } });
    assert.deepEqual(guest[1], { priorityUntil: null, visibleToIndividuals: true });

    const bakery = visibilityFilter({ role: 'bakery', _id: 'owner-id' }, NOW).$and[0].$or;
    assert.deepEqual(bakery.at(-1), { bakery: 'owner-id' });
  });
});
