import { Router } from 'express';
import Reservation from '../models/Reservation.js';
import Fridge from '../models/Fridge.js';
import Need from '../models/Need.js';
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
  const interval = dates.$gte && (dates.$lt ?? new Date()) - dates.$gte <= 62 * 86400000 ? 'day' : 'month';
  const timeline = () => [
    { $match: { collectedAt: { $type: 'date' } } },
    { $group: { _id: { $dateToString: { date: '$collectedAt', format: interval === 'day' ? '%Y-%m-%d' : '%Y-%m', timezone: 'Asia/Singapore' } }, ...sums } },
    { $sort: { _id: 1 } },
  ];
  const scope = req.user.role === 'bakery' ? { bakery: req.user._id } : { recipient: req.user._id };
  const group = (field = null) => [
    { $group: { _id: field ? `$${field}` : null, ...sums, ...(field ? { name: { $first: `$${field}Name` } } : {}) } },
    { $sort: { collectedKg: -1, _id: 1 } },
  ];
  // Derive every card and breakdown from the same stream of completed collections.
  const [[{ mine, platform, bakeries, charities, personalTrend, platformTrend, recipients, foods }], fridges, needs] = await Promise.all([Reservation.aggregate([
    { $match: match },
    { $facet: {
      mine: [{ $match: scope }, ...group()],
      platform: group(),
      bakeries: group('bakery'),
      charities: [{ $match: { recipientRole: 'charity' } }, ...group('recipient')],
      personalTrend: [{ $match: scope }, ...timeline()],
      platformTrend: timeline(),
      recipients: [{ $group: { _id: '$recipientRole', ...sums } }],
      foods: [{ $group: { _id: '$itemName', ...sums } }, { $sort: { collectedKg: -1, _id: 1 } }, { $limit: 5 }],
    } },
  ]),
  Fridge.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$latestStatus', count: { $sum: 1 }, stale: { $sum: { $cond: [{ $or: [{ $eq: [{ $ifNull: ['$latestUpdateAt', null] }, null] }, { $lt: ['$latestUpdateAt', new Date(Date.now() - 86400000)] }] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]),
  Need.aggregate([
    { $match: { status: 'open', neededBy: { $gt: new Date() } } },
    { $group: { _id: null, open: { $sum: 1 }, target: { $sum: '$quantityTarget' }, pledged: { $sum: '$quantityPledged' } } },
  ])]);
  const empty = { collectedKg: 0, estimatedMeals: 0, collections: 0 };
  // Platform breakdowns expose organisation aggregates, never individual recipient details.
  res.json({ mine: mine[0] ?? empty, platform: platform[0] ?? empty,
    bakeries: bakeries.map(({ _id, ...r }) => r), charities: charities.map(({ _id, ...r }) => r),
    trend: { interval, mine: personalTrend.map(({ _id, ...r }) => ({ date: _id, ...r })), platform: platformTrend.map(({ _id, ...r }) => ({ date: _id, ...r })) },
    recipients: recipients.map(({ _id, ...r }) => ({ role: _id, ...r })),
    foods: foods.map(({ _id, ...r }) => ({ name: _id, ...r })),
    community: { fridges: fridges.map(({ _id, ...r }) => ({ status: _id, ...r })), needs: needs[0] ? { open: needs[0].open, target: needs[0].target, pledged: needs[0].pledged } : { open: 0, target: 0, pledged: 0 } },
  });
});
export default router;
