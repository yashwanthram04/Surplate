// Limits mirror server/src/utils/validateReview.js so mistakes show before submitting; the server stays the authority.
export const LIMITS = { noteMin: 3, noteMax: 200, nicknameMin: 2, nicknameMax: 20, replyMax: 140, commentMax: 140, onBehalfMax: 60, peopleMax: 5000, appealMin: 20, appealMax: 500, appealRetryHours: 24 };

// Index = number of stars. Shown next to the stars so the number means something.
export const FOOD_LABELS = ['', 'Not good', 'Could be better', 'Okay', 'Really good', 'Loved it!'];
export const ACCURACY_LABELS = ['', 'Not as listed', 'Some differences', 'Mostly as listed', 'Just as listed', 'Exactly as listed'];
export const PUNCTUALITY_LABELS = ['', 'Very late, no notice', 'Late', 'A little late', 'On time', 'Early or right on time'];
export const MOODS = ['🤔', '😞', '😕', '🙂', '😊', '🤩'];
// One tap adds a phrase to the note, so a thank-you takes seconds.
export const COMPLIMENTS = ['Still warm 🔥', 'Generous portions', 'Friendly staff', 'So fresh', 'Listing was spot on', 'Easy pickup'];

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

export function reviewErrors(form, { isCharity = false } = {}) {
  const e = {};
  const note = clean(form.note);
  if (note.length < LIMITS.noteMin) e.note = `Write at least ${LIMITS.noteMin} characters: even "Thank you!" counts.`;
  else if (note.length > LIMITS.noteMax) e.note = `Keep it under ${LIMITS.noteMax} characters.`;
  if (!form.foodRating) e.foodRating = 'Rate the food from 1 to 5 stars.';
  if (!form.accuracyRating) e.accuracyRating = 'Rate how accurate the listing was.';
  const nick = clean(form.nickname);
  if (nick && (nick.length < LIMITS.nicknameMin || nick.length > LIMITS.nicknameMax)) e.nickname = `Use ${LIMITS.nicknameMin}–${LIMITS.nicknameMax} characters.`;
  if (isCharity && form.onBehalf) {
    if (clean(form.onBehalfOf).length > LIMITS.onBehalfMax) e.onBehalfOf = `Keep it under ${LIMITS.onBehalfMax} characters.`;
    if (form.peopleServed !== '' && form.peopleServed != null) {
      const n = Number(form.peopleServed);
      if (!Number.isInteger(n) || n < 1 || n > LIMITS.peopleMax) e.peopleServed = `Enter a whole number from 1 to ${LIMITS.peopleMax}.`;
    }
  }
  return e;
}

/** What a bakery's (or recipient's) score is called. */
export const TIERS = {
  new: { label: 'New on Surplate', icon: 'bi-stars' },
  excellent: { label: 'Excellent', icon: 'bi-patch-check-fill' },
  good: { label: 'Good', icon: 'bi-hand-thumbs-up-fill' },
  attention: { label: 'Needs attention', icon: 'bi-exclamation-triangle-fill' },
};

/** "good" | "warn" | "bad" | "new": drives the colour of gauges and bars. */
export const scoreTone = (score) => (score == null ? 'new' : score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad');

/** A stable colour and tilt per note, so the wall looks hand-placed but never jumps on re-render. */
export function noteLook(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { tone: h % 6, tilt: (((h >> 3) % 5) - 2) * 0.7 };
}

/** "just now", "12 min ago", "3 h ago", "2 d ago", else a date. */
export function timeAgo(date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Alex Tan" -> "Alex T."; a charity keeps its name. Mirrors the server's default for a note's nickname. */
export function defaultNickname({ name, role }) {
  const full = clean(name);
  if (role === 'charity') return full.slice(0, LIMITS.nicknameMax);
  const [first, ...rest] = full.split(' ');
  return `${first}${rest.length ? ` ${rest[rest.length - 1][0].toUpperCase()}.` : ''}`.slice(0, LIMITS.nicknameMax);
}

export const initialOf =(name) => (String(name || '?').trim()[0] || '?').toUpperCase();
