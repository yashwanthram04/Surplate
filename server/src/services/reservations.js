import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import Listing from '../models/Listing.js';
import Reservation from '../models/Reservation.js';
import User from '../models/User.js';
import { missedGraceMinutes } from '../config.js';
import { REPUTATION, punctualityFor } from './reputation.js'; // REVIEWS FEATURE

import { DEFAULT_SLOT_MINUTES, findSlot } from '../utils/slots.js';
import { canView } from '../utils/visibility.js';
import { gramsPerMeal } from '../config.js';

export const transaction = (work) => mongoose.connection.transaction(work);
export const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

// Call inside the same transaction as listing removal or account deletion.
export async function cancelOpen(filter, session) {
  const rows = await Reservation.find({ ...filter, status: 'reserved' }).session(session);
  for (const row of rows) {
    row.status = missedAfter(row) <= new Date() ? 'missed' : 'cancelled';
    row.cancelledAt = new Date();
    await row.save({ session });
    await Listing.updateOne({ _id: row.listing }, { $inc: { quantityRemaining: row.quantity } }, { session });
  }
}

/** When an uncollected reservation counts as missed: its slot end (the whole window for older records) plus the grace period. */
export const missedAfter = (r) => new Date((r.slotEnd ?? r.pickupEnd).getTime() + missedGraceMinutes() * 60000);

// ---- reservation codes ---------------------------------------------------------------------
// No 0/O, 1/I/L: the code is read aloud or typed from a phone screen.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const normaliseCode = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
/** A code no other open reservation at this bakery is using (a partial unique index backs this up). */
export async function uniqueCode(bakery, session) {
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    if (!(await Reservation.exists({ bakery, code, status: 'reserved' }).session(session))) return code;
  }
}

// ---- missed pickups ------------------------------------------------------------------------
/** Marks one open reservation missed and puts its food back on the listing. Returns null if it was no longer open. */
export async function markMissed(filter, releasedBy, session, now = new Date()) {
  const row = await Reservation.findOneAndUpdate({ ...filter, status: 'reserved' },
    { status: 'missed', missedAt: now, releasedBy }, { session, returnDocument: 'after' });
  if (row) await Listing.updateOne({ _id: row.listing, status: 'active' }, { $inc: { quantityRemaining: row.quantity } }, { session });
  return row;
}

/** Releases every reservation whose grace period has passed. Each is its own transaction, so a collection racing it has one outcome. */
export async function releaseMissed(now = new Date()) {
  const cutoff = new Date(now.getTime() - missedGraceMinutes() * 60000);
  const due = await Reservation.find({ status: 'reserved', $or: [
    { slotEnd: { $lte: cutoff } },
    { slotEnd: { $exists: false }, pickupEnd: { $lte: cutoff } },
  ] }).select('_id').limit(500);
  for (const { _id } of due) await transaction((session) => markMissed({ _id }, 'system', session, now));
  return due.length;
}

// Runs from a timer and before reads that show stock; concurrent callers share one run.
let running = null;
export function sweepMissed() {
  running ??= releaseMissed().finally(() => { running = null; });
  return running;
}
export function startMissedTimer() {
  return setInterval(() => sweepMissed().catch((err) => console.error('Releasing missed reservations failed:', err)), 60000).unref();
}

// ---- reliability ---------------------------------------------------------------------------
// Score = share of a recipient's last 10 finished pickups (in the past 30 days) that were collected.
// Misses older than 30 days drop out, so a blocked account recovers with time.
export const RELIABILITY = { recent: 10, days: 30, limitedBelow: 80, blockedBelow: 50, blockedMinMisses: 3, limitedMaxActive: 1 };

export async function reliabilityFor(recipient, session = null, now = new Date()) {
  const since = new Date(now.getTime() - RELIABILITY.days * 86400000);
  // Sequential: a transaction's session can't run operations in parallel.
  const rows = await Reservation.find({ recipient, status: { $in: ['collected', 'missed', 'expired'] }, pickupStart: { $gte: since } })
    .sort({ pickupStart: -1, _id: -1 }).limit(RELIABILITY.recent).select('status pickupStart').session(session);
  const active = await Reservation.countDocuments({ recipient, status: 'reserved' }).session(session);
  // >>> REVIEWS FEATURE (start): bakeries' punctuality ratings count towards the score, and an approved appeal lifts a block for a while
  const punctuality = await punctualityFor(recipient, session, now);
  const account = await User.findById(recipient).select('blockWaivedUntil').session(session);
  // <<< REVIEWS FEATURE (end)
  const missed = rows.filter((r) => r.status !== 'collected').length;
  const collected = rows.length - missed;
  const pickupScore = rows.length ? Math.round((collected / rows.length) * 100) : 100;
  const score = punctuality?.counted
    ? Math.round(pickupScore * (1 - REPUTATION.punctualityWeight) + punctuality.percent * REPUTATION.punctualityWeight)
    : pickupScore;
  let level = missed >= RELIABILITY.blockedMinMisses && score < RELIABILITY.blockedBelow ? 'blocked'
    : score < RELIABILITY.limitedBelow ? 'limited' : 'good';
  const blockedUntil = level === 'blocked' ? blockLiftsAt(rows, missed) : null;
  const waivedUntil = level === 'blocked' && account?.blockWaivedUntil > now ? account.blockWaivedUntil : null;
  if (waivedUntil) level = 'limited';
  const maxActive = { blocked: 0, limited: RELIABILITY.limitedMaxActive, good: null }[level];
  return { score, pickupScore, punctuality, collected, missed, recent: rows.length, level, active, maxActive, blockedUntil, waivedUntil };
}

/** When enough missed pickups have aged out (30 days) for the block to lift on its own, assuming nothing else changes. */
function blockLiftsAt(rows, missed) {
  const mustExpire = missed - (RELIABILITY.blockedMinMisses - 1);
  const misses = rows.filter((r) => r.status !== 'collected').map((r) => r.pickupStart.getTime()).sort((a, b) => a - b);
  return misses[mustExpire - 1] ? new Date(misses[mustExpire - 1] + RELIABILITY.days * 86400000) : null;
}

/** Throws the reason a recipient may not hold one more reservation, if any. */
export function assertCanReserve(reliability) {
  if (reliability.level === 'blocked') {
    fail(`Your reliability score is ${reliability.score}% after ${reliability.missed} missed pickups, so you can't reserve right now. Missed pickups stop counting after ${RELIABILITY.days} days.`, 403);
  }
  if (reliability.maxActive !== null && reliability.active >= reliability.maxActive) {
    fail(`Your reliability score is ${reliability.score}%, so you can hold ${reliability.maxActive} reservation at a time. Collect or cancel it first.`, 403);
  }
}

export function reservationDTO(doc) {
  const r = doc.toObject();
  const deadline = missedAfter(r);
  return { id: String(r._id), listingId: String(r.listing), bakeryName: r.bakeryName,
    recipientName: r.recipientName, recipientRole: r.recipientRole, itemName: r.itemName, address: r.address,
    quantity: r.quantity, pickupStart: r.pickupStart, pickupEnd: r.pickupEnd,
    slotStart: r.slotStart ?? r.pickupStart, slotEnd: r.slotEnd ?? r.pickupEnd, slotMinutes: r.slotMinutes ?? null,
    code: r.code ?? null, missedAfter: deadline,
    status: r.status === 'expired' || (r.status === 'reserved' && deadline <= new Date()) ? 'missed' : r.status,
    releasedBy: r.releasedBy ?? null,
    createdAt: r.createdAt, collectedAt: r.collectedAt, cancelledAt: r.cancelledAt, missedAt: r.missedAt,
    weightKg: r.quantity * r.weightGramsPerUnit / 1000,
    estimatedMeals: r.quantity * r.weightGramsPerUnit / r.gramsPerMeal };
}


export async function createReservation({ userId, listingId, quantity, slotStart }, session) {
  const user = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { reservationVersion: 1 } },
    { returnDocument: 'after', session }
  );

  if (!user) fail('Account no longer available.', 401);

  const listing = await Listing.findById(listingId).session(session);
  const now = new Date();

  if (!listing || listing.status !== 'active' || !canView(listing, user)) {
    fail('Listing not available. It may still be in charity priority.', 404);
  }

  if (listing.pickupEnd <= now) fail('The pickup window has closed.');
  if (!listing.weightGramsPerUnit) {
    fail('The bakery must add a unit weight before this listing can be reserved.');
  }

  const slot = findSlot(listing, slotStart, now);
  if (!slot) fail('Choose a collection slot inside the pickup window that has not ended yet.', 422);

  assertCanReserve(await reliabilityFor(user._id, session, now));

  const stock = await Listing.updateOne(
    {
      _id: listingId,
      status: 'active',
      quantityRemaining: { $gte: quantity },
      pickupEnd: { $gt: now },
    },
    { $inc: { quantityRemaining: -quantity } },
    { session }
  );

  if (!stock.modifiedCount) {
    fail(`Only ${listing.quantityRemaining} left. Choose a smaller quantity.`);
  }

  const [created] = await Reservation.create(
    [{
      listing: listing._id,
      bakery: listing.bakery,
      recipient: user._id,
      bakeryName: listing.bakeryName,
      recipientName: user.name,
      recipientRole: user.role,
      itemName: listing.itemName,
      address: listing.address,
      pickupStart: listing.pickupStart,
      pickupEnd: listing.pickupEnd,
      slotStart: slot.start,
      slotEnd: slot.end,
      slotMinutes: listing.slotMinutes ?? DEFAULT_SLOT_MINUTES,
      code: await uniqueCode(listing.bakery, session),
      quantity,
      weightGramsPerUnit: listing.weightGramsPerUnit,
      gramsPerMeal: gramsPerMeal(),
    }],
    { session }
  );

  return created;
}
