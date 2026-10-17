import mongoose from 'mongoose';
import { FRIDGE_STATUSES } from './Fridge.js';

// One status update on a fridge: stocked / low / empty, plus an optional note and photo.
const fridgeUpdateSchema = new mongoose.Schema(
  {
    fridge: { type: mongoose.Schema.Types.ObjectId, ref: 'Fridge', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Denormalised so the history still reads correctly if the account is later deleted.
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },

    status: { type: String, enum: FRIDGE_STATUSES, required: true },
    note: { type: String, default: '', trim: true }, // e.g. "Dropped off 12 croissants"
    photo: { data: Buffer, contentType: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

fridgeUpdateSchema.index({ fridge: 1, createdAt: -1 });

export default mongoose.model('FridgeUpdate', fridgeUpdateSchema);
