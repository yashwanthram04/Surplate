import mongoose from 'mongoose';

// A blocked recipient's request to be allowed to reserve again before their missed pickups age out.
// An admin approves (a temporary waiver on the account) or denies with a reason the recipient sees.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userRole: { type: String, enum: ['charity', 'individual'], required: true },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  // The reliability figures when the appeal was filed, so an admin judges what the user saw.
  snapshot: { score: Number, missed: Number, recent: Number },
  adminNote: { type: String, default: '' },
  decidedAt: Date,
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  waivedUntil: Date,
}, { timestamps: true });
schema.index({ user: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });
// At most one open appeal per person.
schema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

export default mongoose.model('Appeal', schema);
