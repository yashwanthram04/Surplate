import { SELF_SERVICE_ROLES } from '../models/User.js';
import { isInSingapore } from './validate.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d][\d\s-]{5,19}$/;
const REG_NO = /^[A-Za-z0-9-]{5,20}$/;

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be at most 72 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain at least one letter and one number.';
  return '';
}

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Validates the fields shared by registration and profile editing.
 * `role` decides which fields matter (charities need a registration number, bakeries may give an address).
 */
export function parseAccountFields(body = {}, role) {
  const errors = {};
  const value = {};

  value.name = text(body.name, 80);
  const label = role === 'bakery' ? 'Business name' : role === 'charity' ? 'Organisation name' : 'Name';
  if (value.name.length < 2) errors.name = `${label} must be at least 2 characters.`;

  value.phone = text(body.phone, 20);
  if (value.phone && !PHONE.test(value.phone)) errors.phone = 'Enter a valid phone number, or leave it blank.';

  if (role === 'charity') {
    value.registrationNo = text(body.registrationNo, 20);
    if (!REG_NO.test(value.registrationNo)) errors.registrationNo = 'Enter your charity or UEN registration number (5–20 letters, numbers or dashes).';
  }

  if (role === 'bakery') {
    value.address = text(body.address);
    value.postal = text(body.postal, 10);
    if (value.address) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!isInSingapore(lat, lng)) errors.address = 'Choose your address from the search results.';
      else Object.assign(value, { lat, lng });
    } else {
      Object.assign(value, { postal: '', lat: undefined, lng: undefined });
    }
  }
  return { value, errors };
}

export function parseRegistration(body = {}) {
  const role = body.role;
  if (!SELF_SERVICE_ROLES.includes(role)) return { value: {}, errors: { role: 'Choose what kind of account you need.' } };

  const { value, errors } = parseAccountFields(body, role);
  value.role = role;

  value.email = text(body.email, 120).toLowerCase();
  if (!EMAIL.test(value.email)) errors.email = 'Enter a valid email address.';

  const pw = passwordProblem(body.password);
  if (pw) errors.password = pw;
  return { value, errors };
}
