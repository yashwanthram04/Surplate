import { createRouter, createWebHistory } from 'vue-router';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'browse', component: () => import('./views/BrowseView.vue'), meta: { title: 'Browse surplus food' } },
    { path: '/listings/new', name: 'listing-new', component: () => import('./views/ListingFormView.vue'), meta: { title: 'Post surplus food' } },
    { path: '/listings/:id', name: 'listing', component: () => import('./views/ListingDetailView.vue'), props: true },
    { path: '/listings/:id/edit', name: 'listing-edit', component: () => import('./views/ListingFormView.vue'), props: true, meta: { title: 'Edit listing' } },
    // Placeholder for the Reservations feature: the detail page's "Reserve" button lands here.
    { path: '/listings/:id/reserve', name: 'reserve', component: () => import('./views/ReservePlaceholderView.vue'), props: true, meta: { title: 'Reserve' } },
    { path: '/my-listings', name: 'my-listings', component: () => import('./views/MyListingsView.vue'), meta: { title: 'My listings' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { title: 'Page not found' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
