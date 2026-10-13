import mongoose from 'mongoose';

// Keep these lists in sync with client/src/constants.js
export const DIETARY_TAGS = ['vegetarian', 'vegan', 'halal', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free'];
export const ALLERGENS = ['gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'soy', 'sesame', 'fish', 'shellfish'];

const listingSchema = new mongoose.Schema(
  {
    bakery: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Denormalised so browse/search doesn't need a join.
    bakeryName: { type: String, required: true },

    itemName: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // `quantity` is what the bakery put up; `quantityRemaining` is what is still reservable.
    // The Reservations feature should only ever change quantityRemaining, atomically
    // (findOneAndUpdate with { quantityRemaining: { $gte: n } } and $inc).
    quantity: { type: Number, required: true, min: 1 },
    quantityRemaining: { type: Number, required: true, min: 0 },

    dietaryTags: [{ type: String, enum: DIETARY_TAGS }],
    allergens: [{ type: String, enum: ALLERGENS }],

    bestBefore: { type: Date, required: true },
    pickupStart: { type: Date, required: true },
    pickupEnd: { type: Date, required: true },

    address: { type: String, required: true, trim: true },
    postal: { type: String, default: '' },
    // GeoJSON, [lng, lat]. Resolved from the address via the OneMap API.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },

    // Stored in MongoDB so the app works on hosts without a persistent disk.
    photo: { data: Buffer, contentType: String },

    // false (the default): only verified charities see it. true: the bakery shares it with everyone.
    // See utils/visibility.js for who can see what.
    visibleToIndividuals: { type: Boolean, default: false },

    // Listings are never hard-deleted or expired in the DB: the impact dashboard and
    // reservation history need them. "Expired" is derived from pickupEnd at query time.
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    repostedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
  },
  { timestamps: true }
);

listingSchema.index({ location: '2dsphere' });
listingSchema.index({ status: 1, pickupEnd: 1 });

export default mongoose.model('Listing', listingSchema);
