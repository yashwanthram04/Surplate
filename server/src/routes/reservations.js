import { Router } from 'express';
import mongoose from 'mongoose';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import Reservation from '../models/Reservation.js';
import { requireLogin, requireRole } from '../middleware/auth.js';
import { canView } from '../utils/visibility.js';
import { gramsPerMeal } from '../config.js';
import { transaction, fail, reservationDTO } from '../services/reservations.js';

const router = Router();
router.use(requireLogin);
router.get('/mine', async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const filter = req.user.role === 'bakery' ? { bakery: req.user._id } : { recipient: req.user._id };
  const [items, total] = await Promise.all([
    Reservation.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20),
    Reservation.countDocuments(filter),
  ]);
  res.json({ items: items.map(reservationDTO), total, page, pageSize: 20 });
});
router.post('/', requireRole('charity', 'individual'), async (req, res) => {
  const { listingId, quantity } = req.body ?? {};
  if (!mongoose.isValidObjectId(listingId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    return res.status(422).json({ error: 'Choose a listing and a whole quantity from 1 to 500.' });
  }
  const row = await transaction(async (session) => {
    // Writing the account coordinates concurrent account deletion and verification changes.
    const user = await User.findOneAndUpdate({ _id: req.user._id }, { $inc: { reservationVersion: 1 } }, { returnDocument: 'after', session });
    if (!user) fail('Account no longer available.', 401);
    const listing = await Listing.findById(listingId).session(session);
    if (!listing || listing.status !== 'active' || !canView(listing, user)) fail('Listing not available. It may still be in charity priority.', 404);
    if (listing.pickupEnd <= new Date()) fail('The pickup window has closed.');
    if (!listing.weightGramsPerUnit) fail('The bakery must add a unit weight before this listing can be reserved.');
    const stock = await Listing.updateOne({ _id: listingId, status: 'active', quantityRemaining: { $gte: quantity }, pickupEnd: { $gt: new Date() } },
      { $inc: { quantityRemaining: -quantity } }, { session });
    if (!stock.modifiedCount) fail('There is not enough food remaining.');
    const [created] = await Reservation.create([{
      listing: listing._id, bakery: listing.bakery, recipient: user._id,
      bakeryName: listing.bakeryName, recipientName: user.name, recipientRole: user.role,
      itemName: listing.itemName, address: listing.address, pickupStart: listing.pickupStart, pickupEnd: listing.pickupEnd,
      quantity, weightGramsPerUnit: listing.weightGramsPerUnit, gramsPerMeal: gramsPerMeal(),
    }], { session });
    return created;
  });
  res.status(201).json(reservationDTO(row));
});
router.post('/:id/:action', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !['cancel', 'collect'].includes(req.params.action)) return res.status(404).json({ error: 'Not found.' });
  const row = await transaction(async (session) => {
    const r = await Reservation.findById(req.params.id).session(session);
    if (!r) fail('Reservation not found.', 404);
    const isBakery = req.user.role === 'bakery' && r.bakery.equals(req.user._id);
    const isRecipient = r.recipient.equals(req.user._id);
    if (req.params.action === 'collect' ? !isBakery : !(isBakery || isRecipient)) fail('This reservation does not belong to you.', 403);
    if (r.status !== 'reserved') fail('This reservation has already been completed or cancelled.');
    const now = new Date();
    if (r.pickupEnd <= now) fail('The pickup window has closed.');
    if (req.params.action === 'collect') {
      if (r.pickupStart > now) fail('Collection is available only during the pickup window.');
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
