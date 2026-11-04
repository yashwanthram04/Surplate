import mongoose from 'mongoose';

// Keep these lists in sync with client/src/utils/fridge.js
export const FRIDGE_STATUSES = ['stocked', 'low', 'empty'];
// Statuses that mean food was left inside: these are the ones whose food can go stale.
export const FOOD_STATUSES = ['stocked', 'low'];
// A stocked/low status with no update for this long may mean old food: users are warned and admins are asked to check.
export const FOOD_STALE_MS = 48 * 60 * 60 * 1000;
// An admin's "I'm checking this" shows for this long unless someone posts an update first.
export const CHECK_CLAIM_MS = 24 * 60 * 60 * 1000;

const fridgeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    // Free text ("24 hours", "Mon–Sat 8am–9pm"): community fridges rarely keep neat schedules.
    openingHours: { type: String, required: true, trim: true },

    address: { type: String, required: true, trim: true },
    postal: { type: String, default: '' },
    // GeoJSON, [lng, lat]. Resolved from the address via the OneMap API (same as listings).
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },

    // Optional. Stored in MongoDB so the app works on hosts without a persistent disk.
    photo: { data: Buffer, contentType: String },

    // Anyone logged in can add a fridge. The creator (and any admin) can edit or remove it.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByName: { type: String, required: true },

    // Copy of the newest FridgeUpdate, so the map and list don't need a join.
    // 'unknown' = nobody has posted an update yet.
    latestStatus: { type: String, enum: [...FRIDGE_STATUSES, 'unknown'], default: 'unknown' },
    latestUpdateAt: Date,
    latestNote: { type: String, default: '' },

    // Set when an admin says they are going to check a stale fridge. Only counts if newer than latestUpdateAt.
    checkingBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkingByName: String,
    checkingAt: Date,

    // Soft delete, like listings: the update history and spoiled reports stay in the database.
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: true }
);

fridgeSchema.index({ location: '2dsphere' });
fridgeSchema.index({ status: 1, latestUpdateAt: -1 });

export default mongoose.model('Fridge', fridgeSchema);
