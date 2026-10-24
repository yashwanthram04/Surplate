import { DIETARY_TAGS } from '../models/Listing.js';
import { toList } from './validate.js';

const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

function parseNeededBy(value) {
    if (typeof value !== 'string' || value === '') {
        return null;
    }

    let date;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        date = new Date(value + 'T23:59:59+08:00');
    } else {
        date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

export function parseNeedInput(body = {}, now = new Date()) {
    const errors = {};
    const value = {};

    value.title = typeof body.title === 'string' ? body.title.trim() : '';
    if (value.title.length < 3 || value.title.length > 100) {
        errors.title = 'Describe what you need in 3–100 characters.';
    }

    value.description = typeof body.description === 'string'
        ? body.description.trim()
        : '';

    if (value.description.length > 500) {
        errors.description = 'Details can be at most 500 characters.';
    }

    const quantity = Number(body.quantityTarget);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) {
        errors.quantityTarget = 'Quantity must be a whole number from 1 to 5000.';
    }

    value.quantityTarget = quantity;

    const neededBy = parseNeededBy(body.neededBy);

    if (neededBy === null) {
        errors.neededBy = 'Choose the date you need it by.';
    } else if (neededBy <= now) {
        errors.neededBy = 'The needed-by date must be in the future.';
    } else if (neededBy.getTime() - now.getTime() > MAX_AHEAD_MS) {
        errors.neededBy = 'The needed-by date can be at most a year away.';
    }

    value.neededBy = neededBy;

    const tags = toList(body.dietaryTags);
    value.dietaryTags = [];

    for (const tag of tags) {
        if (!value.dietaryTags.includes(tag)) {
            value.dietaryTags.push(tag);
        }
    }

    for (const tag of value.dietaryTags) {
        if (!DIETARY_TAGS.includes(tag)) {
            errors.dietaryTags = 'Unknown dietary tag.';
            break;
        }
    }

    return { value, errors };
}

export function parsePledgeInput(body = {}) {
    const errors = {};
    const quantity = Number(body.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5000) {
        errors.quantity = 'Pledge a whole number from 1 to 5000.';
    }

    return {
        value: { quantity },
        errors,
    };
}
