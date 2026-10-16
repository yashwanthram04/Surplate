import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { boot } from './helpers.js';

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let ctx, SUNRISE, CRUMB, ALEX, HOPE, ADMIN;
before(async () => {
  ctx = await boot(); // private in-memory MongoDB, seeded with the demo users, listings and fridges
  SUNRISE = await ctx.login('sunrise@demo.surplate.sg'); // bakery, posted at Tiong Bahru
  CRUMB = await ctx.login('crumb@demo.surplate.sg'); // bakery, posted at Toa Payoh
  ALEX = await ctx.login('alex@demo.surplate.sg'); // individual
  HOPE = await ctx.login('hope@demo.surplate.sg'); // charity
  ADMIN = await ctx.login('admin@demo.surplate.sg');
});
after(() => ctx?.close());

const call = (path, { user, ...init } = {}) => ctx.call(path, { ...init, as: user });
function form(fields, photo) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (photo) fd.append('photo', new Blob([photo], { type: 'image/png' }), 'p.png');
  return fd;
}
const validFridge = (over = {}) => ({
  name: 'Test community fridge', kind: 'fridge', openingHours: '24 hours', description: 'Next to the lift.',
  address: '30 SENG POH ROAD', postal: '168898', lat: '1.2866', lng: '103.8326', ...over,
});
const addFridge = (fields = validFridge(), user = ALEX, photo) => call('/fridges', { method: 'POST', user, body: form(fields, photo) });
const postUpdate = (id, fields, user = ALEX, photo) => call(`/fridges/${id}/updates`, { method: 'POST', user, body: form(fields, photo) });
const flag = (id, fields, user = ALEX, photo) => call(`/fridges/${id}/spoiled`, { method: 'POST', user, body: form(fields, photo) });
const list = async (qs = '', user) => (await (await call(`/fridges?${qs}`, { user })).json()).items;
const names = async (qs, user) => (await list(qs, user)).map((f) => f.name);
const seeded = async (name) => (await list()).find((f) => f.name === name);

describe('browsing the map', () => {
  test('anyone, even signed out, sees fridges with their latest status and last-updated time', async () => {
    const tiong = await seeded('Tiong Bahru Community Fridge');
    assert.equal(tiong.latestStatus, 'stocked');
    assert.ok(tiong.latestUpdateAt);
    assert.equal(tiong.kind, 'fridge');
    assert.ok(tiong.photoUrl);
    assert.equal(typeof tiong.lat, 'number');
    assert.equal((await seeded('Jurong West Pantry')).latestStatus, 'unknown');
    assert.equal((await seeded('Jurong West Pantry')).latestUpdateAt, null);
  });

  test('filters: status, type, search text', async () => {
    assert.ok((await names('status=low')).includes('Bugis Neighbourhood Pantry'));
    assert.ok(!(await names('status=low')).includes('Tiong Bahru Community Fridge'));
    assert.ok((await names('status=unknown')).includes('Jurong West Pantry'));
    const pantries = await list('kind=pantry');
    assert.ok(pantries.length >= 2 && pantries.every((f) => f.kind === 'pantry'));
    assert.deepEqual(await names('q=tampines'), ['Tampines Hub Fridge']);
    assert.deepEqual(await names('q=.*'), []); // regex characters are treated literally
  });

  test('distance filter returns nearest-first within the radius', async () => {
    const near = await list('lat=1.3&lng=103.8559&radiusKm=1');
    assert.ok(near.some((f) => f.name === 'Bugis Neighbourhood Pantry'));
    assert.ok(near.every((f) => f.distanceKm <= 1));
    const wide = await list('lat=1.3&lng=103.8559&radiusKm=20&sort=distance');
    assert.deepEqual(wide.map((f) => f.distanceKm), wide.map((f) => f.distanceKm).sort((a, b) => a - b));
  });

  test('garbage query params do not crash the map', async () => {
    assert.equal((await call('/fridges?lat=abc&lng=&status[$ne]=x&q[$gt]=')).status, 200);
  });

  test('detail page, bad ids and unknown ids', async () => {
    const tiong = await seeded('Tiong Bahru Community Fridge');
    const res = await call(`/fridges/${tiong.id}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.openingHours, '24 hours');
    assert.equal(body.openSpoiledReports, 1); // the seeded report about the sourdough loaves
    assert.equal((await call('/fridges/not-an-id')).status, 404);
    assert.equal((await call('/fridges/64b0000000000000000000ff')).status, 404);
  });
});

describe('adding and managing fridges', () => {
  test('a signed-in user can add a fridge, and it appears on the map (photo is optional)', async () => {
    const res = await addFridge(validFridge({ name: 'Added without photo' }));
    assert.equal(res.status, 201);
    const f = await res.json();
    assert.equal(f.latestStatus, 'unknown');
    assert.equal(f.createdBy.name, 'Alex Tan');
    assert.equal(f.photoUrl, null);
    assert.ok((await names('q=without photo')).includes('Added without photo'));
  });

  test('a photo is stored and served', async () => {
    const f = await (await addFridge(validFridge({ name: 'Added with photo' }), HOPE, PNG)).json();
    assert.ok(f.photoUrl);
    const photo = await call(f.photoUrl.replace('/api', ''));
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.match((await call(`/fridges/${(await seeded('Jurong West Pantry')).id}/photo`)).headers.get('content-type'), /^image\/svg\+xml/); // demo fridges have generated photos
  });

  test('requires login', async () => {
    assert.equal((await addFridge(validFridge(), null)).status, 401);
  });

  test('rejects bad input with per-field messages', async () => {
    const res = await addFridge(validFridge({ name: 'x', openingHours: '', address: '', lat: '51.5', lng: '-0.12' }), ALEX, Buffer.from('<script>alert(1)</script>'));
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    for (const f of ['name', 'openingHours', 'address', 'photo']) assert.ok(fields[f], `expected an error for ${f}`);
  });

  test('only the creator or an admin can edit or remove', async () => {
    const { id } = await (await addFridge(validFridge({ name: 'Manage me' }))).json();
    const put = (user, over = {}) => call(`/fridges/${id}`, { method: 'PUT', user, body: form(validFridge({ name: 'Managed!', ...over })) });

    assert.equal((await put(HOPE)).status, 403);
    assert.equal((await call(`/fridges/${id}`, { method: 'DELETE', user: HOPE })).status, 403);
    assert.equal((await put(null)).status, 401);

    const edited = await put(ALEX, { openingHours: 'Mon–Fri 8am–6pm' });
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).openingHours, 'Mon–Fri 8am–6pm');
    assert.equal((await put(ADMIN, { name: 'Admin edit' })).status, 200);
    assert.equal((await put(ALEX, { name: '' })).status, 422);

    assert.equal((await call(`/fridges/${id}`, { method: 'DELETE', user: ALEX })).status, 204);
    assert.equal((await call(`/fridges/${id}`)).status, 404);
    assert.ok(!(await names('q=Admin edit')).includes('Admin edit'));
  });

  test('an admin can remove someone else\'s fridge', async () => {
    const { id } = await (await addFridge(validFridge({ name: 'Admin will remove' }), HOPE)).json();
    assert.equal((await call(`/fridges/${id}`, { method: 'DELETE', user: ADMIN })).status, 204);
  });
});

describe('status updates', () => {
  test('posting an update changes the fridge\'s latest status and last-updated time', async () => {
    const f = await (await addFridge(validFridge({ name: 'Status fridge' }), ALEX, PNG)).json(); // has a photo, so we can check its URL stays stable
    const before = Date.now();

    const first = await postUpdate(f.id, { status: 'stocked', note: ' 12 croissants ' }, SUNRISE, PNG);
    assert.equal(first.status, 201);
    const u1 = await first.json();
    assert.equal(u1.note, '12 croissants');
    assert.equal(u1.author.role, 'bakery');
    assert.ok(u1.photoUrl);

    let detail = await (await call(`/fridges/${f.id}`)).json();
    assert.equal(detail.latestStatus, 'stocked');
    assert.equal(detail.latestNote, '12 croissants');
    assert.ok(new Date(detail.latestUpdateAt).getTime() >= before - 1000);
    const photoUrlBefore = detail.photoUrl;

    await new Promise((r) => setTimeout(r, 20));
    await postUpdate(f.id, { status: 'empty' }, ALEX);
    detail = await (await call(`/fridges/${f.id}`)).json();
    assert.equal(detail.latestStatus, 'empty');
    assert.equal(detail.latestNote, '');
    assert.equal(detail.photoUrl, photoUrlBefore, 'status updates do not change the fridge photo URL');

    const history = await (await call(`/fridges/${f.id}/updates`)).json();
    assert.deepEqual(history.items.map((u) => u.status), ['empty', 'stocked']); // newest first
    assert.equal(history.nextBefore, null);
    assert.equal((await call(history.items[1].photoUrl.replace('/api', ''))).headers.get('content-type'), 'image/png');
  });

  test('requires login, a valid status, and a short note', async () => {
    const f = await (await addFridge(validFridge({ name: 'Validation fridge' }))).json();
    assert.equal((await postUpdate(f.id, { status: 'stocked' }, null)).status, 401);
    const res = await postUpdate(f.id, { status: 'full', note: 'x'.repeat(301) });
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    assert.ok(fields.status && fields.note);
    assert.equal((await postUpdate(f.id, { status: 'low' }, ALEX, Buffer.from('not an image'))).status, 422);
    assert.equal((await postUpdate('64b0000000000000000000ff', { status: 'low' })).status, 404);
  });

  test('flooding is limited', async () => {
    const f = await (await addFridge(validFridge({ name: 'Flood fridge' }))).json();
    for (let i = 0; i < 10; i++) assert.equal((await postUpdate(f.id, { status: 'low' }, HOPE)).status, 201);
    assert.equal((await postUpdate(f.id, { status: 'low' }, HOPE)).status, 429);
    assert.equal((await postUpdate(f.id, { status: 'low' }, ALEX)).status, 201, 'the limit is per person');
  });

  test('history is paginated, newest first', async () => {
    const f = await (await addFridge(validFridge({ name: 'Busy fridge' }))).json();
    const { default: FridgeUpdate } = await import('../src/models/FridgeUpdate.js');
    const author = (await (await call('/auth/me', { user: ALEX })).json()).user;
    const base = Date.now() - 100 * 60000;
    await FridgeUpdate.insertMany(Array.from({ length: 25 }, (_, i) => ({
      fridge: f.id, author: author.id, authorName: author.name, authorRole: author.role, status: 'low', note: `update ${i}`, createdAt: new Date(base + i * 60000),
    })));
    const page1 = await (await call(`/fridges/${f.id}/updates`)).json();
    assert.equal(page1.items.length, 20);
    assert.equal(page1.items[0].note, 'update 24');
    assert.ok(page1.nextBefore);
    const page2 = await (await call(`/fridges/${f.id}/updates?before=${encodeURIComponent(page1.nextBefore)}`)).json();
    assert.equal(page2.items.length, 5);
    assert.equal(page2.items[0].note, 'update 4');
    assert.equal(page2.nextBefore, null);
  });
});

describe('flagging spoiled food and notifying suppliers', () => {
  const alerts = async (user, status = 'open') => (await (await call(`/fridges/alerts?status=${status}`, { user })).json()).items;

  test('a general report notifies the bakeries that posted at that fridge recently, and nobody else', async () => {
    const toaPayoh = await seeded('Toa Payoh Lorong 4 Fridge'); // Crumb & Co dropped off 15 loaves 20 minutes ago
    const res = await flag(toaPayoh.id, { items: 'Banana bread (general)', note: 'Smells off' }, HOPE, PNG);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.suppliersNotified, 1);
    assert.equal(body.report.fridge.name, 'Toa Payoh Lorong 4 Fridge');

    assert.ok((await alerts(CRUMB)).some((r) => r.items === 'Banana bread (general)'));
    assert.ok(!(await alerts(SUNRISE)).some((r) => r.items === 'Banana bread (general)'), 'another bakery is not told');
    assert.ok((await alerts(ADMIN)).some((r) => r.items === 'Banana bread (general)'), 'admins see everything');
    assert.equal((await (await call('/fridges/alerts/count', { user: CRUMB })).json()).open >= 1, true);

    const photo = await call(body.report.photoUrl.replace('/api', ''), { user: CRUMB });
    assert.equal(photo.status, 200);
    assert.equal((await call(body.report.photoUrl.replace('/api', ''), { user: SUNRISE })).status, 404, 'photo is private to the people involved');
    assert.equal((await call(body.report.photoUrl.replace('/api', ''))).status, 401);
  });

  test('the fridge shows an open-report warning', async () => {
    const toaPayoh = await seeded('Toa Payoh Lorong 4 Fridge');
    assert.ok(toaPayoh.openSpoiledReports >= 1);
  });

  test('flagging one drop-off notifies only the bakery that made it', async () => {
    const tiong = await seeded('Tiong Bahru Community Fridge');
    const { items } = await (await call(`/fridges/${tiong.id}/updates`)).json();
    const bakeryDrop = items.find((u) => u.author.role === 'bakery');
    const res = await flag(tiong.id, { items: 'Egg tarts (specific)', updateId: bakeryDrop.id }, HOPE);
    assert.equal((await res.json()).suppliersNotified, 1);
    assert.ok((await alerts(SUNRISE)).some((r) => r.items === 'Egg tarts (specific)'));
    assert.ok(!(await alerts(CRUMB)).some((r) => r.items === 'Egg tarts (specific)'));
  });

  test('a drop-off by a non-bakery has no supplier to notify, but admins still see the report', async () => {
    const tiong = await seeded('Tiong Bahru Community Fridge');
    const { items } = await (await call(`/fridges/${tiong.id}/updates`)).json();
    const personDrop = items.find((u) => u.author.role === 'individual');
    const body = await (await flag(tiong.id, { items: 'Salad (individual)', updateId: personDrop.id }, ALEX)).json(); // Alex, because Hope already has an open report here (one per person per hour)
    assert.equal(body.suppliersNotified, 0);
    assert.ok((await alerts(ADMIN)).some((r) => r.items === 'Salad (individual)'));
    assert.ok(!(await alerts(SUNRISE)).some((r) => r.items === 'Salad (individual)'));
  });

  test('validation, login, unknown update, and duplicate reports', async () => {
    const bugis = await seeded('Bugis Neighbourhood Pantry');
    assert.equal((await flag(bugis.id, { items: 'Rice' }, null)).status, 401);
    const bad = await flag(bugis.id, { items: '' });
    assert.equal(bad.status, 422);
    assert.ok((await bad.json()).fields.items);
    const unknown = await flag(bugis.id, { items: 'Rice', updateId: '64b0000000000000000000ff' });
    assert.equal(unknown.status, 422);
    assert.ok((await unknown.json()).fields.updateId);

    assert.equal((await flag(bugis.id, { items: 'Tinned soup' })).status, 201);
    assert.equal((await flag(bugis.id, { items: 'Tinned soup again' })).status, 409, 'one report per person per fridge per hour');
  });

  test('only bakeries and admins can read alerts, and only a notified supplier or admin can resolve', async () => {
    assert.equal((await call('/fridges/alerts')).status, 401);
    assert.equal((await call('/fridges/alerts', { user: ALEX })).status, 403);
    assert.equal((await call('/fridges/alerts', { user: HOPE })).status, 403);

    const report = (await alerts(SUNRISE)).find((r) => r.items === 'Sourdough loaves'); // from the demo data
    assert.ok(report);
    const resolve = (user, json = {}) => call(`/fridges/alerts/${report.id}/resolve`, { method: 'POST', user, headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) });

    assert.equal((await resolve(ALEX)).status, 403);
    assert.equal((await resolve(CRUMB)).status, 403, 'a bakery the report was not sent to');
    const done = await resolve(SUNRISE, { resolution: 'Collected and binned' });
    assert.equal(done.status, 200);
    const body = await done.json();
    assert.equal(body.status, 'resolved');
    assert.equal(body.resolvedByName, 'Sunrise Bakery');
    assert.equal((await resolve(SUNRISE)).status, 409, 'already resolved');

    assert.ok(!(await alerts(SUNRISE)).some((r) => r.id === report.id));
    assert.ok((await alerts(SUNRISE, 'resolved')).some((r) => r.id === report.id));
    const tiong = await seeded('Tiong Bahru Community Fridge');
    assert.equal((await (await call(`/fridges/${tiong.id}`)).json()).openSpoiledReports, 2, 'only the report resolved above is cleared');
  });
});
