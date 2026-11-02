// Shared fixtures for the Thank-you Wall / reviews specs.
import { defineComponent, h } from 'vue';

/** A thank-you note as the API returns it (see reviewDTO in server/src/routes/reviews.js). */
export function makeNote(overrides = {}) {
  return {
    id: 'n1',
    bakeryId: 'b1',
    nickname: 'Casey L.',
    note: 'Still warm when I picked it up!',
    itemName: 'Butter croissants',
    foodRating: 5,
    accuracyRating: 4,
    authorRole: 'individual',
    onBehalfOf: null,
    peopleServed: null,
    pinned: false,
    reply: null,
    mine: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** A bakery's reputation summary as GET /api/reviews/bakery/:id returns it. */
export function makeReputation(overrides = {}) {
  return {
    score: 86, tier: 'excellent', thankYouCount: 3, foodAverage: 4.7, accuracyAverage: 4.3, pinned: 1, peopleServed: 40,
    stars: { 5: 2, 4: 1, 3: 0, 2: 0, 1: 0 }, rules: { minReviews: 3, accuracyWeight: 0.6 },
    ...overrides,
  };
}

/**
 * Stand-in for motion-v's <Motion>: renders its content in a plain div and swallows the animation props.
 * (motion-v needs IntersectionObserver and real layout, which jsdom does not have.)
 * Use with: vi.mock('motion-v', async () => (await import('../../__tests__/reviewFixtures')).motionStub)
 */
export const motionStub = {
  Motion: defineComponent({
    name: 'Motion',
    props: ['initial', 'animate', 'whileInView', 'inViewOptions', 'transition'],
    setup: (_, { slots }) => () => h('div', slots.default?.()),
  }),
};
