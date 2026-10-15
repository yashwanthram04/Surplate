import mongoose from 'mongoose';

// "This food is spoiled" report. It is routed to the supplier(s) (bakeries) who dropped the food off.
const spoiledReportSchema = new mongoose.Schema(
  {
    fridge: { type: mongoose.Schema.Types.ObjectId, ref: 'Fridge', required: true, index: true },
    fridgeName: { type: String, required: true },
    // Set when the reporter flagged one specific drop-off (an update). Then only that update's bakery is notified.
    update: { type: mongoose.Schema.Types.ObjectId, ref: 'FridgeUpdate' },

    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportedByName: { type: String, required: true },

    items: { type: String, required: true, trim: true }, // what is spoiled
    note: { type: String, default: '', trim: true },
    photo: { data: Buffer, contentType: String },

    // The bakeries who are notified. Empty = nobody to notify; only admins see it.
    suppliers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], index: true },

    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolution: { type: String, default: '' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedByName: String,
    resolvedAt: Date,
  },
  { timestamps: true }
);

spoiledReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('SpoiledReport', spoiledReportSchema);
