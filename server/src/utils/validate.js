import { ALLERGENS, DIETARY_TAGS } from '../models/Listing.js';

const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
// Rough bounding box of Singapore; rejects coordinates that clearly aren't from OneMap.
const SG = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.1 };
export const isInSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= SG.minLat && lat <= SG.maxLat && lng >= SG.minLng && lng <= SG.maxLng;

export const toList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []).filter((x) => typeof x === 'string').map((x) => x.trim());

function parseDate(v) {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Validates and normalises the editable listing fields. Used by create and edit
 * (both send the full set of fields). Returns { value, errors }; errors is a
 * { field: message } map, empty when valid.
 */
export function parseListingInput(body = {}, now = new Date()) {
  const errors = {};
  const value = {};

  const itemName = typeof body.itemName === 'string' ? body.itemName.trim() : '';
  if (itemName.length < 2 || itemName.length > 80) errors.itemName = 'Item name must be 2–80 characters.';
  value.itemName = itemName;

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > 500) errors.description = 'Description can be at most 500 characters.';
  value.description = description;

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) errors.quantity = 'Quantity must be a whole number from 1 to 500.';
  value.quantity = quantity;
  if (body.weightGramsPerUnit !== undefined) {
    const weight = Number(body.weightGramsPerUnit);
    if (!Number.isInteger(weight) || weight < 1 || weight > 100000) errors.weightGramsPerUnit = 'Enter a whole weight from 1 to 100000 grams per unit.';
    value.weightGramsPerUnit = weight;
  }

  value.dietaryTags = [...new Set(toList(body.dietaryTags))];
  if (value.dietaryTags.some((t) => !DIETARY_TAGS.includes(t))) errors.dietaryTags = 'Unknown dietary tag.';
  value.allergens = [...new Set(toList(body.allergens))];
  if (value.allergens.some((a) => !ALLERGENS.includes(a))) errors.allergens = 'Unknown allergen.';

  const pickupStart = parseDate(body.pickupStart);
  const pickupEnd = parseDate(body.pickupEnd);
  const bestBefore = parseDate(body.bestBefore);
  if (!pickupStart) errors.pickupStart = 'Pickup start time is required.';
  if (!pickupEnd) errors.pickupEnd = 'Pickup end time is required.';
  if (!bestBefore) errors.bestBefore = 'Best-before time is required.';
  if (pickupStart && pickupEnd) {
    if (pickupEnd <= pickupStart) errors.pickupEnd = 'Pickup must end after it starts.';
    else if (pickupEnd <= now) errors.pickupEnd = 'Pickup window must end in the future.';
    else if (pickupEnd - pickupStart > MAX_WINDOW_MS) errors.pickupEnd = 'Pickup window can be at most 24 hours.';
  }
  if (pickupEnd && bestBefore && bestBefore < pickupEnd) {
    errors.bestBefore = 'Best-before must not be earlier than the end of the pickup window.';
  }
  Object.assign(value, { pickupStart, pickupEnd, bestBefore });

  // multipart forms send "true"/"false"; JSON sends a boolean
  value.visibleToIndividuals = body.visibleToIndividuals === true || body.visibleToIndividuals === 'true';

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!address || address.length > 200) errors.address = 'Choose a pickup address from the search results.';
  value.address = address;
  value.postal = typeof body.postal === 'string' ? body.postal.trim().slice(0, 10) : '';

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isInSingapore(lat, lng)) {
    errors.address = errors.address || 'Choose a pickup address from the search results.';
  }
  value.location = { type: 'Point', coordinates: [lng, lat] };

  return { value, errors };
}

/** Validates an uploaded file by its magic bytes (not the client-supplied mimetype). */
export function checkPhoto(file) {
  if (!file) return { error: 'A photo is required.' };
  if (file.size > MAX_PHOTO_BYTES) return { error: 'Photo must be 2 MB or smaller.' };
  const b = file.buffer;
  let contentType = null;
  if (b.length > 12) {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) contentType = 'image/png';
    else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) contentType = 'image/jpeg';
    else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') contentType = 'image/webp';
  }
  if (!contentType) return { error: 'Photo must be a JPEG, PNG or WebP image.' };
  return { photo: { data: b, contentType } };
}

export { MAX_PHOTO_BYTES };
