import mongoose from 'mongoose';

// 'expired' is kept only for records written before slots existed; it is reported as 'missed'.
export const STATUSES = ['reserved', 'collected', 'cancelled', 'missed', 'expired'];

const schema = new mongoose.Schema({
  listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
  bakery: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bakeryName: { type: String, required: true },
  recipientName: { type: String, required: true },
  recipientRole: { type: String, enum: ['charity', 'individual'], required: true },
  itemName: { type: String, required: true },
  address: String,
  pickupStart: { type: Date, required: true },
  pickupEnd: { type: Date, required: true },
  // The chosen collection slot inside the pickup window. Older records have none: their slot is the whole window.
  slotStart: Date,
  slotEnd: Date,
  slotMinutes: Number,
  // Shown to the recipient; bakery staff type it in to confirm the handover. Older records have none.
  code: String,
  quantity: { type: Number, required: true, min: 1 },
  weightGramsPerUnit: { type: Number, required: true, min: 1 },
  gramsPerMeal: { type: Number, required: true, min: 1 },
  status: { type: String, enum: STATUSES, default: 'reserved' },
  collectedAt: Date,
  cancelledAt: Date,
  missedAt: Date,
  // Who marked it missed: the automatic release after the grace period, or bakery staff releasing it early.
  releasedBy: { type: String, enum: ['system', 'bakery'] },
}, { timestamps: true });
schema.index({ recipient: 1, createdAt: -1 });
schema.index({ bakery: 1, createdAt: -1 });
schema.index({ status: 1, collectedAt: -1 });
schema.index({ status: 1, slotEnd: 1 });
schema.index({ bakery: 1, code: 1 }, { unique: true, partialFilterExpression: { status: 'reserved', code: { $exists: true } } });
export default mongoose.model('Reservation', schema);
