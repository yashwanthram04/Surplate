import { Router } from 'express';
import mongoose from 'mongoose';
import { requireBakery } from '../middleware/auth.js';
import Need from '../models/Need.js';
import Pledge from '../models/Pledge.js';
import { fail, transaction } from '../services/reservations.js';
import { toPledgeDTO } from '../utils/serialiseNeed.js';
import { parsePledgeInput } from '../utils/validateNeed.js';

const router = Router();

const invalid = (res, fields) => res.status(422).json({
    error: 'Please fix the highlighted fields.',
    fields,
});

router.param('pledgeId', (req, res, next, id) => {
    if (!mongoose.isValidObjectId(id)) {
        return res.status(404).json({ error: 'Pledge not found.' });
    }
    next();
});

// GET /api/needs/pledges/mine
router.get('/mine', requireBakery, async (req, res) => {
  const docs = await Pledge.find({ bakery: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ items: docs.map(toPledgeDTO) });
});

// POST /api/needs/pledges/:pledgeId/withdraw
router.post('/:pledgeId/withdraw', requireBakery, async (req, res) => {
  const pledge = await transaction(async (session) => {
    const p = await Pledge.findOneAndUpdate(
      { _id: req.params.pledgeId, bakery: req.user._id, status: 'pledged' },
      { status: 'withdrawn', withdrawnAt: new Date(), withdrawnBy: 'bakery' },
      { session, returnDocument: 'after' }
    );
    if (!p) fail('Pledge not found, or it was already withdrawn.', 404);
    await Need.updateOne({ _id: p.need }, { $inc: { quantityPledged: -p.quantity } }, { session });
    await Need.updateOne({ _id: p.need, status: 'fulfilled' }, { $set: { status: 'open' }, $unset: { fulfilledAt: '' } }, { session });
    return p;
  });
  res.json(toPledgeDTO(pledge));
});

// PUT /api/needs/pledges/:pledgeId
router.put('/:pledgeId', requireBakery, async (req, res) => {
  const { value, errors } = parsePledgeInput(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);

  const updatedPledge = await transaction(async (session) => {
    const pledge = await Pledge.findOne({
      _id: req.params.pledgeId,
      bakery: req.user._id,
      status: 'pledged',
    }).session(session);

    if (!pledge) fail('Pledge not found, or it is no longer active.', 404);

    const delta = value.quantity - pledge.quantity;
    const now = new Date();
    let need;

    if (delta > 0) {
      need = await Need.findOneAndUpdate(
        {
          _id: pledge.need,
          status: 'open',
          neededBy: { $gt: now },
          $expr: {
            $lte: [
              { $add: ['$quantityPledged', delta] },
              '$quantityTarget',
            ],
          },
        },
        { $inc: { quantityPledged: delta } },
        { session, returnDocument: 'after' }
      );
      if (!need) fail('This request cannot accept that many additional units.');
    } else {
      need = await Need.findOneAndUpdate(
        {
          _id: pledge.need,
          status: { $in: ['open', 'fulfilled'] },
          quantityPledged: { $gte: -delta },
        },
        { $inc: { quantityPledged: delta } },
        { session, returnDocument: 'after' }
      );
      if (!need) fail('This request can no longer be updated.');
    }

    if (need.quantityPledged >= need.quantityTarget) {
      need.set({ status: 'fulfilled', fulfilledAt: now });
      await need.save({ session });
    } else if (need.status === 'fulfilled') {
      need.set({ status: 'open' });
      need.fulfilledAt = undefined;
      await need.save({ session });
    }

    pledge.quantity = value.quantity;
    await pledge.save({ session });
    return pledge;
  });

  res.json(toPledgeDTO(updatedPledge));
});

export default router;