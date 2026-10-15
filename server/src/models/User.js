import mongoose from 'mongoose';

export const ROLES = ['bakery', 'charity', 'individual', 'admin'];
export const SELF_SERVICE_ROLES = ['bakery', 'charity', 'individual']; // what people can register as; admins are seeded

const userSchema = new mongoose.Schema(
  {
    // Display name: the business name for a bakery, the organisation for a charity, the person's name otherwise.
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // never returned unless asked for explicitly
    role: { type: String, enum: ROLES, required: true },
    reservationVersion: { type: Number, default: 0 },
    phone: { type: String, default: '' },

    // Charities only: the registration number the admin checks before approving.
    registrationNo: { type: String, default: '' },
    // Individuals and bakeries need no verification ('not_required'); charities start 'pending'.
    verification: {
      status: { type: String, enum: ['not_required', 'pending', 'approved', 'rejected'], default: 'not_required' },
      note: { type: String, default: '' },
      reviewedAt: Date,
    },

    // Bakeries: default pickup address, used to pre-fill the listing form.
    address: { type: String, default: '' },
    postal: { type: String, default: '' },
    lat: Number,
    lng: Number,
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
