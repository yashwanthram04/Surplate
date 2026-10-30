import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import Listing, { ALLERGENS, DIETARY_TAGS } from '../models/Listing.js';
import { requireBakery } from '../middleware/auth.js';
import { MAX_PHOTO_BYTES, checkPhoto, parseListingInput, toList } from '../utils/validate.js';
import { toListingDTO } from '../utils/serialize.js';
import { canView, visibilityFilter } from '../utils/visibility.js';

import { priorityMinutes } from '../config.js';
import { cancelOpen, transaction, fail, sweepMissed } from '../services/reservations.js';
import { attachThankYouCounts } from '../services/reputation.js'; // REVIEWS FEATURE

const router = Router();
const ENDING_SOON_MS = 2 * 60 * 60 * 1000; // keep in sync with client/src/constants.js
const BROWSE_LIMIT = 100;

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

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Listing not found.' });
  next();
});

/** Loads the listing in req.listing and checks that the signed-in bakery owns it. */
async function loadOwned(req, res, next) {
  const listing = await Listing.findOne({ _id: req.params.id, status: 'active' });
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (!listing.bakery.equals(req.user._id)) return res.status(403).json({ error: 'You can only change your own listings.' });
  req.listing = listing;
  next();
}

// GET /api/listings  – public board: only open or upcoming listings that still have stock.
//   ?q=text &dietary=vegan,halal &avoid=nuts,dairy &openNow=true &endingSoon=true
//   &lat=&lng=&radiusKm=  &sort=ending|distance|newest
router.get('/', async (req, res) => {
  await sweepMissed(); // missed pickups put their food back on the board
  const now = new Date();
  const filter = { status: 'active', pickupEnd: { $gt: now }, quantityRemaining: { $gt: 0 }, ...visibilityFilter(req.user) };

  const dietary = toList(req.query.dietary).filter((t) => DIETARY_TAGS.includes(t));
  if (dietary.length) filter.dietaryTags = { $all: dietary };
  const avoid = toList(req.query.avoid).filter((a) => ALLERGENS.includes(a));
  if (avoid.length) filter.allergens = { $nin: avoid };
  if (req.query.openNow === 'true') filter.pickupStart = { $lte: now };
  if (req.query.endingSoon === 'true') filter.pickupEnd = { $gt: now, $lte: new Date(now.getTime() + ENDING_SOON_MS) };
  const text = str(req.query.q).trim().slice(0, 60);
  if (text) {
    const rx = new RegExp(escapeRegex(text), 'i');
    filter.$or = [{ itemName: rx }, { bakeryName: rx }, { description: rx }];
  }

  const lat = parseFloat(str(req.query.lat));
  const lng = parseFloat(str(req.query.lng));
  const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const radiusKm = Math.min(Math.max(parseFloat(str(req.query.radiusKm)) || 5, 0.5), 50);
  const sortKey = ['ending', 'distance', 'newest'].includes(req.query.sort) ? req.query.sort : hasGeo ? 'distance' : 'ending';

  const pipeline = [];
  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceM',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: filter,
      },
    });
  } else {
    pipeline.push({ $match: filter });
  }
  if (sortKey === 'ending') pipeline.push({ $sort: { pickupEnd: 1, _id: 1 } });
  else if (sortKey === 'newest') pipeline.push({ $sort: { createdAt: -1 } });
  else if (!hasGeo) pipeline.push({ $sort: { pickupEnd: 1, _id: 1 } }); // distance sort needs a location
  pipeline.push({ $project: { 'photo.data': 0 } }, { $limit: BROWSE_LIMIT });

  const docs = await Listing.aggregate(pipeline);
  res.json({ items: await attachThankYouCounts(docs.map((d) => toListingDTO(d, now))) }); // REVIEWS FEATURE: thank-you count on each card
});

// GET /api/listings/mine – everything the signed-in bakery has posted (including ended listings).
router.get('/mine', requireBakery, async (req, res) => {
  const now = new Date();
  const docs = await Listing.find({ bakery: req.user._id, status: 'active' }).select('-photo.data').sort({ pickupEnd: -1 });
  res.json({ items: docs.map((d) => toListingDTO(d, now)) });
});

// GET /api/listings/:id/photo
router.get('/:id/photo', async (req, res) => {
  const doc = await Listing.findOne({ _id: req.params.id, status: 'active' }).select('photo bakery visibleToIndividuals priorityUntil');
  if (!doc?.photo?.data || !canView(doc, req.user)) return res.status(404).end();
  res.set({
    'Content-Type': doc.photo.contentType,
    'Cache-Control': 'private, no-store', // the ?v= query changes when the photo does
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.send(doc.photo.data);
});

// GET /api/listings/:id – ended listings stay viewable (shared links) but are flagged phase: 'ended'.
router.get('/:id', async (req, res) => {
  await sweepMissed();
  const doc = await Listing.findOne({ _id: req.params.id, status: 'active' }).select('-photo.data');
  if (!doc || !canView(doc, req.user)) return res.status(404).json({ error: 'Listing not found.' });
  const dto = toListingDTO(doc);
  await attachThankYouCounts([dto]); // REVIEWS FEATURE
  res.json(dto);
});

// POST /api/listings (multipart/form-data, photo in field "photo")
router.post('/', requireBakery, uploadPhoto, async (req, res) => {
  const { value, errors } = parseListingInput(req.body);
  const { photo, error: photoError } = checkPhoto(req.file);
  if (photoError) errors.photo = photoError;
  if (value.weightGramsPerUnit === undefined) errors.weightGramsPerUnit = 'Enter the weight in grams per unit.';
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });

  const doc = await Listing.create({
    ...value,
    quantityRemaining: value.quantity,
    priorityUntil: new Date(Date.now() + priorityMinutes() * 60000),
    bakery: req.user._id,
    bakeryName: req.user.name,
    photo,
  });
  res.status(201).json(toListingDTO(doc));
});

// PUT /api/listings/:id – edit while the pickup window is still open. Photo is optional here.
router.put('/:id', requireBakery, loadOwned, uploadPhoto, async (req, res) => {
  const listing = req.listing;
  if (listing.pickupEnd <= new Date()) {
    return res.status(409).json({ error: 'This pickup window has closed. Re-post the listing instead.' });
  }

  const { value, errors } = parseListingInput(req.body);
  const reserved = listing.quantity - listing.quantityRemaining;
  if (!errors.quantity && value.quantity < reserved) {
    errors.quantity = `${reserved} already reserved, so quantity can't go below ${reserved}.`;
  }
  let photo = null;
  if (req.file) {
    const checked = checkPhoto(req.file);
    if (checked.error) errors.photo = checked.error;
    else photo = checked.photo;
  }
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });

  const updated = await transaction(async (session) => {
    const current = await Listing.findOne({ _id: listing._id, status: 'active' }).session(session);
    if (!current || current.pickupEnd <= new Date()) fail('Listing is no longer editable.');
    const allocated = current.quantity - current.quantityRemaining;
    if (value.quantity < allocated) fail('Quantity cannot be lower than the amount already reserved.');
    // A reservation keeps its pickup details; prevent changes that would mislead its recipient.
    if (allocated && (current.pickupStart.getTime() !== value.pickupStart.getTime() || current.pickupEnd.getTime() !== value.pickupEnd.getTime() || current.address !== value.address)) {
      fail('Pickup times and address cannot change after food has been reserved.');
    }
    current.set({ ...value, quantityRemaining: value.quantity - allocated });
    if (photo) current.photo = photo;
    await current.save({ session });
    return current;
  });
  res.json(toListingDTO(updated));
});

// DELETE /api/listings/:id – soft delete; the record is kept for history and the impact dashboard.
// Removal cancels pending reservations; completed collections are retained.
router.delete('/:id', requireBakery, loadOwned, async (req, res) => {
  await transaction(async (session) => {
    await Listing.updateOne({ _id: req.listing._id }, { status: 'removed' }, { session });
    await cancelOpen({ listing: req.listing._id }, session);
  });
  res.status(204).end();
});

// POST /api/listings/:id/repost – copy a past listing (photo included) with fresh stock and window.
router.post('/:id/repost', requireBakery, loadOwned, async (req, res) => {
  const source = req.listing;
  const body = req.body ?? {};
  const { value, errors } = parseListingInput({
    // everything descriptive (and the already-geocoded location) is copied from the old listing...
    itemName: source.itemName,
    description: source.description,
    dietaryTags: source.dietaryTags,
    allergens: source.allergens,
    address: source.address,
    postal: source.postal,
    visibleToIndividuals: source.visibleToIndividuals,
    lat: source.location.coordinates[1],
    lng: source.location.coordinates[0],
    // ...only stock and times are re-entered
    weightGramsPerUnit: body.weightGramsPerUnit ?? source.weightGramsPerUnit,
    slotMinutes: body.slotMinutes ?? source.slotMinutes,
    quantity: body.quantity,
    pickupStart: body.pickupStart,
    pickupEnd: body.pickupEnd,
    bestBefore: body.bestBefore,
  });
  // Only these fields come from the request, so only these can be reported back.
  if (value.weightGramsPerUnit === undefined) errors.weightGramsPerUnit = 'Enter the weight in grams per unit.';
  const fields = Object.fromEntries(Object.entries(errors).filter(([k]) => ['quantity', 'weightGramsPerUnit', 'slotMinutes', 'pickupStart', 'pickupEnd', 'bestBefore'].includes(k)));
  if (Object.keys(fields).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields });

  const copy = await Listing.create({
    ...value,
    quantityRemaining: value.quantity,
    priorityUntil: new Date(Date.now() + priorityMinutes() * 60000),
    bakery: source.bakery,
    bakeryName: source.bakeryName,
    photo: source.photo,
    repostedFrom: source._id,
  });
  res.status(201).json(toListingDTO(copy));
});

export default router;
