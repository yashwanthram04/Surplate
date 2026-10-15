import { createRouter, createWebHistory } from 'vue-router';
import { ensureSession, useSession } from './stores/session';

const BAKERY = ['bakery'];

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { title: 'Rescue surplus food', fullWidth: true } },
    { path: '/browse', name: 'browse', component: () => import('./views/BrowseView.vue'), meta: { title: 'Browse surplus food' } },

    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { title: 'Log in', guestOnly: true } },
    { path: '/register', name: 'register', component: () => import('./views/RegisterView.vue'), meta: { title: 'Sign up', guestOnly: true } },
    { path: '/profile', name: 'profile', component: () => import('./views/ProfileView.vue'), meta: { title: 'My account', requiresAuth: true } },
    { path: '/admin/charities', name: 'admin-charities', component: () => import('./views/AdminCharitiesView.vue'), meta: { title: 'Verify charities', roles: ['admin'] } },

    { path: '/listings/new', name: 'listing-new', component: () => import('./views/ListingFormView.vue'), meta: { title: 'Post surplus food', roles: BAKERY } },
    { path: '/listings/:id', name: 'listing', component: () => import('./views/ListingDetailView.vue'), props: true },
    { path: '/listings/:id/edit', name: 'listing-edit', component: () => import('./views/ListingFormView.vue'), props: true, meta: { title: 'Edit listing', roles: BAKERY } },
    // Recipient reservation form. The API independently enforces eligibility.
    { path: '/listings/:id/reserve', name: 'reserve', component: () => import('./views/ReserveView.vue'), props: true, meta: { title: 'Reserve', roles: ['charity', 'individual'] } },
    { path: '/my-listings', name: 'my-listings', component: () => import('./views/MyListingsView.vue'), meta: { title: 'My listings', roles: BAKERY } },

    { path: '/impact', name: 'impact', component: () => import('./views/ImpactView.vue'), meta: { title: 'Our impact', requiresAuth: true } },
    { path: '/reservations', name: 'reservations', component: () => import('./views/ReservationsView.vue'), meta: { title: 'Reservations', roles: ['bakery', 'charity', 'individual'] } },

    { path: '/fridges', name: 'fridges', component: () => import('./views/FridgesView.vue'), meta: { title: 'Community fridges' } },
    { path: '/fridges/new', name: 'fridge-new', component: () => import('./views/FridgeFormView.vue'), meta: { title: 'Add a fridge or pantry', requiresAuth: true } },
    { path: '/fridges/:id', name: 'fridge', component: () => import('./views/FridgeDetailView.vue'), props: true },
    { path: '/fridges/:id/edit', name: 'fridge-edit', component: () => import('./views/FridgeFormView.vue'), props: true, meta: { title: 'Edit fridge', requiresAuth: true } },

    { path: '/spoiled-alerts', name: 'spoiled-alerts', component: () => import('./views/SpoiledAlertsView.vue'), meta: { title: 'Spoiled food alerts', roles: ['bakery', 'admin'] } },

    { path: '/forbidden', name: 'forbidden', component: () => import('./views/ForbiddenView.vue'), meta: { title: 'Not available' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Page not found' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

// Page-level access rules. (The server enforces the same rules on every API call; this just gives
// people a sensible page instead of a broken one.)
router.beforeEach(async (to) => {
  await ensureSession();
  const session = useSession();

  if (to.meta.guestOnly && session.isLoggedIn) return { path: '/' };
  if ((to.meta.requiresAuth || to.meta.roles) && !session.isLoggedIn) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  if (to.meta.roles && !to.meta.roles.includes(session.user.role)) return { name: 'forbidden' };
});

export default router;
