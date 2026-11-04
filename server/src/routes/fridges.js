import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { requireLogin, requireRole } from '../middleware/auth.js';
import Fridge, { FOOD_STALE_MS, FOOD_STATUSES, FRIDGE_STATUSES } from '../models/Fridge.js';
import FridgeUpdate from '../models/FridgeUpdate.js';
import SpoiledReport from '../models/SpoiledReport.js';
import { activeCheck, foodMayBeStale, toReportDTO, toFridgeDTO, toUpdateDTO } from '../utils/serializeFridge.js';
import { MAX_PHOTO_BYTES, toList } from '../utils/validate.js';
import { optionalPhoto, parseFridgeInput, parseSpoiledInput, parseUpdateInput } from '../utils/validateFridge.js';

const router = Router();
const BROWSE_LIMIT = 200;
const UPDATES_PAGE = 10; // the fridge page shows only the 10 most recent updates
const HOUR_MS = 3600 * 1000;
const SUPPLIER_WINDOW_MS = 72 * HOUR_MS; // a general spoiled report goes to bakeries who posted here in this window
const MAX_UPDATES_PER_HOUR = 10; // per person per fridge: stops accidental or abusive flooding
const MAX_UPDATES_PER_HOUR_TOTAL = 30; // per person across all fridges
const MAX_REPORTS_PER_HOUR = 5; // spoiled reports per person across all fridges (each one notifies a bakery)
const MAX_FRIDGES_PER_DAY = 10; // new fridges per person; admins are exempt
const DROP_OFF_STATUSES = FOOD_STATUSES; // an "empty" post means nothing was left, so it is not a drop-off
const requireSupplierOrAdmin = requireRole('bakery', 'admin');
const requireAdmin = requireRole('admin');

// ---- helpers ------------------------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be 2 MB or smaller.' : 'Could not read the uploaded photo.';
    res.status(422).json({ error: 'Please fix the highlighted fields.', fields: { photo: message } });
  });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v) => (typeof v === 'string' ? v : '');
const invalid = (res, fields) => res.status(422).json({ error: 'Please fix the highlighted fields.', fields });
const tooFast = (res, error = 'You are posting very quickly. Please wait a little before posting again.') => res.status(429).json({ error });
const since = (ms) => ({ $gte: new Date(Date.now() - ms) });

// Photos are served with the same hardening headers as listing photos.
function sendPhoto(res, photo) {
  res.set({
    'Content-Type': photo.contentType,
    'Cache-Control': 'public, max-age=3600', // the ?v= query (fridges) or the id (updates) changes when the photo does
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.send(photo.data);
}

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Fridge not found.' });
  next();
});
router.param('updateId', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Update not found.' });
  next();
});
router.param('reportId', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Report not found.' });
  next();
});

/** Loads the active fridge (without its photo bytes) into req.fridge. */
async function loadFridge(req, res, next) {
  const fridge = await Fridge.findOne({ _id: req.params.id, status: 'active' }).select('-photo.data');
  if (!fridge) return res.status(404).json({ error: 'Fridge not found.' });
  req.fridge = fridge;
  next();
}
const canManage = (fridge, user) => user.role === 'admin' || fridge.createdBy.equals(user._id);

/** Map of fridge id -> number of open spoiled-food reports, so the UI can warn people. */
async function openReportCounts(ids) {
  if (!ids.length) return new Map();
  const rows = await SpoiledReport.aggregate([
    { $match: { status: 'open', fridge: { $in: ids } } },
    { $group: { _id: '$fridge', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

/**
 * The status filters on the map. A stocked/low fridge with no update for FOOD_STALE_MS isn't counted as
 * stocked or low: it shows as "stale" (needs a check) instead, so nobody walks over for food that may be old.
 */
function statusCondition(status, staleCutoff) {
  if (status === 'stale') return { latestStatus: { $in: FOOD_STATUSES }, latestUpdateAt: { $lte: staleCutoff } };
  if (FOOD_STATUSES.includes(status)) return { latestStatus: status, latestUpdateAt: { $gt: staleCutoff } };
  return { latestStatus: status };
}
const staleFridgeFilter = () => ({ status: 'active', latestStatus: { $in: FOOD_STATUSES }, latestUpdateAt: { $lte: new Date(Date.now() - FOOD_STALE_MS) } });

// ==================================================================================================
// Spoiled-food alerts for suppliers (bakeries) and admins.
// These routes come BEFORE '/:id' so that "alerts" is never read as a fridge id.
// ==================================================================================================

// GET /api/fridges/alerts?status=open|resolved – bakeries see reports sent to them; admins see all.
router.get('/alerts', requireSupplierOrAdmin, async (req, res) => {
  const filter = { status: req.query.status === 'resolved' ? 'resolved' : 'open' };
  if (req.user.role === 'bakery') filter.suppliers = req.user._id;
  const docs = await SpoiledReport.find(filter).select('-photo.data').sort({ createdAt: -1 }).limit(100);
  res.json({ items: docs.map(toReportDTO) });
});

// GET /api/fridges/alerts/count – number of open alerts, for the badge in the navigation bar.
// For admins, `open` also counts stale fridges that nobody is checking yet (`reports` and `stale` give the split).
router.get('/alerts/count', requireSupplierOrAdmin, async (req, res) => {
  const filter = { status: 'open' };
  if (req.user.role === 'bakery') filter.suppliers = req.user._id;
  const reports = await SpoiledReport.countDocuments(filter);
  if (req.user.role !== 'admin') return res.json({ open: reports });
  const staleFridges = await Fridge.find(staleFridgeFilter()).select('latestStatus latestUpdateAt checkingAt').lean();
  const stale = staleFridges.filter((f) => !activeCheck(f)).length;
  res.json({ open: reports + stale, reports, stale });
});

// GET /api/fridges/alerts/stale – admins: fridges whose food may be stale, oldest update first.
router.get('/alerts/stale', requireAdmin, async (req, res) => {
  const docs = await Fridge.find(staleFridgeFilter()).select('-photo.data').sort({ latestUpdateAt: 1 }).limit(BROWSE_LIMIT).lean();
  const counts = await openReportCounts(docs.map((d) => d._id));
  res.json({ items: docs.map((d) => toFridgeDTO(d, { openSpoiledReports: counts.get(String(d._id)) ?? 0 })) });
});

// GET /api/fridges/alerts/:reportId/photo – only the reporter, the notified suppliers and admins.
router.get('/alerts/:reportId/photo', requireLogin, async (req, res) => {
  const doc = await SpoiledReport.findById(req.params.reportId).select('photo reportedBy suppliers');
  const allowed = doc && (req.user.role === 'admin' || doc.reportedBy.equals(req.user._id) || doc.suppliers.some((s) => s.equals(req.user._id)));
  if (!allowed || !doc.photo?.data) return res.status(404).end();
  sendPhoto(res, doc.photo);
});

// POST /api/fridges/alerts/:reportId/resolve  { resolution? } – a notified supplier (or an admin) marks it handled.
router.post('/alerts/:reportId/resolve', requireSupplierOrAdmin, async (req, res) => {
  const report = await SpoiledReport.findById(req.params.reportId).select('-photo.data');
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  if (req.user.role === 'bakery' && !report.suppliers.some((s) => s.equals(req.user._id))) {
    return res.status(403).json({ error: 'This report was not sent to you.' });
  }
  if (report.status === 'resolved') return res.status(409).json({ error: 'This report has already been resolved.' });
  const resolution = str(req.body?.resolution).trim();
  if (resolution.length > 300) return invalid(res, { resolution: 'Keep it to 300 characters.' });

  report.set({ status: 'resolved', resolution, resolvedBy: req.user._id, resolvedByName: req.user.name, resolvedAt: new Date() });
  await report.save();
  res.json(toReportDTO(report));
});

// ==================================================================================================
// Fridges
// ==================================================================================================

// GET /api/fridges – public map/list. Anyone, logged in or not, can browse.
//   ?q=text &status=stocked,low,empty,unknown,stale &lat=&lng=&radiusKm= &sort=recent|distance|name
router.get('/', async (req, res) => {
  const filter = { status: 'active' };
  const and = [];
  const wanted = toList(req.query.status).filter((s) => [...FRIDGE_STATUSES, 'unknown', 'stale'].includes(s));
  if (wanted.length) {
    const staleCutoff = new Date(Date.now() - FOOD_STALE_MS);
    and.push({ $or: wanted.map((s) => statusCondition(s, staleCutoff)) });
  }
  const text = str(req.query.q).trim().slice(0, 60);
  if (text) {
    const rx = new RegExp(escapeRegex(text), 'i');
    and.push({ $or: [{ name: rx }, { address: rx }, { description: rx }] });
  }
  if (and.length) filter.$and = and;

  const lat = parseFloat(str(req.query.lat));
  const lng = parseFloat(str(req.query.lng));
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const radiusKm = Math.min(Math.max(parseFloat(str(req.query.radiusKm)) || 5, 0.5), 50);
  const sortKey = ['recent', 'distance', 'name'].includes(req.query.sort) ? req.query.sort : hasGeo ? 'distance' : 'recent';

  const pipeline = [];
  if (hasGeo) {
    pipeline.push({
      $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distanceM', maxDistance: radiusKm * 1000, spherical: true, query: filter },
    });
  } else {
    pipeline.push({ $match: filter });
  }
  if (sortKey === 'recent') pipeline.push({ $sort: { latestUpdateAt: -1, _id: 1 } }); // fridges with no update sort last
  else if (sortKey === 'name') pipeline.push({ $sort: { name: 1, _id: 1 } });
  else if (!hasGeo) pipeline.push({ $sort: { latestUpdateAt: -1, _id: 1 } }); // distance sort needs a location
  pipeline.push({ $project: { 'photo.data': 0 } }, { $limit: BROWSE_LIMIT });

  const docs = await Fridge.aggregate(pipeline);
  const counts = await openReportCounts(docs.map((d) => d._id));
  res.json({ items: docs.map((d) => toFridgeDTO(d, { openSpoiledReports: counts.get(String(d._id)) ?? 0 })) });
});

// POST /api/fridges (multipart/form-data, optional photo in field "photo") – any logged-in user.
router.post('/', requireLogin, uploadPhoto, async (req, res) => {
  const { value, errors } = parseFridgeInput(req.body);
  const { photo, error } = optionalPhoto(req.file);
  if (error) errors.photo = error;
  if (Object.keys(errors).length) return invalid(res, errors);
  if (req.user.role !== 'admin' && (await Fridge.countDocuments({ createdBy: req.user._id, createdAt: since(24 * HOUR_MS) })) >= MAX_FRIDGES_PER_DAY) {
    return tooFast(res, 'You have added a lot of fridges today. Please try again tomorrow.');
  }

  const doc = await Fridge.create({ ...value, ...(photo ? { photo } : {}), createdBy: req.user._id, createdByName: req.user.name });
  res.status(201).json(toFridgeDTO(doc));
});

// GET /api/fridges/:id
router.get('/:id', loadFridge, async (req, res) => {
  const counts = await openReportCounts([req.fridge._id]);
  res.json(toFridgeDTO(req.fridge, { openSpoiledReports: counts.get(String(req.fridge._id)) ?? 0 }));
});

// GET /api/fridges/:id/photo
router.get('/:id/photo', async (req, res) => {
  const doc = await Fridge.findOne({ _id: req.params.id, status: 'active' }).select('photo');
  if (!doc?.photo?.data) return res.status(404).end();
  sendPhoto(res, doc.photo);
});

// PUT /api/fridges/:id – the person who added it, or an admin. Photo is optional (keeps the current one).
router.put('/:id', requireLogin, loadFridge, uploadPhoto, async (req, res) => {
  if (!canManage(req.fridge, req.user)) return res.status(403).json({ error: 'You can only change fridges you added.' });
  const { value, errors } = parseFridgeInput(req.body);
  const { photo, error } = optionalPhoto(req.file);
  if (error) errors.photo = error;
  if (Object.keys(errors).length) return invalid(res, errors);

  const updated = await Fridge.findByIdAndUpdate(req.fridge._id, { $set: { ...value, ...(photo ? { photo } : {}) } }, { new: true, runValidators: true }).select('-photo.data');
  // Reports keep a copy of the name for the alerts list; a rename isn't a change to the report itself.
  if (updated.name !== req.fridge.name) await SpoiledReport.updateMany({ fridge: updated._id }, { $set: { fridgeName: updated.name } }, { timestamps: false });
  const counts = await openReportCounts([updated._id]);
  res.json(toFridgeDTO(updated, { openSpoiledReports: counts.get(String(updated._id)) ?? 0 }));
});

// POST /api/fridges/:id/checking – an admin says they are going to check a stale fridge.
// Everyone then sees that it is being checked. Posting a status update when done clears it.
router.post('/:id/checking', requireAdmin, loadFridge, async (req, res) => {
  if (!foodMayBeStale(req.fridge)) return res.status(409).json({ error: 'This fridge was updated recently, so it does not need a check.' });
  const checking = { checkingBy: req.user._id, checkingByName: req.user.name, checkingAt: new Date() };
  await Fridge.updateOne({ _id: req.fridge._id }, { $set: checking }, { timestamps: false });
  const counts = await openReportCounts([req.fridge._id]);
  res.json(toFridgeDTO({ ...req.fridge.toObject(), ...checking }, { openSpoiledReports: counts.get(String(req.fridge._id)) ?? 0 }));
});

// DELETE /api/fridges/:id – soft delete; history and reports are kept.
// Open spoiled reports are resolved so suppliers aren't left with alerts for a fridge they can no longer open.
router.delete('/:id', requireLogin, loadFridge, async (req, res) => {
  if (!canManage(req.fridge, req.user)) return res.status(403).json({ error: 'You can only remove fridges you added.' });
  await Fridge.updateOne({ _id: req.fridge._id }, { status: 'removed' });
  await SpoiledReport.updateMany(
    { fridge: req.fridge._id, status: 'open' },
    { $set: { status: 'resolved', resolution: 'The fridge was removed from Surplate.', resolvedBy: req.user._id, resolvedByName: req.user.name, resolvedAt: new Date() } }
  );
  res.status(204).end();
});

// ==================================================================================================
// Status updates
// ==================================================================================================

// GET /api/fridges/:id/updates?before=<ISO date>&beforeId=<update id> – newest first, 10 per page.
// The cursor is (createdAt, _id), matching the sort, so updates posted at the same moment aren't skipped.
router.get('/:id/updates', loadFridge, async (req, res) => {
  const before = new Date(str(req.query.before));
  const beforeId = str(req.query.beforeId);
  const filter = { fridge: req.fridge._id };
  if (!Number.isNaN(before.getTime())) {
    if (mongoose.isValidObjectId(beforeId)) {
      filter.$or = [{ createdAt: { $lt: before } }, { createdAt: before, _id: { $lt: new mongoose.Types.ObjectId(beforeId) } }];
    } else filter.createdAt = { $lt: before };
  }
  const docs = await FridgeUpdate.find(filter).select('-photo.data').sort({ createdAt: -1, _id: -1 }).limit(UPDATES_PAGE + 1);
  const page = docs.slice(0, UPDATES_PAGE);
  const last = docs.length > UPDATES_PAGE ? page[page.length - 1] : null;
  res.json({ items: page.map(toUpdateDTO), nextBefore: last?.createdAt ?? null, nextBeforeId: last ? String(last._id) : null });
});

// GET /api/fridges/:id/updates/:updateId/photo – only while the fridge is active, like the fridge photo.
router.get('/:id/updates/:updateId/photo', async (req, res) => {
  if (!(await Fridge.exists({ _id: req.params.id, status: 'active' }))) return res.status(404).end();
  const doc = await FridgeUpdate.findOne({ _id: req.params.updateId, fridge: req.params.id }).select('photo');
  if (!doc?.photo?.data) return res.status(404).end();
  sendPhoto(res, doc.photo);
});

// POST /api/fridges/:id/updates (multipart: status, note?, photo?, resolveReports?) – any logged-in user.
// resolveReports=true (admins only, ignored for anyone else) also resolves this fridge's open spoiled reports,
// e.g. after clearing out a stale fridge. The response then says how many were resolved.
// To let signed-out visitors post too, replace `requireLogin` with a middleware that allows guests
// and store a guest name instead of req.user (add rate limiting if you do).
router.post('/:id/updates', requireLogin, loadFridge, uploadPhoto, async (req, res) => {
  const { value, errors } = parseUpdateInput(req.body);
  const { photo, error } = optionalPhoto(req.file);
  if (error) errors.photo = error;
  if (Object.keys(errors).length) return invalid(res, errors);

  const recentHere = await FridgeUpdate.countDocuments({ fridge: req.fridge._id, author: req.user._id, createdAt: since(HOUR_MS) });
  if (recentHere >= MAX_UPDATES_PER_HOUR) return tooFast(res);
  if ((await FridgeUpdate.countDocuments({ author: req.user._id, createdAt: since(HOUR_MS) })) >= MAX_UPDATES_PER_HOUR_TOTAL) return tooFast(res);

  const update = await FridgeUpdate.create({
    ...value,
    ...(photo ? { photo } : {}),
    fridge: req.fridge._id,
    author: req.user._id,
    authorName: req.user.name,
    authorRole: req.user.role,
  });
  // Refresh the copy on the fridge, but only if this update is the newest (two people may post at once).
  // timestamps:false keeps the fridge's photo URL (?v=updatedAt) stable. A fresh update also ends any admin check.
  await Fridge.updateOne(
    { _id: req.fridge._id, $or: [{ latestUpdateAt: null }, { latestUpdateAt: { $lte: update.createdAt } }] },
    {
      $set: { latestStatus: update.status, latestUpdateAt: update.createdAt, latestNote: update.note },
      $unset: { checkingBy: '', checkingByName: '', checkingAt: '' },
    },
    { timestamps: false }
  );

  if (req.user.role === 'admin' && str(req.body?.resolveReports) === 'true') {
    const { modifiedCount } = await SpoiledReport.updateMany(
      { fridge: req.fridge._id, status: 'open' },
      { $set: { status: 'resolved', resolution: update.note || 'Cleared during a fridge check.', resolvedBy: req.user._id, resolvedByName: req.user.name, resolvedAt: new Date() } }
    );
    return res.status(201).json({ ...toUpdateDTO(update), reportsResolved: modifiedCount });
  }
  res.status(201).json(toUpdateDTO(update));
});

// ==================================================================================================
// Spoiled food
// ==================================================================================================

// POST /api/fridges/:id/spoiled (multipart: items, note?, updateId?, photo?) – any logged-in user.
// Who is notified: if updateId names a drop-off (a stocked/low update) made by a bakery, that bakery.
// If no update is named, every bakery that made a drop-off at this fridge in the last 72 hours.
// Reports nobody can be matched to are still stored; admins see them.
router.post('/:id/spoiled', requireLogin, loadFridge, uploadPhoto, async (req, res) => {
  const { value, errors } = parseSpoiledInput(req.body);
  const { photo, error } = optionalPhoto(req.file);
  if (error) errors.photo = error;

  let update = null;
  if (value.updateId && !errors.updateId) {
    update = await FridgeUpdate.findOne({ _id: value.updateId, fridge: req.fridge._id }).select('author authorRole status');
    if (!update) errors.updateId = 'That update was not found for this fridge.';
  }
  if (Object.keys(errors).length) return invalid(res, errors);

  const duplicate = await SpoiledReport.exists({ fridge: req.fridge._id, reportedBy: req.user._id, status: 'open', createdAt: since(HOUR_MS) });
  if (duplicate) return res.status(409).json({ error: 'You already reported spoiled food here in the last hour. The supplier has been told.' });
  if ((await SpoiledReport.countDocuments({ reportedBy: req.user._id, createdAt: since(HOUR_MS) })) >= MAX_REPORTS_PER_HOUR) {
    return tooFast(res, 'You have sent a lot of reports in the last hour. Please wait a little before reporting again.');
  }

  const candidates = update
    ? update.authorRole === 'bakery' && DROP_OFF_STATUSES.includes(update.status) ? [update.author] : []
    : await FridgeUpdate.distinct('author', {
        fridge: req.fridge._id, authorRole: 'bakery', status: { $in: DROP_OFF_STATUSES }, createdAt: { $gte: new Date(Date.now() - SUPPLIER_WINDOW_MS) },
      });
  const suppliers = candidates.filter((id) => !id.equals(req.user._id)); // never notify the reporter about their own report

  const report = await SpoiledReport.create({
    fridge: req.fridge._id,
    fridgeName: req.fridge.name,
    update: update?._id,
    reportedBy: req.user._id,
    reportedByName: req.user.name,
    items: value.items,
    note: value.note,
    ...(photo ? { photo } : {}),
    suppliers,
  });
  res.status(201).json({ report: toReportDTO(report), suppliersNotified: suppliers.length });
});

export default router;
