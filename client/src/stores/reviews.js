import { defineStore } from 'pinia';
import { api } from '../api';
import { useSession } from './session';

// Pickups the signed-in recipient has collected but not thanked the bakery for yet, and the thank-you
// form that any page can open (the banner, My reservations, a bakery's wall).
export const useReviews = defineStore('reviews', {
  state: () => ({ pending: [], count: 0, current: null, lastPosted: null }),
  getters: {
    isPending: (s) => (reservationId) => s.pending.some((p) => p.reservationId === reservationId),
  },
  actions: {
    async refresh() {
      const session = useSession();
      if (!session.user || !['charity', 'individual'].includes(session.user.role)) {
        this.pending = [];
        this.count = 0;
        return;
      }
      try {
        const { data } = await api.get('/reviews/pending');
        this.pending = data.items;
        this.count = data.count;
      } catch {
        /* the prompt is a nicety: the next refresh tries again */
      }
    },
    open(pickup) {
      this.current = pickup;
    },
    close() {
      this.current = null;
    },
    async posted(review) {
      this.lastPosted = review;
      await this.refresh();
    },
  },
});
