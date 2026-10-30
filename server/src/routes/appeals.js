import { Router } from 'express';
import mongoose from 'mongoose';
import Appeal from '../models/Appeal.js';
import User from '../models/User.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { fail, reliabilityFor, sweepMissed } from '../services/reservations.js';
import { parseAppealInput } from '../utils/validateReview.js';

export const WAIVER_DAYS = 7; // how long an approved appeal lifts the block
const RETRY_AFTER_DENIAL_HOURS = 24;
const STATUSES = ['pending', 'approved', 'denied'];

export function appealDTO(a) {
  const o = typeof a.toObject === 'function' ? a.toObject() : a;
  return {
    id: String(o._id), userName: o.userName, userRole: o.userRole, reason: o.reason, status: o.status,
    snapshot: o.snapshot, adminNote: o.adminNote || '', decidedAt: o.decidedAt ?? null, waivedUntil: o.waivedUntil ?? null, createdAt: o.createdAt,
  };
}

const router = Router();

// A blocked recipient asks to be allowed to reserve again.
router.post('/', requireRole('charity', 'individual'), async (req, res) => {
  const { value, errors } = parseAppealInput(req.body);
  if (Object.keys(errors).length) return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: errors });
  await sweepMissed();
  const reliability = await reliabilityFor(req.user._id);
  if (reliability.level !== 'blocked') fail('You are not blocked from reserving, so there is nothing to appeal.');

  const last = await Appeal.findOne({ user: req.user._id }).sort({ createdAt: -1 });
  if (last?.status === 'pending') fail('You already have an appeal waiting for review.');
  if (last?.status === 'denied' && last.decidedAt > new Date(Date.now() - RETRY_AFTER_DENIAL_HOURS * 3600000)) {
    fail(`Your last appeal was declined. You can appeal again ${RETRY_AFTER_DENIAL_HOURS} hours after the decision.`);
  }
  try {
    const appeal = await Appeal.create({
      user: req.user._id, userName: req.user.name, userRole: req.user.role, ...value,
      snapshot: { score: reliability.score, missed: reliability.missed, recent: reliability.recent },
    });
    res.status(201).json(appealDTO(appeal));
  } catch (err) {
    if (err?.code === 11000) fail('You already have an appeal waiting for review.');
    throw err;
  }
});

// Admin queue, with a count per status.
router.get('/', requireAdmin, async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const [items, counts] = await Promise.all([
    Appeal.find({ status }).sort(status === 'pending' ? { createdAt: 1 } : { decidedAt: -1 }).limit(100),
    Appeal.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({ items: items.map(appealDTO), counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])) });
});

router.post('/:id/decision', requireAdmin, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Appeal not found.' });
  const { decision } = req.body ?? {};
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  if (!['approve', 'deny'].includes(decision)) return res.status(422).json({ error: 'Choose approve or deny.' });
  if (decision === 'deny' && !note) {
    return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: { note: 'Tell them why, so they know what to change.' } });
  }
  const now = new Date();
  const waivedUntil = decision === 'approve' ? new Date(now.getTime() + WAIVER_DAYS * 86400000) : undefined;
  const appeal = await Appeal.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { status: decision === 'approve' ? 'approved' : 'denied', adminNote: note, decidedAt: now, decidedBy: req.user._id, waivedUntil },
    { returnDocument: 'after' },
  );
  if (!appeal) return res.status(409).json({ error: 'This appeal has already been decided, or no longer exists.' });
  if (waivedUntil) await User.updateOne({ _id: appeal.user }, { blockWaivedUntil: waivedUntil });
  res.json(appealDTO(appeal));
});

export default router;
