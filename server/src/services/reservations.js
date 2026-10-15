import mongoose from 'mongoose';
import Listing from '../models/Listing.js';
import Reservation from '../models/Reservation.js';

export const transaction = (work) => mongoose.connection.transaction(work);
export const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

// Call inside the same transaction as listing removal or account deletion.
export async function cancelOpen(filter, session) {
  const rows = await Reservation.find({ ...filter, status: 'reserved' }).session(session);
  for (const row of rows) {
    row.status = row.pickupEnd <= new Date() ? 'expired' : 'cancelled';
    row.cancelledAt = new Date();
    await row.save({ session });
    await Listing.updateOne({ _id: row.listing }, { $inc: { quantityRemaining: row.quantity } }, { session });
  }
}
export function reservationDTO(doc) {
  const r = doc.toObject();
  return { id: String(r._id), listingId: String(r.listing), bakeryName: r.bakeryName,
    recipientName: r.recipientName, itemName: r.itemName, address: r.address,
    quantity: r.quantity, pickupStart: r.pickupStart, pickupEnd: r.pickupEnd,
    status: r.status === 'reserved' && r.pickupEnd <= new Date() ? 'expired' : r.status,
    createdAt: r.createdAt, collectedAt: r.collectedAt,
    weightKg: r.quantity * r.weightGramsPerUnit / 1000,
    estimatedMeals: r.quantity * r.weightGramsPerUnit / r.gramsPerMeal };
}
