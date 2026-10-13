// Keep these lists in sync with server/src/models/Listing.js
export const DIETARY_TAGS = ['vegetarian', 'vegan', 'halal', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free'];
export const ALLERGENS = ['gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'soy', 'sesame', 'fish', 'shellfish'];

export const ENDING_SOON_MS = 2 * 60 * 60 * 1000; // matches the server's "ending soon" filter
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const SG_CENTER = [1.3521, 103.8198];

export const ROLE_LABELS = { bakery: 'Bakery / restaurant', charity: 'Charity', individual: 'Individual', admin: 'Admin' };
