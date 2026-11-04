// Adds extra demo food listings for the existing demo bakeries. Purely additive: nothing is deleted or modified.
// Safe to re-run: a listing is skipped if the same bakery already has a live (not yet ended) one with that name.
//   npm run seed:listings
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import Listing from './models/Listing.js';
import User from './models/User.js';

const MIN = 60 * 1000;

function placeholderPhoto(emoji, from, to) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="170" text-anchor="middle">${emoji}</text></svg>`;
  return { data: Buffer.from(svg), contentType: 'image/svg+xml' };
}

// startIn / endIn are minutes from now; bestBeforeHours is hours from now.
const EXTRA = {
  'Sunrise Bakery': [
    { itemName: 'Pain au chocolat', description: 'Flaky pastry with dark chocolate batons.', quantity: 14, slotMinutes: 30,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs', 'soy'], startIn: 30, endIn: 210, bestBeforeHours: 10, photo: ['🥐', '#fde68a', '#b45309'], visibleToIndividuals: true },
    { itemName: 'Wholemeal baguettes', description: 'Baked this morning, uncut.', quantity: 8, slotMinutes: 60,
      dietaryTags: ['vegan', 'vegetarian'], allergens: ['gluten'], startIn: 60, endIn: 300, bestBeforeHours: 20, photo: ['🥖', '#fed7aa', '#9a3412'], visibleToIndividuals: false },
    { itemName: 'Cinnamon rolls', description: 'Iced cinnamon rolls, packed in boxes of 3.', quantity: 18, slotMinutes: 15,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs'], startIn: 20, endIn: 140, bestBeforeHours: 12, photo: ['🍥', '#fbcfe8', '#9d174d'], visibleToIndividuals: true },
    { itemName: 'Multigrain sandwich loaf', description: 'Pre-sliced, wrapped.', quantity: 10, slotMinutes: 30,
      dietaryTags: ['vegetarian', 'dairy-free'], allergens: ['gluten', 'sesame'], startIn: 90, endIn: 330, bestBeforeHours: 36, photo: ['🍞', '#e7e5e4', '#78716c'], visibleToIndividuals: false },
  ],
  'Crumb & Co': [
    { itemName: 'Blueberry scones', description: 'Plain and blueberry scones, mixed boxes.', quantity: 16, slotMinutes: 30,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs'], startIn: 40, endIn: 220, bestBeforeHours: 14, photo: ['🫐', '#c7d2fe', '#4338ca'], visibleToIndividuals: true },
    { itemName: 'Oat cookies', description: 'Oat and raisin cookies, 6 per pack.', quantity: 24, slotMinutes: 15,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'eggs', 'dairy'], startIn: 15, endIn: 135, bestBeforeHours: 72, photo: ['🍪', '#fde68a', '#92400e'], visibleToIndividuals: true },
    { itemName: 'Lemon drizzle cake slices', description: 'Individually wrapped slices.', quantity: 20, slotMinutes: 30,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs'], startIn: 120, endIn: 300, bestBeforeHours: 30, photo: ['🍋', '#fef9c3', '#ca8a04'], visibleToIndividuals: false },
    { itemName: 'Gluten-free brownies', description: 'Fudgy brownies made without wheat flour.', quantity: 12, slotMinutes: 60,
      dietaryTags: ['vegetarian', 'gluten-free'], allergens: ['dairy', 'eggs', 'nuts'], startIn: 60, endIn: 360, bestBeforeHours: 48, photo: ['🍫', '#d6d3d1', '#44403c'], visibleToIndividuals: true },
  ],
  'Golden Loaf Bakery': [
    { itemName: 'Pineapple tarts', description: 'Traditional open-face pineapple tarts.', quantity: 30, slotMinutes: 30,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'dairy', 'eggs'], startIn: 30, endIn: 240, bestBeforeHours: 96, photo: ['🍍', '#fef08a', '#ca8a04'], visibleToIndividuals: true },
    { itemName: 'Pandan chiffon cake', description: 'Whole cakes, 7-inch.', quantity: 5, slotMinutes: 60,
      dietaryTags: ['vegetarian'], allergens: ['gluten', 'eggs'], startIn: 90, endIn: 270, bestBeforeHours: 24, photo: ['🍰', '#bbf7d0', '#15803d'], visibleToIndividuals: false },
    { itemName: 'Chicken floss buns', description: 'Soft buns with chicken floss and mayo.', quantity: 14, slotMinutes: 15,
      dietaryTags: [], allergens: ['gluten', 'eggs', 'dairy', 'sesame'], startIn: 20, endIn: 110, bestBeforeHours: 8, photo: ['🍔', '#fed7aa', '#c2410c'], visibleToIndividuals: false },
    { itemName: 'Halal tuna puffs', description: 'Baked puff pastry with tuna and onion filling.', quantity: 22, slotMinutes: 30,
      dietaryTags: ['halal'], allergens: ['gluten', 'fish', 'dairy', 'eggs'], startIn: 45, endIn: 195, bestBeforeHours: 10, photo: ['🥟', '#fde68a', '#b45309'], visibleToIndividuals: true },
  ],
};

export async function seedExtraListings(now = Date.now()) {
  const bakeries = await User.find({ role: 'bakery', name: { $in: Object.keys(EXTRA) } });
  const created = [];
  for (const bakery of bakeries) {
    for (const item of EXTRA[bakery.name]) {
      const { startIn, endIn, bestBeforeHours, photo, ...fields } = item;
      const live = await Listing.exists({ bakery: bakery._id, itemName: item.itemName, status: 'active', pickupEnd: { $gt: new Date(now) } });
      if (live) continue;
      created.push(await Listing.create({
        ...fields,
        weightGramsPerUnit: 100,
        quantityRemaining: item.quantity,
        bakery: bakery._id,
        bakeryName: bakery.name,
        address: bakery.address,
        postal: bakery.postal ?? '',
        location: { type: 'Point', coordinates: [bakery.lng, bakery.lat] },
        pickupStart: new Date(now + startIn * MIN),
        pickupEnd: new Date(now + endIn * MIN),
        bestBefore: new Date(now + bestBeforeHours * 60 * MIN),
        photo: placeholderPhoto(...photo),
      }));
    }
  }
  const missing = Object.keys(EXTRA).filter((n) => !bakeries.some((b) => b.name === n));
  if (missing.length) console.warn(`Bakery accounts not found, skipped: ${missing.join(', ')}`);
  console.log(`Added ${created.length} listings (existing data untouched).`);
  return created;
}

if (process.argv[1]?.endsWith('seed-listings.js')) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo listings in production.');
    process.exit(1);
  }
  await import('dotenv/config');
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set (see server/.env.example).');
    process.exit(1);
  }
  await connectDb();
  await seedExtraListings();
  await mongoose.disconnect();
}
