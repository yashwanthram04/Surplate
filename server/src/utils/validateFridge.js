import mongoose from 'mongoose';
import { FRIDGE_KINDS, FRIDGE_STATUSES } from '../models/Fridge.js';
import { checkPhoto, isInSingapore } from './validate.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Validates the editable fridge fields (create and edit both send the full set). Returns { value, errors }. */
export function parseFridgeInput(body = {}) {
  const errors = {};
  const value = {};

  value.name = text(body.name);
  if (value.name.length < 2 || value.name.length > 80) errors.name = 'Name must be 2–80 characters.';

  value.kind = text(body.kind) || 'fridge';
  if (!FRIDGE_KINDS.includes(value.kind)) errors.kind = 'Choose fridge or pantry.';

  value.description = text(body.description);
  if (value.description.length > 500) errors.description = 'Description can be at most 500 characters.';

  value.openingHours = text(body.openingHours);
  if (value.openingHours.length < 2 || value.openingHours.length > 200) {
    errors.openingHours = 'Enter the opening hours, e.g. "24 hours" or "Mon–Sat 8am–9pm".';
  }

  value.address = text(body.address);
  if (!value.address || value.address.length > 200) errors.address = 'Choose an address from the search results.';
  value.postal = text(body.postal).slice(0, 10);

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!isInSingapore(lat, lng)) errors.address = errors.address || 'Choose an address from the search results.';
  value.location = { type: 'Point', coordinates: [lng, lat] };

  return { value, errors };
}

/** Validates a status update: stocked / low / empty plus an optional note. */
export function parseUpdateInput(body = {}) {
  const errors = {};
  const status = text(body.status);
  if (!FRIDGE_STATUSES.includes(status)) errors.status = 'Choose stocked, low or empty.';
  const note = text(body.note);
  if (note.length > 300) errors.note = 'Note can be at most 300 characters.';
  return { value: { status, note }, errors };
}

/** Validates a spoiled-food report. `updateId` optionally points at the drop-off being flagged. */
export function parseSpoiledInput(body = {}) {
  const errors = {};
  const items = text(body.items);
  if (items.length < 2 || items.length > 200) errors.items = 'Say what is spoiled (2–200 characters).';
  const note = text(body.note);
  if (note.length > 300) errors.note = 'Note can be at most 300 characters.';
  const updateId = text(body.updateId);
  if (updateId && !mongoose.isValidObjectId(updateId)) errors.updateId = 'That update was not found for this fridge.';
  return { value: { items, note, updateId }, errors };
}

/** Photos are optional on fridges, updates and reports. No file is fine; a bad file is an error. */
export function optionalPhoto(file) {
  if (!file) return { photo: null };
  return checkPhoto(file);
}
