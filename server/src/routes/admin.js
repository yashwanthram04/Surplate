import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAdmin } from '../middleware/auth.js';
import User from '../models/User.js';
import { toUserDTO } from '../utils/serialize.js';

const router = Router();
router.use(requireAdmin);

const STATUSES = ['pending', 'approved', 'rejected'];

// GET /api/admin/charities?status=pending|approved|rejected – the verification queue, with a count per status.
router.get('/charities', async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
  const [charities, counts] = await Promise.all([
    User.find({ role: 'charity', 'verification.status': status }).sort({ createdAt: 1 }),
    User.aggregate([{ $match: { role: 'charity' } }, { $group: { _id: '$verification.status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    items: charities.map(toUserDTO),
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0])),
  });
});

// POST /api/admin/charities/:id/decision  { decision: 'approve' | 'reject', note }
router.post('/charities/:id/decision', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Charity not found.' });
  const charity = await User.findOne({ _id: req.params.id, role: 'charity' });
  if (!charity) return res.status(404).json({ error: 'Charity not found.' });

  const { decision } = req.body ?? {};
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
  if (!['approve', 'reject'].includes(decision)) return res.status(422).json({ error: 'Choose approve or reject.' });
  if (decision === 'reject' && !note) {
    return res.status(422).json({ error: 'Please fix the highlighted fields.', fields: { note: 'Tell the charity why, so they can fix it and re-apply.' } });
  }

  charity.verification = { status: decision === 'approve' ? 'approved' : 'rejected', note: decision === 'approve' ? '' : note, reviewedAt: new Date() };
  await charity.save();
  res.json({ user: toUserDTO(charity) });
});

export default router;
