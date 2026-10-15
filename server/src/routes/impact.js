import { Router } from 'express';
import Reservation from '../models/Reservation.js';
import { requireLogin } from '../middleware/auth.js';

const router = Router();
router.use(requireLogin);
const sums = { collectedKg: { $sum: { $divide: [{ $multiply: ['$quantity', '$weightGramsPerUnit'] }, 1000] } },
  estimatedMeals: { $sum: { $divide: [{ $multiply: ['$quantity', '$weightGramsPerUnit'] }, '$gramsPerMeal'] } },
  collections: { $sum: 1 } };
router.get('/', async (req, res) => {
  const match = { status: 'collected' };
  const dates = {};
  for (const [key, op] of [['from', '$gte'], ['to', '$lt']]) {
    if (req.query[key] !== undefined) {
      const raw = req.query[key];
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) {
        return res.status(422).json({ error: 'Use valid YYYY-MM-DD dates.' });
      }
      // Dashboard days follow Singapore time; the end date includes that entire day.
      dates[op] = new Date(Date.parse(`${raw}T00:00:00+08:00`) + (key === 'to' ? 86400000 : 0));
    }
  }
  if (dates.$gte && dates.$lt && dates.$gte >= dates.$lt) return res.status(422).json({ error: 'End date must be on or after start date.' });
  if (Object.keys(dates).length) match.collectedAt = dates;
  const scope = req.user.role === 'bakery' ? { bakery: req.user._id } : { recipient: req.user._id };
  const group = (field = null) => [
    { $group: { _id: field ? `$${field}` : null, ...sums, ...(field ? { name: { $first: `$${field}Name` } } : {}) } },
    { $sort: { collectedKg: -1, _id: 1 } },
  ];
  // Derive every card and breakdown from the same stream of completed collections.
  const [{ mine, platform, bakeries, charities }] = await Reservation.aggregate([
    { $match: match },
    { $facet: {
      mine: [{ $match: scope }, ...group()],
      platform: group(),
      bakeries: group('bakery'),
      charities: [{ $match: { recipientRole: 'charity' } }, ...group('recipient')],
    } },
  ]);
  const empty = { collectedKg: 0, estimatedMeals: 0, collections: 0 };
  // Platform breakdowns expose organisation aggregates, never individual recipient details.
  res.json({ mine: mine[0] ?? empty, platform: platform[0] ?? empty,
    bakeries: bakeries.map(({ _id, ...r }) => r), charities: charities.map(({ _id, ...r }) => r) });
});
export default router;
