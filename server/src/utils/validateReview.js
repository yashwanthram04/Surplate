// Limits are repeated in client/src/utils/reviews.js so mistakes show before submitting; the server stays the authority.
export const LIMITS = { noteMin: 3, noteMax: 200, nicknameMin: 2, nicknameMax: 20, replyMax: 140, commentMax: 140, onBehalfMax: 60, peopleMax: 5000 };

const text = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const stars = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

/** "Alex Tan" -> "Alex T."; a charity keeps its name. */
export function defaultNickname(user) {
  const name = text(user.name);
  if (user.role === 'charity') return name.slice(0, LIMITS.nicknameMax);
  const [first, ...rest] = name.split(' ');
  const initial = rest.length ? ` ${rest[rest.length - 1][0].toUpperCase()}.` : '';
  return `${first}${initial}`.slice(0, LIMITS.nicknameMax);
}

export function parseReviewInput(body, user) {
  const errors = {};
  const note = text(body?.note);
  if (note.length < LIMITS.noteMin) errors.note = `Write at least ${LIMITS.noteMin} characters: even "Thank you!" counts.`;
  else if (note.length > LIMITS.noteMax) errors.note = `Keep it under ${LIMITS.noteMax} characters.`;
  if (!stars(body?.foodRating)) errors.foodRating = 'Rate the food from 1 to 5 stars.';
  if (!stars(body?.accuracyRating)) errors.accuracyRating = 'Rate how accurate the listing was from 1 to 5 stars.';

  let nickname = text(body?.nickname);
  if (!nickname) nickname = defaultNickname(user);
  else if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) {
    errors.nickname = `Use ${LIMITS.nicknameMin}–${LIMITS.nicknameMax} characters.`;
  }

  const onBehalfOf = text(body?.onBehalfOf);
  const hasPeople = body?.peopleServed !== undefined && body?.peopleServed !== null && body?.peopleServed !== '';
  let peopleServed;
  if (onBehalfOf || hasPeople) {
    if (user.role !== 'charity') errors.onBehalfOf = 'Only charities can thank a bakery on behalf of the people they serve.';
    else {
      if (onBehalfOf.length > LIMITS.onBehalfMax) errors.onBehalfOf = `Keep it under ${LIMITS.onBehalfMax} characters.`;
      if (hasPeople) {
        peopleServed = Number(body.peopleServed);
        if (!Number.isInteger(peopleServed) || peopleServed < 1 || peopleServed > LIMITS.peopleMax) errors.peopleServed = `Enter a whole number from 1 to ${LIMITS.peopleMax}.`;
      }
    }
  }
  return {
    value: { note, foodRating: body?.foodRating, accuracyRating: body?.accuracyRating, nickname, onBehalfOf, peopleServed },
    errors,
  };
}

export function parseReplyBody(body) {
  const reply = text(body?.text);
  if (reply.length > LIMITS.replyMax) return { errors: { text: `Keep replies under ${LIMITS.replyMax} characters.` } };
  return { value: reply, errors: {} };
}

export function parseRatingInput(body) {
  const errors = {};
  if (!stars(body?.punctuality)) errors.punctuality = 'Rate punctuality from 1 to 5 stars.';
  const comment = text(body?.comment);
  if (comment.length > LIMITS.commentMax) errors.comment = `Keep it under ${LIMITS.commentMax} characters.`;
  return { value: { punctuality: body?.punctuality, comment }, errors };
}

export function parseAppealInput(body) {
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const errors = {};
  if (reason.length < 20) errors.reason = 'Tell us what happened in at least 20 characters.';
  else if (reason.length > 500) errors.reason = 'Keep it under 500 characters.';
  return { value: { reason }, errors };
}
