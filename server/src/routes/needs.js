import pledgesRouter from './pledges.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { requireBakery, requireRole } from '../middleware/auth.js';
import { DIETARY_TAGS } from '../models/Listing.js';
import Need from '../models/Need.js';
import Pledge from '../models/Pledge.js';
import { fail, transaction } from '../services/reservations.js';
import { toNeedDTO, toPledgeDTO } from '../utils/serialiseNeed.js';
import { toList } from '../utils/validate.js';
import { parseNeedInput, parsePledgeInput } from '../utils/validateNeed.js';

const router = Router();
const BROWSE_LIMIT = 100;
const requireCharity = requireRole('charity');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v) => (typeof v === 'string' ? v : '');
const invalid = (res, fields) => res.status(422).json({ error: 'Please fix the highlighted fields.', fields });


function requireApprovedCharity(req, res, next) {
  if (req.user.verification?.status !== 'approved') {
    return res.status(403).json({ error: 'Your charity must be verified by an admin before you can post needs.' });
  }
  next();
}

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Need not found.' });
  next();
});

/** Loads the need into req.need and checks that the signed-in charity owns it. */
async function loadOwned(req, res, next) {
  const need = await Need.findById(req.params.id);
  if (!need) return res.status(404).json({ error: 'Need not found.' });
  if (!need.charity.equals(req.user._id)) return res.status(403).json({ error: 'You can only change your own needs.' });
  req.need = need;
  next();
}


// Needs

router.use('/pledges', pledgesRouter);
router.get('/', async (req, res) => {
    const now = new Date();
    const filter = {
        $or: [
            { status: 'open', neededBy: { $gt: now } },
            { status: 'fulfilled' },
            { status: 'cancelled' },
        ],
    };

const dietary = toList(req.query.dietary).filter((t) => DIETARY_TAGS.includes(t));
if (dietary.length) filter.dietaryTags = { $all: dietary };

const by = str(req.query.neededBy);
if (by) {
    const limit = new Date(`${by}T23:59:59.999+08:00`);
    if (Number.isNaN(limit.getTime())) return res.status(422).json({ error: 'Please choose a valid date.' });
    filter.neededBy = { $gt: now, $lte: limit };
}

const text = str(req.query.q).trim().slice(0, 60);
if (text) {

const rx = new RegExp(escapeRegex(text), 'i');

filter.$and = [
    { $or: filter.$or },
    {
        $or: [
            { title: rx },
            { description: rx },
            { charityName: rx },
        ],
    },
];

delete filter.$or;

}

const docs = await Need.find(filter).sort({ neededBy: 1, _id: 1 }).limit(BROWSE_LIMIT);
res.json({ items: docs.map((d) => toNeedDTO(d, { now })) });
});

// GET /api/needs/mine – the signed-in charity's needs (every status), each with its active pledges.
router.get('/mine', requireCharity, async (req, res) => {
  const docs = await Need.find({ charity: req.user._id }).sort({ createdAt: -1 }).limit(100);
  const pledges = await Pledge.find({ need: { $in: docs.map((d) => d._id) }, status: 'pledged' }).sort({ createdAt: -1 });
  const byNeed = new Map();
  for (const p of pledges) byNeed.set(String(p.need), [...(byNeed.get(String(p.need)) ?? []), p]);
  res.json({ items: docs.map((d) => toNeedDTO(d, { pledges: byNeed.get(String(d._id)) ?? [] })) });
});

// POST /api/needs – post a new need.
router.post('/', requireCharity, requireApprovedCharity, async (req, res) => {
  const { value, errors } = parseNeedInput(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);
  const doc = await Need.create({ ...value, charity: req.user._id, charityName: req.user.name });
  res.status(201).json(toNeedDTO(doc));
});

// GET /api/needs/:id
router.use('/pledges', pledgesRouter);
router.get('/:id', async (req, res) => {
  const need = await Need.findById(req.params.id);
  if (!need) return res.status(404).json({ error: 'Need not found.' });
  res.json(toNeedDTO(need));
});

// PUT /api/needs/:id – edit an open need. The target can't drop below what is already pledged.
router.put('/:id', requireCharity, loadOwned, async (req, res) => {
  if (req.need.status !== 'open') return res.status(409).json({ error: 'Only open needs can be edited.' });
  const { value, errors } = parseNeedInput(req.body);
  if (!errors.quantityTarget && value.quantityTarget < req.need.quantityPledged) {
    errors.quantityTarget = `${req.need.quantityPledged} already pledged, so the target can't go below that.`;
  }
  if (Object.keys(errors).length) return invalid(res, errors);

  // The condition repeats the pledged check, so a pledge that lands a moment ago can't be undercut.
  const updated = await Need.findOneAndUpdate(
    { _id: req.need._id, status: 'open', quantityPledged: { $lte: value.quantityTarget } },
    { $set: value },
    { returnDocument: 'after', runValidators: true }
  );
  if (!updated) return res.status(409).json({ error: 'Someone just pledged to this need. Reload and try again.' });
  if (updated.quantityPledged >= updated.quantityTarget) {
    updated.set({ status: 'fulfilled', fulfilledAt: new Date() });
    await updated.save();
  }
  res.json(toNeedDTO(updated));
});

// DELETE /api/needs/:id – cancel an open need. Its pledges are released.
router.delete('/:id', requireCharity, loadOwned, async (req, res) => {
  if (req.need.status !== 'open') return res.status(409).json({ error: 'Only open needs can be cancelled.' });
  const now = new Date();
  await transaction(async (session) => {
    await Need.updateOne({ _id: req.need._id }, { status: 'cancelled', cancelledAt: now }, { session });
    await Pledge.updateMany({ need: req.need._id, status: 'pledged' }, { status: 'withdrawn', withdrawnAt: now, withdrawnBy: 'charity' }, { session });
  });
  res.status(204).end();
});

// POST /api/needs/:id/pledge  { quantity } – a bakery pledges all or part of what is still needed.
router.post('/:id/pledge', requireBakery, async (req, res) => {
  const { value, errors } = parsePledgeInput(req.body);
  if (Object.keys(errors).length) return invalid(res, errors);

  const pledge = await transaction(async (session) => {
    const now = new Date();
    // ONE database step checks "does this still fit?" and adds the quantity. Two bakeries pledging
    // at the same moment can never push the total past the target.
    const need = await Need.findOneAndUpdate(
      {
        _id: req.params.id,
        status: 'open',
        neededBy: { $gt: now },
        $expr: { $lte: [{ $add: ['$quantityPledged', value.quantity] }, '$quantityTarget'] },
      },
      { $inc: { quantityPledged: value.quantity } },
      { session, returnDocument: 'after' }
    );
    if (!need) {
        const current = await Need.findById(req.params.id).session(session);
        if (!current) fail('Need not found.', 404);
        if (current.status !== 'open' || current.neededBy <= now) fail('This need is no longer open.');
        fail(`Only ${current.quantityTarget - current.quantityPledged} still needed. Pledge that amount or less.`);
    }
    
    if (need.quantityPledged >= need.quantityTarget) {
        need.set({ status: 'fulfilled', fulfilledAt: now }); // target met: fulfilled automatically
        await need.save({ session });
    }
    
    const [created] = await Pledge.create([{
        need: need._id, needTitle: need.title, charity: need.charity, charityName: need.charityName,
        bakery: req.user._id, bakeryName: req.user.name, quantity: value.quantity,
    }], { session });
    return created;
  });
  
  res.status(201).json(toPledgeDTO(pledge));

});

export default router;