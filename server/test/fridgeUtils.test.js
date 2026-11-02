import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import mongoose from 'mongoose';
import { FRIDGE_STATUSES as CLIENT_STATUSES } from '../../client/src/utils/fridge.js';
import Fridge, { FRIDGE_STATUSES } from '../src/models/Fridge.js';
import FridgeUpdate from '../src/models/FridgeUpdate.js';
import SpoiledReport from '../src/models/SpoiledReport.js';
import { toFridgeDTO, toReportDTO, toUpdateDTO } from '../src/utils/serializeFridge.js';
import { optionalPhoto, parseFridgeInput, parseSpoiledInput, parseUpdateInput } from '../src/utils/validateFridge.js';

// Unit tests for the community fridge validators, serializers and models.
// These need no database and no running server: `node --test test/fridgeUtils.test.js`.
// (The API-level tests, which use a real in-memory MongoDB, are in fridges.test.js.)

const oid = () => new mongoose.Types.ObjectId();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const file = (buffer, size = buffer.length) => ({ buffer, size });

const validFridge = (over = {}) => ({
  name: 'Tiong Bahru Community Fridge', description: 'Next to the lift.', openingHours: '24 hours',
  address: '30 SENG POH ROAD', postal: '168898', lat: '1.2866', lng: '103.8326', ...over,
});

describe('parseFridgeInput', () => {
  test('accepts a complete fridge, trims it, and stores the location as [lng, lat]', () => {
    const { value, errors } = parseFridgeInput(validFridge({ name: '  Tiong Bahru Fridge  ', openingHours: ' 24 hours ' }));
    assert.deepEqual(errors, {});
    assert.equal(value.name, 'Tiong Bahru Fridge');
    assert.equal(value.openingHours, '24 hours');
    assert.deepEqual(value.location, { type: 'Point', coordinates: [103.8326, 1.2866] }); // GeoJSON order is lng first
  });

  test('description is optional, and there is no fridge-or-pantry "kind" any more', () => {
    const { value, errors } = parseFridgeInput(validFridge({ description: undefined }));
    assert.deepEqual(errors, {});
    assert.equal(value.description, '');
    assert.equal('kind' in value, false);
  });

  test('name must be 2 to 80 characters', () => {
    assert.ok(parseFridgeInput(validFridge({ name: 'x' })).errors.name);
    assert.ok(parseFridgeInput(validFridge({ name: '   ' })).errors.name);
    assert.equal(parseFridgeInput(validFridge({ name: 'ab' })).errors.name, undefined);
    assert.equal(parseFridgeInput(validFridge({ name: 'a'.repeat(80) })).errors.name, undefined);
    assert.ok(parseFridgeInput(validFridge({ name: 'a'.repeat(81) })).errors.name);
  });

  test('opening hours are required, up to 200 characters', () => {
    assert.ok(parseFridgeInput(validFridge({ openingHours: '' })).errors.openingHours);
    assert.ok(parseFridgeInput(validFridge({ openingHours: 'x' })).errors.openingHours);
    assert.equal(parseFridgeInput(validFridge({ openingHours: 'Mon–Sat 8am–9pm' })).errors.openingHours, undefined);
    assert.equal(parseFridgeInput(validFridge({ openingHours: 'a'.repeat(200) })).errors.openingHours, undefined);
    assert.ok(parseFridgeInput(validFridge({ openingHours: 'a'.repeat(201) })).errors.openingHours);
  });

  test('description is capped at 500 characters', () => {
    assert.equal(parseFridgeInput(validFridge({ description: 'a'.repeat(500) })).errors.description, undefined);
    assert.ok(parseFridgeInput(validFridge({ description: 'a'.repeat(501) })).errors.description);
  });

  test('the address must come from the search (non-empty, and coordinates inside Singapore)', () => {
    assert.ok(parseFridgeInput(validFridge({ address: '' })).errors.address);
    assert.ok(parseFridgeInput(validFridge({ address: 'a'.repeat(201) })).errors.address);
    assert.ok(parseFridgeInput(validFridge({ lat: '', lng: '' })).errors.address);
    assert.ok(parseFridgeInput(validFridge({ lat: 'abc' })).errors.address);
    assert.ok(parseFridgeInput(validFridge({ lat: '51.5', lng: '-0.12' })).errors.address); // London
  });

  test('postal code is trimmed and cut to 10 characters', () => {
    assert.equal(parseFridgeInput(validFridge({ postal: ' 168898 ' })).value.postal, '168898');
    assert.equal(parseFridgeInput(validFridge({ postal: '1234567890123' })).value.postal, '1234567890');
  });

  test('reports every problem at once, and copes with a missing or non-text body', () => {
    const { errors } = parseFridgeInput();
    for (const field of ['name', 'openingHours', 'address']) assert.ok(errors[field], `expected an error for ${field}`);
    // objects/arrays (e.g. a query-operator injection attempt) are treated as empty text, not run
    const hostile = parseFridgeInput({ name: { $ne: '' }, openingHours: ['24 hours'], address: { $gt: '' }, lat: '1.28', lng: '103.8' });
    assert.ok(hostile.errors.name && hostile.errors.openingHours && hostile.errors.address);
  });
});

describe('parseUpdateInput', () => {
  test('accepts stocked, low and empty, with an optional note', () => {
    for (const status of ['stocked', 'low', 'empty']) {
      const { value, errors } = parseUpdateInput({ status });
      assert.deepEqual(errors, {});
      assert.deepEqual(value, { status, note: '' });
    }
    assert.equal(parseUpdateInput({ status: 'stocked', note: '  12 croissants  ' }).value.note, '12 croissants');
  });

  test('refuses anything else, including different capitals, empty and non-text values', () => {
    for (const status of ['full', 'Stocked', 'LOW', '', undefined, null, 5, ['low'], { $ne: '' }]) {
      assert.ok(parseUpdateInput({ status }).errors.status, `should refuse ${JSON.stringify(status)}`);
    }
    assert.ok(parseUpdateInput().errors.status);
  });

  test('the note is capped at 300 characters', () => {
    assert.equal(parseUpdateInput({ status: 'low', note: 'a'.repeat(300) }).errors.note, undefined);
    assert.ok(parseUpdateInput({ status: 'low', note: 'a'.repeat(301) }).errors.note);
  });
});

describe('parseSpoiledInput', () => {
  test('accepts what is spoiled, with an optional note and an optional drop-off id', () => {
    const id = String(oid());
    const { value, errors } = parseSpoiledInput({ items: '  Sourdough loaves ', note: ' mouldy ', updateId: id });
    assert.deepEqual(errors, {});
    assert.deepEqual(value, { items: 'Sourdough loaves', note: 'mouldy', updateId: id });
    assert.deepEqual(parseSpoiledInput({ items: 'Rice' }).value, { items: 'Rice', note: '', updateId: '' });
  });

  test('"what is spoiled" must be 2 to 200 characters', () => {
    assert.ok(parseSpoiledInput({ items: '' }).errors.items);
    assert.ok(parseSpoiledInput({ items: 'x' }).errors.items);
    assert.equal(parseSpoiledInput({ items: 'ab' }).errors.items, undefined);
    assert.equal(parseSpoiledInput({ items: 'a'.repeat(200) }).errors.items, undefined);
    assert.ok(parseSpoiledInput({ items: 'a'.repeat(201) }).errors.items);
    assert.ok(parseSpoiledInput({ items: { $ne: '' } }).errors.items);
    assert.ok(parseSpoiledInput().errors.items);
  });

  test('the note is capped at 300 characters', () => {
    assert.equal(parseSpoiledInput({ items: 'Rice', note: 'a'.repeat(300) }).errors.note, undefined);
    assert.ok(parseSpoiledInput({ items: 'Rice', note: 'a'.repeat(301) }).errors.note);
  });

  test('a drop-off id, when given, must be a valid id', () => {
    assert.ok(parseSpoiledInput({ items: 'Rice', updateId: 'not-an-id' }).errors.updateId);
    assert.equal(parseSpoiledInput({ items: 'Rice', updateId: '' }).errors.updateId, undefined);
    assert.equal(parseSpoiledInput({ items: 'Rice', updateId: String(oid()) }).errors.updateId, undefined);
  });
});

describe('optionalPhoto', () => {
  test('no file is fine', () => {
    assert.deepEqual(optionalPhoto(undefined), { photo: null });
    assert.deepEqual(optionalPhoto(null), { photo: null });
  });

  test('accepts PNG, JPEG and WebP, judged by the file contents, not the name', () => {
    assert.equal(optionalPhoto(file(PNG)).photo.contentType, 'image/png');
    assert.equal(optionalPhoto(file(JPEG)).photo.contentType, 'image/jpeg');
    assert.equal(optionalPhoto(file(WEBP)).photo.contentType, 'image/webp');
    assert.equal(optionalPhoto(file(PNG)).error, undefined);
  });

  test('refuses scripts, text and other non-images', () => {
    assert.match(optionalPhoto(file(Buffer.from('<script>alert(1)</script>'))).error, /JPEG, PNG or WebP/);
    assert.match(optionalPhoto(file(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).error, /JPEG, PNG or WebP/);
    assert.ok(optionalPhoto(file(Buffer.alloc(0))).error);
  });

  test('refuses photos over 2 MB', () => {
    assert.match(optionalPhoto(file(PNG, 2 * 1024 * 1024 + 1)).error, /2 MB/);
    assert.equal(optionalPhoto(file(PNG, 2 * 1024 * 1024)).error, undefined);
  });
});

describe('toFridgeDTO', () => {
  const stored = (over = {}) => ({
    _id: oid(), name: 'Tampines Hub Fridge', description: 'Level 1', openingHours: 'Daily 8am–10pm', address: '1 TAMPINES WALK', postal: '528523',
    location: { type: 'Point', coordinates: [103.9406, 1.3541] }, createdBy: oid(), createdByName: 'Alex Tan',
    latestStatus: 'low', latestUpdateAt: new Date('2026-01-01T10:00:00Z'), latestNote: 'Two sandwiches left',
    createdAt: new Date('2025-12-01T00:00:00Z'), updatedAt: new Date('2026-01-01T10:00:00Z'), ...over,
  });

  test('gives the shape the website expects, with lat and lng the right way round', () => {
    const doc = stored();
    const dto = toFridgeDTO(doc, { openSpoiledReports: 2 });
    assert.equal(dto.id, String(doc._id));
    assert.equal(dto.lat, 1.3541);
    assert.equal(dto.lng, 103.9406);
    assert.equal(dto.latestStatus, 'low');
    assert.equal(dto.latestNote, 'Two sandwiches left');
    assert.equal(dto.openSpoiledReports, 2);
    assert.deepEqual(dto.createdBy, { id: String(doc.createdBy), name: 'Alex Tan' });
    assert.equal('kind' in dto, false);
  });

  test('a fridge nobody has reported on shows "unknown" with no time and no note', () => {
    const dto = toFridgeDTO(stored({ latestStatus: undefined, latestUpdateAt: undefined, latestNote: undefined }));
    assert.equal(dto.latestStatus, 'unknown');
    assert.equal(dto.latestUpdateAt, null);
    assert.equal(dto.latestNote, '');
    assert.equal(dto.openSpoiledReports, 0);
  });

  test('distance is in kilometres to 2 decimals, and null when the search was not by location', () => {
    assert.equal(toFridgeDTO(stored({ distanceM: 1234.567 })).distanceKm, 1.23);
    assert.equal(toFridgeDTO(stored({ distanceM: 0 })).distanceKm, 0);
    assert.equal(toFridgeDTO(stored()).distanceKm, null);
  });

  test('links to the photo but never includes the photo bytes', () => {
    const withPhoto = toFridgeDTO(stored({ photo: { data: Buffer.from('secret-bytes'), contentType: 'image/png' } }));
    assert.match(withPhoto.photoUrl, /^\/api\/fridges\/[0-9a-f]{24}\/photo\?v=\d+$/);
    assert.equal(JSON.stringify(withPhoto).includes('secret-bytes'), false);
    assert.equal('photo' in withPhoto, false);
    assert.equal(toFridgeDTO(stored()).photoUrl, null);
  });

  test('works on a Mongoose document as well as a plain object', () => {
    const doc = new Fridge({ name: 'Doc Fridge', openingHours: '24 hours', address: 'x', location: { coordinates: [103.8, 1.3] }, createdBy: oid(), createdByName: 'Alex' });
    const dto = toFridgeDTO(doc);
    assert.equal(dto.id, String(doc._id));
    assert.equal(dto.latestStatus, 'unknown'); // the schema default
    assert.equal(dto.lat, 1.3);
  });
});

describe('toUpdateDTO', () => {
  const stored = (over = {}) => ({ _id: oid(), fridge: oid(), author: oid(), authorName: 'Sunrise Bakery', authorRole: 'bakery', status: 'stocked', note: '12 croissants', createdAt: new Date(), ...over });

  test('includes who posted it and their role (used for the "Supplier" label)', () => {
    const doc = stored();
    const dto = toUpdateDTO(doc);
    assert.equal(dto.fridgeId, String(doc.fridge));
    assert.deepEqual(dto.author, { id: String(doc.author), name: 'Sunrise Bakery', role: 'bakery' });
    assert.equal(dto.status, 'stocked');
    assert.equal(dto.photoUrl, null);
  });

  test('links to the update photo, without including its bytes', () => {
    const doc = stored({ photo: { data: Buffer.from('secret-bytes'), contentType: 'image/jpeg' } });
    const dto = toUpdateDTO(doc);
    assert.equal(dto.photoUrl, `/api/fridges/${doc.fridge}/updates/${doc._id}/photo`);
    assert.equal(JSON.stringify(dto).includes('secret-bytes'), false);
  });
});

describe('toReportDTO', () => {
  const stored = (over = {}) => ({
    _id: oid(), fridge: oid(), fridgeName: 'Tiong Bahru Community Fridge', items: 'Sourdough loaves', note: 'mouldy', reportedBy: oid(), reportedByName: 'Alex Tan',
    suppliers: [oid()], status: 'open', createdAt: new Date(), ...over,
  });

  test('says how many suppliers were told, but not who they are', () => {
    const doc = stored({ suppliers: [oid(), oid()] });
    const dto = toReportDTO(doc);
    assert.equal(dto.suppliersNotified, 2);
    assert.equal(JSON.stringify(dto).includes(String(doc.suppliers[0])), false);
    assert.deepEqual(dto.fridge, { id: String(doc.fridge), name: 'Tiong Bahru Community Fridge' });
    assert.equal(dto.reportedByName, 'Alex Tan');
  });

  test('an unmatched report has no suppliers, and an open one has no resolution yet', () => {
    const dto = toReportDTO(stored({ suppliers: [] }));
    assert.equal(dto.suppliersNotified, 0);
    assert.equal(dto.updateId, null);
    assert.equal(dto.resolution, '');
    assert.equal(dto.resolvedByName, '');
    assert.equal(dto.resolvedAt, null);
    assert.equal(toReportDTO(stored({ suppliers: undefined })).suppliersNotified, 0);
  });

  test('shows the flagged drop-off, the resolution and the photo link when there are any', () => {
    const update = oid();
    const doc = stored({ update, status: 'resolved', resolution: 'Collected and binned', resolvedByName: 'Sunrise Bakery', resolvedAt: new Date(), photo: { data: Buffer.from('x'), contentType: 'image/png' } });
    const dto = toReportDTO(doc);
    assert.equal(dto.updateId, String(update));
    assert.equal(dto.status, 'resolved');
    assert.equal(dto.resolution, 'Collected and binned');
    assert.equal(dto.photoUrl, `/api/fridges/alerts/${doc._id}/photo`);
  });
});

describe('models', () => {
  test('the server and the website agree on the list of statuses', () => {
    assert.deepEqual(FRIDGE_STATUSES, ['stocked', 'low', 'empty']);
    assert.deepEqual(FRIDGE_STATUSES, CLIENT_STATUSES); // client/src/utils/fridge.js must match server/src/models/Fridge.js
  });

  test('a new fridge starts with no status, and only a known status can be stored', async () => {
    const fridge = new Fridge({ name: 'F', openingHours: '24 hours', address: 'x', location: { coordinates: [103.8, 1.3] }, createdBy: oid(), createdByName: 'A' });
    assert.equal(fridge.latestStatus, 'unknown');
    assert.equal(fridge.status, 'active');
    await fridge.validate();
    fridge.latestStatus = 'full';
    await assert.rejects(() => fridge.validate(), /latestStatus/);
  });

  test('an update needs a fridge, an author and a known status', async () => {
    await assert.rejects(() => new FridgeUpdate({ status: 'stocked' }).validate(), /fridge/);
    const ok = { fridge: oid(), author: oid(), authorName: 'A', authorRole: 'bakery' };
    await new FridgeUpdate({ ...ok, status: 'empty' }).validate();
    await assert.rejects(() => new FridgeUpdate({ ...ok, status: 'full' }).validate(), /status/);
  });

  test('a spoiled-food report starts open, and needs to say what is spoiled', async () => {
    const base = { fridge: oid(), fridgeName: 'F', reportedBy: oid(), reportedByName: 'A' };
    const report = new SpoiledReport({ ...base, items: 'Rice' });
    assert.equal(report.status, 'open');
    assert.deepEqual([...report.suppliers], []);
    await report.validate();
    await assert.rejects(() => new SpoiledReport(base).validate(), /items/);
  });
});
