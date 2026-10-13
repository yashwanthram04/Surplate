import { defineStore } from 'pinia';
import { api } from '../api';

// Who is logged in. The login itself is an httpOnly cookie set by the server, so this store only
// mirrors the account details the UI needs (name, role, charity verification status).
export const useSession = defineStore('session', {
  state: () => ({ user: null, ready: false }),
  getters: {
    isLoggedIn: (s) => !!s.user,
    isBakery: (s) => s.user?.role === 'bakery',
    isCharity: (s) => s.user?.role === 'charity',
    isAdmin: (s) => s.user?.role === 'admin',
    // Verified charities and admins see every listing; everyone else only sees what bakeries share with individuals.
    hasFullAccess() {
      return this.isAdmin || this.isVerifiedCharity;
    },
    // A charity only gets charity access once an admin has approved it; until then it is treated like an individual.
    isVerifiedCharity: (s) => s.user?.role === 'charity' && s.user.verification.status === 'approved',
  },
  actions: {
    async init() {
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.user;
      } catch {
        this.user = null;
      } finally {
        this.ready = true;
      }
    },
    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password });
      this.user = data.user;
      return data.user;
    },
    async register(payload) {
      const { data } = await api.post('/auth/register', payload);
      this.user = data.user;
      return data.user;
    },
    async logout() {
      try {
        await api.post('/auth/logout');
      } finally {
        this.user = null;
      }
    },
  },
});

// The router waits on this before deciding whether a page is allowed, so a refresh on a
// members-only page doesn't bounce a logged-in user to the login screen.
let initPromise = null;
export function ensureSession() {
  initPromise ??= useSession().init();
  return initPromise;
}

/** Where to send someone right after logging in or signing up. */
export function homeFor(user) {
  if (user.role === 'bakery') return '/my-listings';
  if (user.role === 'admin') return '/admin/charities';
  if (user.role === 'charity') return '/profile';
  return '/browse';
}
