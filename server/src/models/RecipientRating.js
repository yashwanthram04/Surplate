import mongoose from 'mongoose';

// How a bakery rates a recipient after a collection. One per collected reservation.
// Punctuality feeds the recipient's reliability score (see services/reputation.js).
const schema = new mongoose.Schema({
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true, unique: true },
  bakery: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bakeryName: { type: String, required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientName: { type: String, required: true },
  punctuality: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', trim: true },
}, { timestamps: true });
schema.index({ recipient: 1, createdAt: -1 });
schema.index({ bakery: 1, createdAt: -1 });

export default mongoose.model('RecipientRating', schema);
