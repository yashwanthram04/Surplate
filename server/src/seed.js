import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import Listing from './models/Listing.js';
import User from './models/User.js';
import Reservation from './models/Reservation.js';
import Fridge from './models/Fridge.js';
import FridgeUpdate from './models/FridgeUpdate.js';
import SpoiledReport from './models/SpoiledReport.js';

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
      quantity: 10, quantityRemaining: 0, dietaryTags: ['vegetarian'], allergens: ['gluten', 'eggs', 'dairy'],
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

/** Demo community fridges, a status history for each, and one open spoiled-food report. */
export async function seedDemoFridges() {
  const t = (offsetMin) => new Date(Date.now() + offsetMin * MIN);
  const U = (n) => DEMO_USERS[n - 1]; // 1 Sunrise, 2 Crumb, 4 Hope Kitchen, 5 Alex, 7 Admin
  const site = (address, postal, lat, lng) => ({ address, postal, location: { type: 'Point', coordinates: [lng, lat] } });
  const defs = [
    { key: 'tiong', name: 'Tiong Bahru Community Fridge', kind: 'fridge', openingHours: '24 hours', owner: U(5), photo: ['🧊', '#bae6fd', '#0369a1'],
      description: 'Beside the void deck notice board. Please label home-cooked food with the date and keep the area tidy.', ...site('30 SENG POH ROAD', '168898', 1.2866, 103.8326) },
    { key: 'bugis', name: 'Bugis Neighbourhood Pantry', kind: 'pantry', openingHours: 'Mon–Sat 9am–8pm', owner: U(4), photo: ['🥫', '#fde68a', '#b45309'],
      description: 'Shelves of tinned food, rice and noodles. Take what you need, leave what you can.', ...site('1 BUGIS STREET', '188868', 1.3, 103.8559) },
    { key: 'tampines', name: 'Tampines Hub Fridge', kind: 'fridge', openingHours: 'Daily 8am–10pm', owner: U(5), photo: ['🥗', '#bbf7d0', '#15803d'],
      description: 'Next to the community kitchen on level 1.', ...site('1 TAMPINES WALK OUR TAMPINES HUB', '528523', 1.3541, 103.9406) },
    { key: 'toapayoh', name: 'Toa Payoh Lorong 4 Fridge', kind: 'fridge', openingHours: '24 hours', owner: U(7), photo: ['🍞', '#fed7aa', '#c2410c'],
      description: 'Bakeries nearby drop bread here in the evening.', ...site('77 LORONG 4 TOA PAYOH', '310077', 1.3396, 103.8478) },
    // No updates yet: shows how an unknown status looks.
    { key: 'jurong', name: 'Jurong West Pantry', kind: 'pantry', openingHours: 'Daily 7am–9pm', owner: U(4), photo: ['🍚', '#e9d5ff', '#7e22ce'],
      description: 'Dry goods only. No fridge on site.', ...site('1 JURONG WEST CENTRAL 2', '648886', 1.3404, 103.7068) },
  ];
  const fridges = await Fridge.insertMany(defs.map(({ key, owner, photo, ...rest }) => ({ ...rest, photo: placeholderPhoto(...photo), createdBy: owner._id, createdByName: owner.name })));
  const byKey = Object.fromEntries(defs.map((d, i) => [d.key, fridges[i]]));

  // [fridge, author, status, minutes ago, note]
  const history = [
    ['tiong', U(1), 'stocked', 26 * 60, "Left 8 sourdough loaves from today's bake."],
    ['tiong', U(5), 'low', 4 * 60, 'Only a few items left this afternoon.'],
    ['tiong', U(1), 'stocked', 75, 'Dropped off 12 croissants and a tray of egg tarts.'],
    ['bugis', U(4), 'low', 9 * 60, 'Rice and tinned food running low. Donations welcome.'],
    ['tampines', U(5), 'empty', 30 * 60, 'Completely empty at lunchtime.'],
    ['toapayoh', U(2), 'stocked', 20, 'Dropped off 15 loaves of vegan banana bread.'],
  ];
  const updates = await FridgeUpdate.insertMany(history.map(([key, author, status, ago, note]) => ({
    fridge: byKey[key]._id, author: author._id, authorName: author.name, authorRole: author.role, status, note, createdAt: t(-ago),
  })));
  // Copy each fridge's newest update onto the fridge, the same way the API does.
  for (const fridge of fridges) {
    const newest = updates.filter((u) => u.fridge.equals(fridge._id)).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) await Fridge.updateOne({ _id: fridge._id }, { latestStatus: newest.status, latestUpdateAt: newest.createdAt, latestNote: newest.note }, { timestamps: false });
  }

  // An open report on Sunrise Bakery's older drop-off, so the bakery's alerts page has something to show.
  const flagged = updates[0];
  await SpoiledReport.create({
    fridge: byKey.tiong._id, fridgeName: byKey.tiong.name, update: flagged._id, reportedBy: U(5)._id, reportedByName: U(5).name,
    items: 'Sourdough loaves', note: 'Two of the loaves had gone mouldy.', suppliers: [U(1)._id], createdAt: t(-120),
  });
  console.log(`Seeded ${fridges.length} demo community fridges.`);
}

/** Inserts demo users and listings. With reset it first clears both collections. */
export async function seedDemoData({ reset = false } = {}) {
  if (reset) {
    await Promise.all([Reservation.deleteMany({}), Listing.deleteMany({}), User.deleteMany({}),
          Fridge.deleteMany({}), FridgeUpdate.deleteMany({}), SpoiledReport.deleteMany({}),
        ]);
  } else if ((await User.countDocuments()) > 0) {
    if ((await Fridge.countDocuments()) === 0 && (await User.exists({ _id: id(1) }))) await seedDemoFridges();
    console.log('Database already has users, skipping seed (use `npm run seed:reset` to start over).');
    return;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await User.insertMany(DEMO_USERS.map((u) => ({ ...u, passwordHash })));
  const listings = await Listing.insertMany(demoListings(Date.now()));
  const past = listings.find((l) => l.itemName === 'Kaya toast sets');
  // All ten unavailable units on the historical listing are represented in history.
  await Reservation.insertMany([
    { recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 6, status: 'collected', collectedAt: new Date(Date.now() - 90 * MIN) },
    { recipient: id(5), recipientName: 'Alex Tan', recipientRole: 'individual', quantity: 3, status: 'collected', collectedAt: new Date(Date.now() - 85 * MIN) },
    { recipient: id(5), recipientName: 'Alex Tan', recipientRole: 'individual', quantity: 1, status: 'expired' },
    { recipient: id(4), recipientName: 'Hope Kitchen', recipientRole: 'charity', quantity: 1, status: 'cancelled', cancelledAt: new Date(Date.now() - 100 * MIN) },
  ].map((r) => ({ listing: past._id, bakery: past.bakery, bakeryName: past.bakeryName, itemName: past.itemName,
    address: past.address, pickupStart: past.pickupStart, pickupEnd: past.pickupEnd, createdAt: past.pickupStart,
    updatedAt: r.collectedAt ?? r.cancelledAt ?? past.pickupEnd, weightGramsPerUnit: 100, gramsPerMeal: 500, ...r })));
    await seedDemoFridges();
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
