import { defineStore } from 'pinia';
import { api } from '../api';

const KEY = 'surplate.demoUserId';
const read = () => {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
};

// STAND-IN for real login (see server/src/middleware/auth.js): the navbar lets you
// "act as" one of the seeded demo accounts. Replace with the Accounts feature's store.
export const useSession = defineStore('session', {
  state: () => ({ users: [], userId: read(), ready: false }),
  getters: {
    user: (s) => s.users.find((u) => u.id === s.userId) ?? null,
    isBakery() {
      return this.user?.role === 'bakery';
    },
  },
  actions: {
    async init() {
      try {
        const { data } = await api.get('/demo/users');
        this.users = data.users;
        // A remembered id can go stale (e.g. database reset): fall back to the first bakery.
        if (!this.user) this.setUser(this.users.find((u) => u.role === 'bakery')?.id ?? '');
      } catch {
        this.users = [];
      } finally {
        this.ready = true;
      }
    },
    setUser(id) {
      this.userId = id;
      try {
        localStorage.setItem(KEY, id);
      } catch {
        /* storage blocked: the choice just won't be remembered */
      }
    },
  },
});
