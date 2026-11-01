import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import Listing from './models/Listing.js';
import User from './models/User.js';
import Reservation from './models/Reservation.js';
// >>> FRIDGE FEATURE: ADD these three imports (start): seed:reset clears fridge data
import Fridge from './models/Fridge.js';
import FridgeUpdate from './models/FridgeUpdate.js';
import SpoiledReport from './models/SpoiledReport.js';
// <<< FRIDGE FEATURE (end)
// >>> REVIEWS FEATURE: ADD these three imports (start)
import Review from './models/Review.js';
import RecipientRating from './models/RecipientRating.js';
import Appeal from './models/Appeal.js';
// <<< REVIEWS FEATURE (end)

const MIN = 60 * 1000;

// Fixed ids so tests and docs can refer to the demo accounts.
const id = (n) => new mongoose.Types.ObjectId(`64b00000000000000000000${n}`);
// All demo accounts share this password. It is documented in the README on purpose (the course
// requires dummy logins), so never seed these into a real deployment.
export const DEMO_PASSWORD = 'demo1234';

const SITES = {
  sunrise: { address: '56 ENG HOON STREET', postal: '160056', lat: 1.2851, lng: 103.8317 }, // Tiong Bahru
  crumb: { address: '200 VICTORIA STREET BUGIS JUNCTION', postal: '188021', lat: 1.2999, lng: 103.8553 }, // Bugis
  golden: { address: '4 TAMPINES CENTRAL 5 TAMPINES MALL', postal: '529510', lat: 1.3527, lng: 103.9449 }, // Tampines
};
const approved = { status: 'approved', reviewedAt: new Date() };

export const DEMO_USERS = [
  { _id: id(1), name: 'Sunrise Bakery', email: 'sunrise@demo.surplate.sg', role: 'bakery', ...SITES.sunrise },
  { _id: id(2), name: 'Crumb & Co', email: 'crumb@demo.surplate.sg', role: 'bakery', ...SITES.crumb },
  { _id: id(3), name: 'Golden Loaf Bakery', email: 'goldenloaf@demo.surplate.sg', role: 'bakery', ...SITES.golden },
  { _id: id(4), name: 'Hope Kitchen', email: 'hope@demo.surplate.sg', role: 'charity', registrationNo: 'DEMO-CHARITY-001', verification: approved },
  { _id: id(5), name: 'Alex Tan', email: 'alex@demo.surplate.sg', role: 'individual' },
  // Waiting in the admin's verification queue
  { _id: id(6), name: 'New Hope Shelter', email: 'newhope@demo.surplate.sg', role: 'charity', registrationNo: 'DEMO-CHARITY-002', verification: { status: 'pending' } },
  { _id: id(7), name: 'Surplate Admin', email: 'admin@demo.surplate.sg', role: 'admin' },
  // Three missed pickups: blocked from reserving by the reliability check
  { _id: id(8), name: 'Sam Lee', email: 'sam@demo.surplate.sg', role: 'individual' },
];

/** A simple generated placeholder so seeded listings have a photo. */
function placeholderPhoto(emoji, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="170" text-anchor="middle">${emoji}</text></svg>`;
  return { data: Buffer.from(svg), contentType: 'image/svg+xml' };
}

function demoListings(now) {
  const t = (offsetMin) => new Date(now + offsetMin * MIN);
  const row = (owner, site, item) => ({
    weightGramsPerUnit: 100,
    slotMinutes: 30,
    bakery: owner._id,
    bakeryName: owner.name,
    address: site.address,
    postal: site.postal,
    location: { type: 'Point', coordinates: [site.lng, site.lat] },
    ...item,
    quantityRemaining: item.quantityRemaining ?? item.quantity,
    photo: placeholderPhoto(...item.photo),
  });
  const [sunrise, crumb, golden] = DEMO_USERS;
  return [
    row(sunrise, SITES.sunrise, {
      itemName: 'Assorted croissants', visibleToIndividuals: true, description: 'Butter and almond croissants baked this morning.',
      quantity: 12, dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs', 'nuts'],
      pickupStart: t(-20), pickupEnd: t(90), bestBefore: t(8 * 60), photo: ['🥐', '#fde68a', '#f59e0b'],
    }),
    row(sunrise, SITES.sunrise, {
      itemName: 'Sourdough loaves', visibleToIndividuals: false, description: 'Whole loaves, unsliced.',
      quantity: 6, dietaryTags: ['vegan', 'vegetarian'], allergens: ['gluten'],
      pickupStart: t(-10), pickupEnd: t(240), bestBefore: t(24 * 60), photo: ['🍞', '#fed7aa', '#c2410c'],
    }),
    row(sunrise, SITES.sunrise, {
      itemName: 'Kaya toast sets', visibleToIndividuals: true, description: 'Left over from the breakfast rush.',
      quantity: 16, quantityRemaining: 2, dietaryTags: ['vegetarian'], allergens: ['gluten', 'eggs', 'dairy'],
      pickupStart: t(-180), pickupEnd: t(-60), bestBefore: t(-30), photo: ['🍞', '#d9f99d', '#65a30d'],
    }),
    row(crumb, SITES.crumb, {
      itemName: 'Chocolate muffins', visibleToIndividuals: false, description: 'Double chocolate, packed in boxes of 4.',
      quantity: 20, dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs', 'soy'],
      pickupStart: t(45), pickupEnd: t(180), bestBefore: t(24 * 60), photo: ['🧁', '#fbcfe8', '#be185d'],
    }),
    row(crumb, SITES.crumb, {
      itemName: 'Vegan banana bread', visibleToIndividuals: true, description: 'Sliced loaf, individually wrapped.',
      quantity: 15, dietaryTags: ['vegan', 'vegetarian', 'dairy-free', 'egg-free'], allergens: ['gluten', 'nuts'],
      pickupStart: t(-5), pickupEnd: t(300), bestBefore: t(48 * 60), photo: ['🍌', '#fef08a', '#a16207'],
    }),
    row(crumb, SITES.crumb, {
      itemName: 'Egg tarts', visibleToIndividuals: true, description: 'Classic Portuguese-style egg tarts.',
      quantity: 18, dietaryTags: ['vegetarian'], allergens: ['gluten', 'eggs', 'dairy'],
      pickupStart: t(-15), pickupEnd: t(150), bestBefore: t(12 * 60), photo: ['🥧', '#fde68a', '#d97706'],
    }),
    row(golden, SITES.golden, {
      itemName: 'Pandan buns', visibleToIndividuals: true, description: 'Soft pandan buns with coconut filling.',
      quantity: 30, dietaryTags: ['halal', 'vegetarian'], allergens: ['gluten', 'eggs'],
      pickupStart: t(-60), pickupEnd: t(360), bestBefore: t(24 * 60), photo: ['🥯', '#bbf7d0', '#15803d'],
    }),
    row(golden, SITES.golden, {
      itemName: 'Curry puffs', visibleToIndividuals: false, description: 'Chicken curry puffs, halal-certified.',
      quantity: 24, dietaryTags: ['halal', 'dairy-free'], allergens: ['gluten', 'eggs'],
      pickupStart: t(0), pickupEnd: t(75), bestBefore: t(10 * 60), photo: ['🥟', '#fed7aa', '#ea580c'],
    }),
  ];
}

// >>> REVIEWS FEATURE: ADD this whole function (start)
/**
 * Demo thank-you notes and bakery ratings of customers. `history` is the Kaya toast reservations in the order seeded
 * above: Hope 6, Alex 3, Sam 1, Sam missed x3, Hope cancelled, Hope 2, Alex 1, Hope 1.
 * Alex's 3-unit pickup is left un-reviewed (to demo writing a note) and un-rated (to demo the bakery rating a customer).
 */
export async function seedDemoReviews(history) {
  const [hope6, , sam1, , , , , hope2, alex1, hope1] = history;
  const sunrise = DEMO_USERS[0];
  const [hope, alex, sam] = [DEMO_USERS[3], DEMO_USERS[4], DEMO_USERS[7]];
  const ago = (min) => new Date(Date.now() - min * MIN);
  const note = (r, who, over) => ({ reservation: r._id, bakery: sunrise._id, author: who._id, authorRole: who.role, itemName: r.itemName, ...over });
  await Review.insertMany([
    note(hope6, hope, { nickname: 'Hope Kitchen', note: 'Breakfast for our Saturday residents sorted. Everyone went back for seconds.', foodRating: 5, accuracyRating: 5,
      onBehalfOf: 'the 40 residents at our Saturday breakfast', peopleServed: 40, pinned: true, pinnedAt: ago(60),
      reply: { text: 'See you again next Saturday! 🍞', at: ago(55) }, createdAt: ago(80) }),
    note(sam1, sam, { nickname: 'Sam L.', note: 'Still warm when I picked it up. Thank you!', foodRating: 5, accuracyRating: 4, createdAt: ago(70) }),
    note(hope2, hope, { nickname: 'Hope Kitchen', note: 'Went straight into tomorrow’s lunch packs.', foodRating: 5, accuracyRating: 5,
      onBehalfOf: 'our lunch-pack volunteers', peopleServed: 25, createdAt: ago(50) }),
    note(alex1, alex, { nickname: 'Alex T.', note: 'Generous with the kaya! Made my morning.', foodRating: 4, accuracyRating: 5, createdAt: ago(40) }),
    note(hope1, hope, { nickname: 'Hope Kitchen', note: 'The listing said baked today, but it was still lovely.', foodRating: 4, accuracyRating: 3, createdAt: ago(30),
      reply: { text: 'Thanks for the honest feedback. We will update our listings.', at: ago(25) } }),
  ]);
  const rating = (r, who, punctuality, comment, minutesAgo) => ({ reservation: r._id, bakery: sunrise._id, bakeryName: sunrise.name,
    recipient: who._id, recipientName: who.name, punctuality, comment, createdAt: ago(minutesAgo) });
  await RecipientRating.insertMany([
    rating(hope6, hope, 5, 'Always right on time.', 85),
    rating(hope2, hope, 5, '', 72),
    rating(hope1, hope, 4, 'A few minutes late, but let us know.', 60),
    rating(alex1, alex, 4, '', 55),
  ]);
}
// <<< REVIEWS FEATURE (end)

/** Inserts demo users and listings. With reset it first clears both collections. */
export async function seedDemoData({ reset = false } = {}) {
  if (reset) {
    await Promise.all([Reservation.deleteMany({}), Listing.deleteMany({}), User.deleteMany({}),
      // >>> FRIDGE FEATURE: ADD these three clears inside the Promise.all (start)
      Fridge.deleteMany({}), FridgeUpdate.deleteMany({}), SpoiledReport.deleteMany({}),
      // <<< FRIDGE FEATURE (end)
      // >>> REVIEWS FEATURE: ADD this line inside the Promise.all (start)
      Review.deleteMany({}), RecipientRating.deleteMany({}), Appeal.deleteMany({}),
      // <<< REVIEWS FEATURE (end)
    ]);
  } else if ((await User.countDocuments()) > 0) {
    console.log('Database already has users, skipping seed (use `npm run seed:reset` to start over).');
    return;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await User.insertMany(DEMO_USERS.map((u) => ({ ...u, passwordHash })));
  const listings = await Listing.insertMany(demoListings(Date.now()));
  const past = listings.find((l) => l.itemName === 'Kaya toast sets');
  // The ten collected units on the historical listing are in history; missed and cancelled units went back to it.
  const missed = (n) => ({ recipient: id(8), recipientName: 'Sam Lee', recipientRole: 'individual', quantity: 1, status: 'missed', releasedBy: 'system', missedAt: new Date(Date.now() - (60 - n) * MIN) });
  const history = await Reservation.insertMany([
    { recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 6, status: 'collected', collectedAt: new Date(Date.now() - 90 * MIN) },
    { recipient: id(5), recipientName: 'Alex Tan', recipientRole: 'individual', quantity: 3, status: 'collected', collectedAt: new Date(Date.now() - 85 * MIN) },
    { recipient: id(8), recipientName: 'Sam Lee', recipientRole: 'individual', quantity: 1, status: 'collected', collectedAt: new Date(Date.now() - 80 * MIN) },
    missed(0), missed(1), missed(2),
    { recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 1, status: 'cancelled', cancelledAt: new Date(Date.now() - 100 * MIN) },
    // >>> REVIEWS FEATURE: ADD these three collected pickups (start): more history for the Thank-you Wall to show
    { recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 2, status: 'collected', collectedAt: new Date(Date.now() - 75 * MIN) },
    { recipient: id(5), recipientName: 'Alex Tan', recipientRole: 'individual', quantity: 1, status: 'collected', collectedAt: new Date(Date.now() - 70 * MIN) },
    { recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 1, status: 'collected', collectedAt: new Date(Date.now() - 65 * MIN) },
    // <<< REVIEWS FEATURE (end)
  ].map((r) => ({ listing: past._id, bakery: past.bakery, bakeryName: past.bakeryName, itemName: past.itemName,
    address: past.address, pickupStart: past.pickupStart, pickupEnd: past.pickupEnd, createdAt: past.pickupStart,
    slotStart: past.pickupStart, slotEnd: new Date(past.pickupStart.getTime() + 30 * MIN), slotMinutes: 30,
    updatedAt: r.collectedAt ?? r.cancelledAt ?? r.missedAt ?? past.pickupEnd, weightGramsPerUnit: 100, gramsPerMeal: 500, ...r })));
  // An open order for the bakery demo: Hope Kitchen collects 2 sourdough loaves in the next slot with code HKT4X2.
  const sourdough = listings.find((l) => l.itemName === 'Sourdough loaves');
  const slotStart = new Date(sourdough.pickupStart.getTime() + 30 * MIN);
  await Reservation.create({ listing: sourdough._id, bakery: sourdough.bakery, bakeryName: sourdough.bakeryName, itemName: sourdough.itemName,
    address: sourdough.address, pickupStart: sourdough.pickupStart, pickupEnd: sourdough.pickupEnd,
    slotStart, slotEnd: new Date(slotStart.getTime() + 30 * MIN), slotMinutes: 30, code: 'HKT4X2',
    recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 2, weightGramsPerUnit: 100, gramsPerMeal: 500 });
  await Listing.updateOne({ _id: sourdough._id }, { $inc: { quantityRemaining: -2 } });
  // >>> REVIEWS FEATURE: ADD this line (start)
  await seedDemoReviews(history);
  // <<< REVIEWS FEATURE (end)
  console.log(`Seeded ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD}) and 8 demo listings.`);
}

// `npm run seed` / `npm run seed:reset`
if (process.argv[1]?.endsWith('seed.js')) {
  const reset = process.argv.includes('--reset');
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed when NODE_ENV=production.');
    process.exit(1);
  }
  await import('dotenv/config'); // only the CLI reads server/.env; importing this file (e.g. from tests) never does
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in server/.env first. (Without it the app seeds its own in-memory DB on start.)');
    process.exit(1);
  }
  const db = await connectDb();
  await seedDemoData({ reset });
  await db.close();
}
