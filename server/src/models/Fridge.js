import mongoose from 'mongoose';

// Keep these lists in sync with client/src/utils/fridge.js
export const FRIDGE_STATUSES = ['stocked', 'low', 'empty'];
export const FRIDGE_KINDS = ['fridge', 'pantry'];

const fridgeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: FRIDGE_KINDS, default: 'fridge' },
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

    // Soft delete, like listings: the update history and spoiled reports stay in the database.
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: true }
);

fridgeSchema.index({ location: '2dsphere' });
fridgeSchema.index({ status: 1, latestUpdateAt: -1 });

export default mongoose.model('Fridge', fridgeSchema);
