import mongoose from 'mongoose';

// A thank-you note a recipient leaves after collecting food. One per collected reservation.
// The public wall only ever shows the nickname, never the account behind it.
const schema = new mongoose.Schema({
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true, unique: true },
  bakery: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['charity', 'individual'], required: true },
  nickname: { type: String, required: true, trim: true },
  // Snapshot, so the note still reads correctly if the listing is later removed.
  itemName: { type: String, required: true },
  note: { type: String, required: true, trim: true },
  foodRating: { type: Number, required: true, min: 1, max: 5 },
  accuracyRating: { type: Number, required: true, min: 1, max: 5 },
  // Charities only: thanking the bakery on behalf of the people the charity serves.
  onBehalfOf: { type: String, default: '', trim: true },
  peopleServed: { type: Number, min: 1 },
  // Bakery staff can pin a few favourites to the top and reply with a short message.
  pinned: { type: Boolean, default: false },
  pinnedAt: Date,
  reply: { text: { type: String, default: '' }, at: Date },
}, { timestamps: true });
schema.index({ bakery: 1, pinned: -1, createdAt: -1 });
schema.index({ author: 1, createdAt: -1 });

export default mongoose.model('Review', schema);
