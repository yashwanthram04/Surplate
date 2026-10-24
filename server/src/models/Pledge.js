import mongoose from 'mongoose';

// A bakery promising some (or all) of a charity's need.
const pledgeSchema = new mongoose.Schema(
  {
    need: { type: mongoose.Schema.Types.ObjectId, ref: 'Need', required: true, index: true },
    needTitle: { type: String, required: true },
    charity: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    charityName: { type: String, required: true },
    bakery: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bakeryName: { type: String, required: true },

    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pledged', 'withdrawn'], default: 'pledged' },
    withdrawnAt: Date,
    withdrawnBy: { type: String, enum: ['bakery', 'charity'] }, // 'charity' = the charity cancelled the whole need
  },
  { timestamps: true }
);

export default mongoose.model('Pledge', pledgeSchema);