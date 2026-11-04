// Adds a few months of past, completed pickups so the impact dashboard has real trends to draw.
// Purely additive (listings and reservations only) and safe to re-run: it does nothing if older history already exists.
// Also runs at the end of `npm run seed` / `seed:reset`. Tests never call it, so their numbers stay small and predictable.
//   npm run seed:history
import mongoose from 'mongoose';
import { gramsPerMeal } from './config.js';
import { connectDb } from './db.js';
import Listing from './models/Listing.js';
import Reservation from './models/Reservation.js';
import User from './models/User.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const DAYS_BACK = 150;

// What each demo bakery tends to have left over: [name, grams per unit, dietary tags, allergens, emoji, colours].
const MENU = {
  'sunrise@demo.surplate.sg': [
    ['Assorted croissants', 90, ['vegetarian'], ['gluten', 'dairy', 'eggs'], '🥐', '#fde68a', '#f59e0b'],
    ['Sourdough loaves', 450, ['vegan', 'vegetarian'], ['gluten'], '🍞', '#fed7aa', '#c2410c'],
    ['Kaya toast sets', 120, ['vegetarian'], ['gluten', 'eggs', 'dairy'], '🍞', '#d9f99d', '#65a30d'],
    ['Pain au chocolat', 85, ['vegetarian'], ['gluten', 'dairy', 'eggs', 'soy'], '🥐', '#fde68a', '#b45309'],
  ],
  'crumb@demo.surplate.sg': [
    ['Chocolate muffins', 110, ['vegetarian'], ['gluten', 'dairy', 'eggs', 'soy'], '🧁', '#fbcfe8', '#be185d'],
    ['Vegan banana bread', 150, ['vegan', 'vegetarian'], ['gluten', 'nuts'], '🍌', '#fef08a', '#a16207'],
    ['Egg tarts', 70, ['vegetarian'], ['gluten', 'eggs', 'dairy'], '🥧', '#fde68a', '#d97706'],
    ['Blueberry scones', 95, ['vegetarian'], ['gluten', 'dairy', 'eggs'], '🫐', '#c7d2fe', '#4338ca'],
  ],
  'goldenloaf@demo.surplate.sg': [
    ['Pandan buns', 80, ['halal', 'vegetarian'], ['gluten', 'eggs'], '🥯', '#bbf7d0', '#15803d'],
    ['Curry puffs', 90, ['halal', 'dairy-free'], ['gluten', 'eggs'], '🥟', '#fed7aa', '#ea580c'],
    ['Pineapple tarts', 30, ['vegetarian'], ['gluten', 'dairy', 'eggs'], '🍍', '#fef08a', '#ca8a04'],
    ['Pandan chiffon cake', 400, ['vegetarian'], ['gluten', 'eggs'], '🍰', '#bbf7d0', '#15803d'],
  ],
};

// Small deterministic generator: the same history every run, but still a little uneven like real life.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function photo(emoji, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="170" text-anchor="middle">${emoji}</text></svg>`;
  return { data: Buffer.from(svg), contentType: 'image/svg+xml' };
}

export async function seedDemoHistory(now = Date.now()) {
  const old = await Reservation.exists({ status: 'collected', collectedAt: { $lt: new Date(now - 14 * DAY) } });
  if (old) {
    console.log('Past pickups already exist, skipping history.');
    return { listings: 0, reservations: 0 };
  }
  const users = await User.find({ email: { $in: [...Object.keys(MENU), 'hope@demo.surplate.sg', 'alex@demo.surplate.sg'] } });
  const by = Object.fromEntries(users.map((u) => [u.email, u]));
  const hope = by['hope@demo.surplate.sg'];
  const alex = by['alex@demo.surplate.sg'];
  if (!hope || !alex || !Object.keys(MENU).every((e) => by[e])) {
    console.warn('Demo accounts not found, skipped history (run `npm run seed` first).');
    return { listings: 0, reservations: 0 };
  }

  const rand = rng(216);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const today = Math.floor(now / DAY) * DAY; // midnight UTC; Singapore evenings (5-9 pm) sit at 09:00-13:00 UTC on the same date
  const grams = gramsPerMeal();

  const listings = [];
  const reservations = [];
  for (const [email, menu] of Object.entries(MENU)) {
    const bakery = by[email];
    for (let back = DAYS_BACK; back >= 1; back--) {
      const progress = 1 - back / DAYS_BACK; // 0 = oldest, 1 = yesterday: more bakeries and more food as the app "catches on"
      const day = new Date(today - back * DAY);
      const weekend = [0, 6].includes(day.getUTCDay());
      if (rand() > (0.07 + 0.33 * progress) * (weekend ? 1.3 : 1)) continue;

      const [itemName, unitGrams, dietaryTags, allergens, emoji, from, to] = pick(menu);
      const evening = rand() < 0.75;
      const pickupStart = new Date(today - back * DAY + (evening ? 9 : 4) * 60 * MIN + between(0, 2) * 30 * MIN);
      const slots = between(3, 5);
      const pickupEnd = new Date(pickupStart.getTime() + slots * 30 * MIN);
      const takers = Math.min(slots, between(2, 3) + (progress > 0.55 ? 1 : 0));
      const listingId = new mongoose.Types.ObjectId();

      let taken = 0;
      const rows = [];
      for (let i = 0; i < takers; i++) {
        const charity = rand() < 0.6;
        // Size each pickup by weight (not unit count) so a loaf and a pastry weigh about the same on the chart; charities take more as they grow.
        const kg = charity ? (0.6 + rand() * 0.9) * (1 + progress * 0.8) : 0.15 + rand() * 0.25;
        const quantity = Math.max(1, Math.round((kg * 1000) / unitGrams));
        const slotStart = new Date(pickupStart.getTime() + i * 30 * MIN);
        const cancelled = rand() < 0.07;
        if (!cancelled) taken += quantity;
        rows.push({
          listing: listingId, bakery: bakery._id, bakeryName: bakery.name, itemName, address: bakery.address,
          pickupStart, pickupEnd, slotStart, slotEnd: new Date(slotStart.getTime() + 30 * MIN), slotMinutes: 30,
          recipient: (charity ? hope : alex)._id, recipientName: (charity ? hope : alex).name, recipientRole: charity ? 'charity' : 'individual',
          quantity, weightGramsPerUnit: unitGrams, gramsPerMeal: grams,
          status: cancelled ? 'cancelled' : 'collected',
          ...(cancelled
            ? { cancelledAt: new Date(slotStart.getTime() - between(30, 240) * MIN) }
            : { collectedAt: new Date(slotStart.getTime() + between(2, 25) * MIN) }),
          createdAt: new Date(pickupStart.getTime() - between(20, 180) * MIN),
        });
      }
      for (const r of rows) r.updatedAt = r.collectedAt ?? r.cancelledAt;

      const quantity = taken + between(0, 6);
      listings.push({
        _id: listingId, bakery: bakery._id, bakeryName: bakery.name, itemName,
        description: 'Left over at closing time.', quantity: Math.max(quantity, 1), quantityRemaining: Math.max(quantity, 1) - taken,
        weightGramsPerUnit: unitGrams, dietaryTags, allergens, slotMinutes: 30, visibleToIndividuals: rand() < 0.4,
        bestBefore: new Date(pickupEnd.getTime() + 12 * 60 * MIN), pickupStart, pickupEnd,
        address: bakery.address, postal: bakery.postal ?? '', location: { type: 'Point', coordinates: [bakery.lng, bakery.lat] },
        photo: photo(emoji, from, to), createdAt: new Date(pickupStart.getTime() - 4 * 60 * MIN), updatedAt: pickupEnd,
      });
      reservations.push(...rows);
    }
  }

  await Listing.insertMany(listings);
  await Reservation.insertMany(reservations);
  const collected = reservations.filter((r) => r.status === 'collected');
  const kg = collected.reduce((sum, r) => sum + (r.quantity * r.weightGramsPerUnit) / 1000, 0);
  console.log(`Added ${listings.length} past listings and ${collected.length} completed pickups over ${DAYS_BACK} days (about ${Math.round(kg)} kg rescued).`);
  return { listings: listings.length, reservations: reservations.length };
}

if (process.argv[1]?.endsWith('seed-history.js')) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo history in production.');
    process.exit(1);
  }
  await import('dotenv/config');
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set (see server/.env.example).');
    process.exit(1);
  }
  await connectDb();
  await seedDemoHistory();
  await mongoose.disconnect();
}
