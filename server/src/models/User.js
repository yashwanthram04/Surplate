import mongoose from 'mongoose';

// Minimal user model, only what the listing feature needs (owner + display name).
// TODO(Accounts & Impact Dashboard): replace/extend with the real account model
// (password hash, charity verification, reliability score, ...).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['bakery', 'charity', 'individual'], required: true },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
