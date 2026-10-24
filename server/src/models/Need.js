import mongoose from 'mongoose';
import { DIETARY_TAGS } from './Listing.js';

export const NEED_STATUSES = ['open', 'fulfilled', 'cancelled'];

// One thing a charity needs, e.g. "60 bread items for Saturday breakfast".
const needSchema = new mongoose.Schema(
  {
    charity: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Copied here so the public board doesn't need to look up the charity.
    charityName: { type: String, required: true },

    title: { type: String, required: true, trim: true }, // what is needed
    description: { type: String, default: '', trim: true },

    quantityTarget: { type: Number, required: true, min: 1 },
    // Total of all active pledges. Only ever changed with $inc so two bakeries pledging at once stay correct.
    quantityPledged: { type: Number, default: 0, min: 0 },

    neededBy: { type: Date, required: true },
    dietaryTags: [{ type: String, enum: DIETARY_TAGS }],

    status: { type: String, enum: NEED_STATUSES, default: 'open' },
    fulfilledAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);

needSchema.index({ status: 1, neededBy: 1 });

export default mongoose.model('Need', needSchema);