import { Router } from 'express';
import Listing from '../models/Listing.js';
import { visibilityFilter } from '../utils/visibility.js';

const router = Router();

// GET /api/stats – live numbers for the home page: what is on the board right now.
router.get('/', async (req, res) => {
  const [row] = await Listing.aggregate([
    // the same listings this visitor would see on the board
    { $match: { status: 'active', pickupEnd: { $gt: new Date() }, quantityRemaining: { $gt: 0 }, ...visibilityFilter(req.user) } },
    { $group: { _id: null, listings: { $sum: 1 }, items: { $sum: '$quantityRemaining' }, bakeries: { $addToSet: '$bakery' } } },
  ]);
  res.json({ listings: row?.listings ?? 0, items: row?.items ?? 0, bakeries: row?.bakeries.length ?? 0 });
});

export default router;
