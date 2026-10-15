import mongoose from 'mongoose';

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
  quantity: { type: Number, required: true, min: 1 },
  weightGramsPerUnit: { type: Number, required: true, min: 1 },
  gramsPerMeal: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['reserved', 'collected', 'cancelled', 'expired'], default: 'reserved' },
  collectedAt: Date,
  cancelledAt: Date,
}, { timestamps: true });
schema.index({ recipient: 1, createdAt: -1 });
schema.index({ bakery: 1, createdAt: -1 });
schema.index({ status: 1, collectedAt: -1 });
export default mongoose.model('Reservation', schema);
