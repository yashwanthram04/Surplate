import { Router } from 'express';
import mongoose from 'mongoose';
import RecipientRating from '../models/RecipientRating.js';
import Reservation from '../models/Reservation.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import Appeal from '../models/Appeal.js';
import { requireRole } from '../middleware/auth.js';
import { RELIABILITY, fail, reliabilityFor, sweepMissed } from '../services/reservations.js';
import { REPUTATION, bakeryReputation } from '../services/reputation.js';
import { parseRatingInput, parseReplyBody, parseReviewInput } from '../utils/validateReview.js';
import { appealDTO } from './appeals.js';

const RECIPIENTS = ['charity', 'individual'];
const REVIEW_WINDOW_DAYS = 30; // a pickup can be reviewed or rated for this long after it was collected
const PAGE_SIZE = 12;
const bad = (res, errors, message = 'Please fix the highlighted fields.') => res.status(422).json({ error: message, fields: errors });
const isDuplicate = (err) => err?.code === 11000;
const windowStart = () => new Date(Date.now() - REVIEW_WINDOW_DAYS * 86400000);

const router = Router();
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Not found.' });
  next();
});

/** Public shape of a note: the nickname, never the account behind it. */
export function reviewDTO(r, viewerId = null) {
  const o = typeof r.toObject === 'function' ? r.toObject() : r;
  return {
    id: String(o._id), bakeryId: String(o.bakery), nickname: o.nickname, note: o.note, itemName: o.itemName,
    foodRating: o.foodRating, accuracyRating: o.accuracyRating, authorRole: o.authorRole,
    onBehalfOf: o.onBehalfOf || null, peopleServed: o.peopleServed ?? null,
    pinned: o.pinned, reply: o.reply?.text ? { text: o.reply.text, at: o.reply.at } : null,
    mine: !!viewerId && String(o.author) === String(viewerId),
    createdAt: o.createdAt,
  };
}

// ---- the public wall ------------------------------------------------------------------------
// GET /api/reviews/bakery/:id?page=  (anyone): reputation summary and the notes, pinned first.
router.get('/bakery/:id', async (req, res) => {
  const bakery = await User.findOne({ _id: req.params.id, role: 'bakery' }).select('name address');
  if (!bakery) return res.status(404).json({ error: 'Bakery not found.' });
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const [items, reputation] = await Promise.all([
    Review.find({ bakery: bakery._id }).sort({ pinned: -1, pinnedAt: -1, createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    bakeryReputation(bakery._id),
  ]);
  res.json({
    bakery: { id: String(bakery._id), name: bakery.name, address: bakery.address },
    reputation, items: items.map((r) => reviewDTO(r, req.user?._id)),
    page, pageSize: PAGE_SIZE, total: reputation.thankYouCount, pinLimit: REPUTATION.pinLimit,
  });
});

// ---- writing a thank-you (recipients) ---------------------------------------------------------
// Collected pickups that have no note yet.
router.get('/pending', requireRole(...RECIPIENTS), async (req, res) => {
  const reviewed = await Review.find({ author: req.user._id }).distinct('reservation');
  const filter = { recipient: req.user._id, status: 'collected', collectedAt: { $gte: windowStart() }, _id: { $nin: reviewed } };
  const [rows, count] = await Promise.all([Reservation.find(filter).sort({ collectedAt: -1 }).limit(10), Reservation.countDocuments(filter)]);
  res.json({ count, items: rows.map((r) => ({
    reservationId: String(r._id), bakeryId: String(r.bakery), bakeryName: r.bakeryName, itemName: r.itemName, quantity: r.quantity, collectedAt: r.collectedAt,
  })) });
});

router.post('/', requireRole(...RECIPIENTS), async (req, res) => {
  const { reservationId } = req.body ?? {};
  if (!mongoose.isValidObjectId(reservationId)) return bad(res, {}, 'Choose a pickup to review.');
  const { value, errors } = parseReviewInput(req.body, req.user);
  if (Object.keys(errors).length) return bad(res, errors);

  const reservation = await Reservation.findOne({ _id: reservationId, recipient: req.user._id });
  if (!reservation) return res.status(404).json({ error: 'Pickup not found.' });
  if (reservation.status !== 'collected') fail('You can say thanks once the bakery has confirmed your collection.');
  if (reservation.collectedAt < windowStart()) fail(`Notes can be left within ${REVIEW_WINDOW_DAYS} days of collecting.`);
  try {
    const review = await Review.create({
      reservation: reservation._id, bakery: reservation.bakery, author: req.user._id, authorRole: req.user.role,
      itemName: reservation.itemName, ...value,
    });
    res.status(201).json(reviewDTO(review, req.user._id));
  } catch (err) {
    if (isDuplicate(err)) fail('You have already thanked this bakery for this pickup.');
    throw err;
  }
});

// ---- bakery staff: pin, reply -----------------------------------------------------------------
async function ownReview(req, res) {
  const review = await Review.findOne({ _id: req.params.id, bakery: req.user._id });
  if (!review) res.status(404).json({ error: 'Note not found.' });
  return review;
}

router.patch('/:id/pin', requireRole('bakery'), async (req, res) => {
  const review = await ownReview(req, res);
  if (!review) return;
  const pinned = req.body?.pinned !== false;
  if (pinned && !review.pinned && (await Review.countDocuments({ bakery: req.user._id, pinned: true })) >= REPUTATION.pinLimit) {
    fail(`You can pin up to ${REPUTATION.pinLimit} notes. Unpin one first.`);
  }
  review.pinned = pinned;
  review.pinnedAt = pinned ? new Date() : undefined;
  await review.save();
  res.json(reviewDTO(review, req.user._id));
});

// An empty reply removes it.
router.put('/:id/reply', requireRole('bakery'), async (req, res) => {
  const { value, errors } = parseReplyBody(req.body);
  if (Object.keys(errors).length) return bad(res, errors);
  const review = await ownReview(req, res);
  if (!review) return;
  review.reply = value ? { text: value, at: new Date() } : { text: '' };
  await review.save();
  res.json(reviewDTO(review, req.user._id));
});

// ---- bakery staff: rate a customer ------------------------------------------------------------
router.get('/to-rate', requireRole('bakery'), async (req, res) => {
  const rated = await RecipientRating.find({ bakery: req.user._id }).distinct('reservation');
  const filter = { bakery: req.user._id, status: 'collected', collectedAt: { $gte: windowStart() }, _id: { $nin: rated } };
  const [rows, count] = await Promise.all([Reservation.find(filter).sort({ collectedAt: -1 }).limit(30), Reservation.countDocuments(filter)]);
  res.json({ count, items: rows.map((r) => ({
    reservationId: String(r._id), recipientName: r.recipientName, recipientRole: r.recipientRole, itemName: r.itemName, quantity: r.quantity,
    slotStart: r.slotStart ?? r.pickupStart, slotEnd: r.slotEnd ?? r.pickupEnd, collectedAt: r.collectedAt,
  })) });
});

router.post('/rate', requireRole('bakery'), async (req, res) => {
  const { reservationId } = req.body ?? {};
  if (!mongoose.isValidObjectId(reservationId)) return bad(res, {}, 'Choose a pickup to rate.');
  const { value, errors } = parseRatingInput(req.body);
  if (Object.keys(errors).length) return bad(res, errors);
  const reservation = await Reservation.findOne({ _id: reservationId, bakery: req.user._id });
  if (!reservation) return res.status(404).json({ error: 'Pickup not found.' });
  if (reservation.status !== 'collected') fail('You can rate a customer once you have confirmed their collection.');
  if (reservation.collectedAt < windowStart()) fail(`Ratings can be left within ${REVIEW_WINDOW_DAYS} days of the collection.`);
  try {
    const row = await RecipientRating.create({
      reservation: reservation._id, bakery: req.user._id, bakeryName: req.user.name,
      recipient: reservation.recipient, recipientName: reservation.recipientName, ...value,
    });
    res.status(201).json({ id: String(row._id), punctuality: row.punctuality, comment: row.comment });
  } catch (err) {
    if (isDuplicate(err)) fail('You have already rated this pickup.');
    throw err;
  }
});

// ---- my reliability --------------------------------------------------------------------------
// Recipients: the pickup record, punctuality ratings and any appeal. Bakeries: the reputation from their reviews.
router.get('/me', requireRole('bakery', ...RECIPIENTS), async (req, res) => {
  if (req.user.role === 'bakery') return res.json({ role: 'bakery', reputation: await bakeryReputation(req.user._id) });
  await sweepMissed();
  const [reliability, ratings, appeal] = await Promise.all([
    reliabilityFor(req.user._id),
    RecipientRating.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(5),
    Appeal.findOne({ user: req.user._id }).sort({ createdAt: -1 }),
  ]);
  res.json({
    role: req.user.role,
    reliability: { ...reliability, rules: RELIABILITY },
    ratings: ratings.map((r) => ({ id: String(r._id), bakeryName: r.bakeryName, punctuality: r.punctuality, comment: r.comment, createdAt: r.createdAt })),
    appeal: appeal ? appealDTO(appeal) : null,
  });
});

export default router;
