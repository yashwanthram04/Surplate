import mongoose from 'mongoose';
import RecipientRating from '../models/RecipientRating.js';
import Review from '../models/Review.js';

// ---- how the two reliability scores are built ------------------------------------------------
// Recipients: 80% pickups collected (the no-show record, see reliabilityFor) + 20% punctuality as rated
//   by bakeries. Punctuality only counts once there are `minRatings` of them, so one bad day can't swing it.
// Bakeries: 60% "the listing matched what I got" (accuracy) + 40% food rating, from recipients' reviews.
//   Needs `minReviews` reviews; until then the bakery is shown as "New".
export const REPUTATION = {
  punctualityWeight: 0.2, punctualityMinRatings: 3, punctualityRecent: 20, punctualityDays: 90,
  accuracyWeight: 0.6, bakeryMinReviews: 3,
  pinLimit: 3,
};

const round1 = (n) => Math.round(n * 10) / 10;
/** 1–5 stars on a 0–100 scale (1 star = 0, 5 stars = 100). */
export const starsToPercent = (avg) => Math.round(((avg - 1) / 4) * 100);

/** The recipient's recent punctuality ratings from bakeries, or null when there are none. */
export async function punctualityFor(recipient, session = null, now = new Date()) {
  const since = new Date(now.getTime() - REPUTATION.punctualityDays * 86400000);
  const rows = await RecipientRating.find({ recipient, createdAt: { $gte: since } })
    .sort({ createdAt: -1, _id: -1 }).limit(REPUTATION.punctualityRecent).select('punctuality').session(session);
  if (!rows.length) return null;
  const average = rows.reduce((sum, r) => sum + r.punctuality, 0) / rows.length;
  return { average: round1(average), count: rows.length, percent: starsToPercent(average), counted: rows.length >= REPUTATION.punctualityMinRatings };
}

export function tierFor(score) {
  if (score == null) return 'new';
  return score >= 85 ? 'excellent' : score >= 70 ? 'good' : 'attention';
}

/** Public reputation of a bakery, built from its recipients' reviews. */
export async function bakeryReputation(bakery) {
  const id = new mongoose.Types.ObjectId(String(bakery));
  const [[totals], histogram] = await Promise.all([
    Review.aggregate([{ $match: { bakery: id } }, { $group: {
      _id: null, count: { $sum: 1 }, food: { $avg: '$foodRating' }, accuracy: { $avg: '$accuracyRating' }, people: { $sum: { $ifNull: ['$peopleServed', 0] } },
      pinned: { $sum: { $cond: ['$pinned', 1, 0] } },
    } }]),
    Review.aggregate([{ $match: { bakery: id } }, { $group: { _id: '$foodRating', n: { $sum: 1 } } }]),
  ]);
  const count = totals?.count ?? 0;
  const foodAverage = count ? round1(totals.food) : null;
  const accuracyAverage = count ? round1(totals.accuracy) : null;
  const score = count >= REPUTATION.bakeryMinReviews
    ? Math.round(starsToPercent(totals.accuracy) * REPUTATION.accuracyWeight + starsToPercent(totals.food) * (1 - REPUTATION.accuracyWeight))
    : null;
  return {
    score, tier: tierFor(score), thankYouCount: count, foodAverage, accuracyAverage, pinned: totals?.pinned ?? 0,
    peopleServed: totals?.people ?? 0,
    stars: Object.fromEntries([5, 4, 3, 2, 1].map((s) => [s, histogram.find((h) => h._id === s)?.n ?? 0])),
    rules: { minReviews: REPUTATION.bakeryMinReviews, accuracyWeight: REPUTATION.accuracyWeight },
  };
}

/** { bakeryId: thankYouCount } for the listing cards. */
export async function thankYouCounts(bakeryIds) {
  const ids = [...new Set(bakeryIds.map(String))].map((id) => new mongoose.Types.ObjectId(id));
  if (!ids.length) return {};
  const rows = await Review.aggregate([{ $match: { bakery: { $in: ids } } }, { $group: { _id: '$bakery', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

/** Adds bakery.thankYouCount to listing DTOs in place. */
export async function attachThankYouCounts(items) {
  const counts = await thankYouCounts(items.map((i) => i.bakery.id));
  for (const item of items) item.bakery.thankYouCount = counts[item.bakery.id] ?? 0;
  return items;
}
