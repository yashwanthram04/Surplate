import { Router } from 'express';
import mongoose from 'mongoose';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import Reservation from '../models/Reservation.js';
import Appeal from '../models/Appeal.js'; // REVIEWS FEATURE
import { appealDTO } from './appeals.js'; // REVIEWS FEATURE
import { requireLogin, requireRole } from '../middleware/auth.js';
import { canView } from '../utils/visibility.js';
import { DEFAULT_SLOT_MINUTES, findSlot } from '../utils/slots.js';
import { gramsPerMeal, missedGraceMinutes } from '../config.js';
import { RELIABILITY, assertCanReserve, fail, markMissed, missedAfter, normaliseCode, reliabilityFor, reservationDTO,
  sweepMissed, transaction, uniqueCode } from '../services/reservations.js';

const REMINDER_MINUTES = 30; // keep in sync with client/src/components/SlotReminders.vue
const RECIPIENTS = ['charity', 'individual'];
const validQuantity = (q) => Number.isInteger(q) && q >= 1 && q <= 500;
const slotError = 'Choose a collection slot inside the pickup window that has not ended yet.';

const router = Router();
router.use(requireLogin);
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Reservation not found.' });
  next();
});

router.get('/mine', async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const filter = req.user.role === 'bakery' ? { bakery: req.user._id } : { recipient: req.user._id };
  await sweepMissed();
  const [items, total] = await Promise.all([
    Reservation.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20),
    Reservation.countDocuments(filter),
  ]);
  res.json({ items: items.map(reservationDTO), total, page, pageSize: 20 });
});

// Reservations whose slot starts within the next half hour or is under way: drives in-app reminders.
router.get('/upcoming', requireRole('bakery', ...RECIPIENTS), async (req, res) => {
  const now = new Date();
  const soon = new Date(now.getTime() + REMINDER_MINUTES * 60000);
  const items = await Reservation.find({
    [req.user.role === 'bakery' ? 'bakery' : 'recipient']: req.user._id, status: 'reserved',
    $or: [{ slotStart: { $lte: soon }, slotEnd: { $gt: now } }, { slotStart: { $exists: false }, pickupStart: { $lte: soon }, pickupEnd: { $gt: now } }],
  }).sort({ slotStart: 1, _id: 1 }).limit(100);
  res.json({ items: items.map(reservationDTO), reminderMinutes: REMINDER_MINUTES });
});

router.get('/reliability', requireRole(...RECIPIENTS), async (req, res) => {
  await sweepMissed();
  // REVIEWS FEATURE: the latest block appeal rides along, so the notice can show its status
  const appeal = await Appeal.findOne({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ ...(await reliabilityFor(req.user._id)), rules: RELIABILITY, appeal: appeal ? appealDTO(appeal) : null });
});

// Bakery orders, filtered by ?view=
//   open:   every open order, earliest slot first
//   due:    open orders released automatically within DUE_SOON_MINUTES
//   missed: no-shows (released by staff or automatically) in the last MISSED_DAYS days, newest first
const DUE_SOON_MINUTES = 30; // keep in sync with client/src/views/OrdersView.vue
const MISSED_DAYS = 7;
const ORDER_VIEWS = ['open', 'due', 'missed'];
function ordersFilter(view, bakery, now) {
  if (view === 'missed') return { bakery, status: 'missed', missedAt: { $gte: new Date(now.getTime() - MISSED_DAYS * 86400000) } };
  if (view === 'open') return { bakery, status: 'reserved' };
  // Released at slot end + grace, so "due within N minutes" means the slot ends within N − grace minutes.
  const slotEndsBy = new Date(now.getTime() + (DUE_SOON_MINUTES - missedGraceMinutes()) * 60000);
  return { bakery, status: 'reserved', $or: [{ slotEnd: { $lte: slotEndsBy } }, { slotEnd: { $exists: false }, pickupEnd: { $lte: slotEndsBy } }] };
}
router.get('/orders', requireRole('bakery'), async (req, res) => {
  const view = ORDER_VIEWS.includes(req.query.view) ? req.query.view : 'open';
  await sweepMissed();
  const now = new Date();
  const sort = view === 'missed' ? { missedAt: -1, _id: -1 } : { slotStart: 1, createdAt: 1 };
  const [items, ...counts] = await Promise.all([
    Reservation.find(ordersFilter(view, req.user._id, now)).sort(sort).limit(200),
    ...ORDER_VIEWS.map((v) => Reservation.countDocuments(ordersFilter(v, req.user._id, now))),
  ]);
  res.json({ view, items: items.map(reservationDTO), counts: Object.fromEntries(ORDER_VIEWS.map((v, i) => [v, counts[i]])),
    dueSoonMinutes: DUE_SOON_MINUTES, missedDays: MISSED_DAYS });
});

// Bakery: find a reservation by the code the recipient shows at the counter.
router.get('/lookup', requireRole('bakery'), async (req, res) => {
  const code = normaliseCode(req.query.code);
  if (code.length !== 6) return res.status(422).json({ error: 'Enter the 6-character reservation code.' });
  await sweepMissed();
  const row = await Reservation.findOne({ bakery: req.user._id, code, status: 'reserved' })
    ?? await Reservation.findOne({ bakery: req.user._id, code }).sort({ createdAt: -1 });
  if (!row) return res.status(404).json({ error: 'No reservation at your bakery has that code.' });
  res.json(reservationDTO(row));
});

router.post('/', requireRole(...RECIPIENTS), async (req, res) => {
  const { listingId, quantity, slotStart } = req.body ?? {};
  const fields = {};
  if (!validQuantity(quantity)) fields.quantity = 'Choose a whole quantity from 1 to 500.';
  if (typeof slotStart !== 'string' || !slotStart) fields.slotStart = 'Choose a collection slot.';
  if (!mongoose.isValidObjectId(listingId) || Object.keys(fields).length) {
    return res.status(422).json({ error: 'Choose a listing, a whole quantity from 1 to 500 and a collection slot.', fields });
  }
  await sweepMissed(); // missed pickups count towards reliability and free up stock
  const row = await transaction(async (session) => {
    // Writing the account coordinates concurrent account deletion and verification changes,
    // and serialises one recipient's reservations so the active-reservation limit holds.
    const user = await User.findOneAndUpdate({ _id: req.user._id }, { $inc: { reservationVersion: 1 } }, { returnDocument: 'after', session });
    if (!user) fail('Account no longer available.', 401);
    const listing = await Listing.findById(listingId).session(session);
    const now = new Date();
    if (!listing || listing.status !== 'active' || !canView(listing, user)) fail('Listing not available. It may still be in charity priority.', 404);
    if (listing.pickupEnd <= now) fail('The pickup window has closed.');
    if (!listing.weightGramsPerUnit) fail('The bakery must add a unit weight before this listing can be reserved.');
    const slot = findSlot(listing, slotStart, now);
    if (!slot) fail(slotError, 422);
    assertCanReserve(await reliabilityFor(user._id, session, now));
    const stock = await Listing.updateOne({ _id: listingId, status: 'active', quantityRemaining: { $gte: quantity }, pickupEnd: { $gt: now } },
      { $inc: { quantityRemaining: -quantity } }, { session });
    if (!stock.modifiedCount) fail(`Only ${listing.quantityRemaining} left. Choose a smaller quantity.`);
    const [created] = await Reservation.create([{
      listing: listing._id, bakery: listing.bakery, recipient: user._id,
      bakeryName: listing.bakeryName, recipientName: user.name, recipientRole: user.role,
      itemName: listing.itemName, address: listing.address, pickupStart: listing.pickupStart, pickupEnd: listing.pickupEnd,
      slotStart: slot.start, slotEnd: slot.end, slotMinutes: listing.slotMinutes ?? DEFAULT_SLOT_MINUTES,
      code: await uniqueCode(listing.bakery, session),
      quantity, weightGramsPerUnit: listing.weightGramsPerUnit, gramsPerMeal: gramsPerMeal(),
    }], { session });
    return created;
  });
  res.status(201).json(reservationDTO(row));
});

// Recipient: change the quantity and/or slot until the current slot ends.
router.patch('/:id', requireRole(...RECIPIENTS), async (req, res) => {
  const { quantity, slotStart } = req.body ?? {};
  const fields = {};
  if (quantity !== undefined && !validQuantity(quantity)) fields.quantity = 'Choose a whole quantity from 1 to 500.';
  if (slotStart !== undefined && (typeof slotStart !== 'string' || !slotStart)) fields.slotStart = 'Choose a collection slot.';
  if (Object.keys(fields).length || (quantity === undefined && slotStart === undefined)) {
    return res.status(422).json({ error: 'Choose a new quantity or collection slot.', fields });
  }
  const row = await transaction(async (session) => {
    const r = await Reservation.findById(req.params.id).session(session);
    if (!r) fail('Reservation not found.', 404);
    if (!r.recipient.equals(req.user._id)) fail('This reservation does not belong to you.', 403);
    if (r.status !== 'reserved') fail('Only open reservations can be changed.');
    const now = new Date();
    if ((r.slotEnd ?? r.pickupEnd) <= now) fail('Your collection slot has ended, so this reservation can no longer be changed.');
    const listing = await Listing.findOne({ _id: r.listing, status: 'active' }).session(session);
    if (!listing) fail('This listing has been removed.');
    if (slotStart !== undefined) {
      const slot = findSlot(listing, slotStart, now);
      if (!slot) fail(slotError, 422);
      r.set({ slotStart: slot.start, slotEnd: slot.end, slotMinutes: listing.slotMinutes ?? DEFAULT_SLOT_MINUTES });
    }
    const delta = quantity === undefined ? 0 : quantity - r.quantity;
    if (delta > 0) {
      const stock = await Listing.updateOne({ _id: listing._id, status: 'active', quantityRemaining: { $gte: delta } },
        { $inc: { quantityRemaining: -delta } }, { session });
      if (!stock.modifiedCount) fail(`Only ${listing.quantityRemaining} more available, so you can reserve up to ${r.quantity + listing.quantityRemaining}.`);
    } else if (delta < 0) {
      await Listing.updateOne({ _id: listing._id }, { $inc: { quantityRemaining: -delta } }, { session });
    }
    if (delta) r.quantity = quantity;
    await r.save({ session });
    return r;
  });
  res.json(reservationDTO(row));
});

router.post('/:id/:action', async (req, res) => {
  const { action } = req.params;
  if (!['cancel', 'collect', 'release'].includes(action)) return res.status(404).json({ error: 'Not found.' });
  const row = await transaction(async (session) => {
    const r = await Reservation.findById(req.params.id).session(session);
    if (!r) fail('Reservation not found.', 404);
    const isBakery = req.user.role === 'bakery' && r.bakery.equals(req.user._id);
    const isRecipient = r.recipient.equals(req.user._id);
    if (action === 'cancel' ? !(isBakery || isRecipient) : !isBakery) fail('This reservation does not belong to you.', 403);
    if (r.status !== 'reserved') fail('This reservation has already been completed, cancelled or missed.');
    const now = new Date();
    if (action === 'release') {
      // Staff can release a no-show once the slot has started instead of waiting out the grace period.
      if ((r.slotStart ?? r.pickupStart) > now) fail('You can release a reservation once its collection slot has started.');
      return markMissed({ _id: r._id }, 'bakery', session, now);
    }
    if (missedAfter(r) <= now) fail('The collection slot has passed, so this reservation was missed.');
    if (action === 'collect') {
      if (r.pickupStart > now) fail('Collection is available only during the pickup window.');
      if (r.code && normaliseCode(req.body?.code) !== r.code) fail('That code does not match this reservation.', 422);
      r.status = 'collected'; r.collectedAt = now;
    } else {
      r.status = 'cancelled'; r.cancelledAt = now;
      await Listing.updateOne({ _id: r.listing, status: 'active' }, { $inc: { quantityRemaining: r.quantity } }, { session });
    }
    await r.save({ session });
    return r;
  });
  res.json(reservationDTO(row));
});
export default router;
