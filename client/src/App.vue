<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { api } from './api';
import { ROLE_LABELS } from './constants';
import { useSession } from './stores/session';
import SlotReminders from './components/SlotReminders.vue';
import FridgeBackdrop from './components/FridgeBackdrop.vue';
import ReviewPrompt from './components/ReviewPrompt.vue'; // REVIEWS FEATURE

const session = useSession();
const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);
const menuToggle = ref(null);

function closeMenu() {
  menuOpen.value = false;
  menuToggle.value?.focus();
}

// Keep the tab title in step with the page; the detail view sets its own.
watch(
  () => route.meta.title,
  (t) => {
    if (t) document.title = `${t} – Surplate`;
  },
  { immediate: true }
);
watch(() => route.fullPath, () => (menuOpen.value = false));

const alertCount = ref(0);
async function refreshAlertCount() {
  if (!session.isBakery && !session.isAdmin) {
    alertCount.value = 0;
    return;
  }
  try {
    alertCount.value = (await api.get('/fridges/alerts/count')).data.open;
  } catch {
    /* the badge is a nicety: ignore failures */
  }
}
watch(() => [session.user?.id, route.fullPath], refreshAlertCount, { immediate: true });

// >>> REVIEWS FEATURE: ADD this block (start): badge on the admin's "Appeals" link
const appealCount = ref(0);
async function refreshAppealCount() {
  if (!session.isAdmin) {
    appealCount.value = 0;
    return;
  }
  try {
    appealCount.value = (await api.get('/appeals', { params: { status: 'pending' } })).data.counts.pending;
  } catch {
    /* the badge is a nicety: ignore failures */
  }
}
watch(() => [session.user?.id, route.fullPath], refreshAppealCount, { immediate: true });
// <<< REVIEWS FEATURE (end)

// Red badge on "Charity Needs Board": counts charity requests posted since the bakery last looked
const newNeedCount = ref(0);
let seenNeedIds = null;

async function refreshNeedCount() {
  if (!session.isBakery) {
    newNeedCount.value = 0;
    return;
  }
  try {
    const { data } = await api.get('/needs');
    const ids = (data.items ?? data.needs ?? []).map((need) => need.id ?? need._id);

    if (seenNeedIds && route.path !== '/needs') {
      newNeedCount.value += ids.filter((id) => !seenNeedIds.includes(id)).length;
    }
    seenNeedIds = ids;
  } catch {
  }
}

// New login or logout: start counting from scratch
watch(() => session.user?.id, () => {
  seenNeedIds = null;
  newNeedCount.value = 0;
  refreshNeedCount();
}, { immediate: true });

// Opening the board clears the badge
watch(() => route.path, (path) => {
  if (path === '/needs') newNeedCount.value = 0;
}, { immediate: true });

const needTimer = setInterval(refreshNeedCount, 30 * 1000);
onBeforeUnmount(() => clearInterval(needTimer));

const browseLinks = [
  { to: '/browse', label: 'Browse food', icon: 'bi-basket2' },
  { to: '/fridges', label: 'Community fridges', icon: 'bi-snow' },
];
const impactLink = { to: '/impact', label: 'Impact dashboard', icon: 'bi-bar-chart' };
const needsLink = computed(() => ({ to: '/needs', label: 'Charity Needs Board', icon: 'bi-heart', count: newNeedCount.value, badgeId: 'need-count' }));
const alertsLink = computed(() => ({ to: '/spoiled-alerts', label: 'Spoiled alerts', icon: 'bi-shield-exclamation', count: alertCount.value, testId: 'nav-alerts', badgeId: 'alert-count' }));
const primaryLinks = computed(() => {
  if (session.isBakery) return [
    { to: '/my-listings', label: 'My listings', icon: 'bi-grid' },
    { to: '/orders', label: 'Orders', icon: 'bi-bag-check' },
    impactLink,
  ];
  if (session.isAdmin) return [
    { to: '/admin/charities', label: 'Verify charities', icon: 'bi-patch-check' },
    { to: '/admin/appeals', label: 'Appeals', icon: 'bi-chat-square-text', count: appealCount.value, testId: 'nav-appeals', badgeId: 'appeal-count' },
    impactLink,
  ];
  return [
    ...browseLinks,
    ...(session.isVerifiedCharity ? [needsLink.value] : []),
    ...(session.isLoggedIn ? [{ to: '/reservations', label: 'My reservations', icon: 'bi-bag-check' }, impactLink] : []),
  ];
});
const communityLinks = computed(() => {
  if (session.isBakery) return [...browseLinks, needsLink.value,
    { to: `/bakeries/${session.user.id}`, label: 'Thank-you wall', icon: 'bi-chat-heart', testId: 'nav-wall' }, alertsLink.value];
  if (session.isAdmin) return [...browseLinks, alertsLink.value];
  return [];
});

async function logout() {
  await session.logout();
  router.push('/');
}
</script>

<template>
  <a class="visually-hidden-focusable position-absolute p-2 bg-white" href="#main">Skip to content</a>

  <nav class="navbar navbar-surplate workspace-navbar sticky-top" :class="[session.isLoggedIn ? 'navbar-expand-xl' : 'navbar-expand-lg', { 'workspace-single-row': !communityLinks.length }]" @keydown.esc="closeMenu">
    <div class="container-fluid px-3 px-lg-4">
      <RouterLink class="navbar-brand brand-mark fs-4" to="/"><i class="bi bi-basket2-fill me-1" aria-hidden="true"></i>Surplate</RouterLink>
      <button
        ref="menuToggle"
        class="navbar-toggler"
        type="button"
        aria-controls="main-nav"
        :aria-expanded="menuOpen"
        aria-label="Toggle navigation"
        @click="menuOpen = !menuOpen"
      >
        <span class="workspace-menu-label">Menu</span><span class="navbar-toggler-icon"></span>
      </button>

      <div id="main-nav" class="navbar-collapse collapse" :class="{ show: menuOpen }" @click="menuOpen = false">
        <div class="workspace-primary">
          <ul class="navbar-nav workspace-primary-links" :aria-label="session.isBakery ? 'Bakery workspace' : session.isAdmin ? 'Administration' : 'Main links'">
            <li v-for="link in primaryLinks" :key="link.to" class="nav-item">
              <RouterLink class="nav-link" :to="link.to" :data-testid="link.testId"><i class="bi" :class="link.icon" aria-hidden="true"></i>{{ link.label }}<span v-if="link.count" class="badge text-bg-danger" :data-testid="link.badgeId">{{ link.count }}</span></RouterLink>
            </li>
          </ul>
          <RouterLink v-if="session.isBakery" class="btn btn-primary workspace-post" to="/listings/new"><i class="bi bi-plus-lg" aria-hidden="true"></i>Post surplus</RouterLink>
        </div>
        <div v-if="communityLinks.length" class="workspace-secondary">
          <span class="workspace-community-label">Community</span>
          <ul class="navbar-nav workspace-community-links" aria-label="Community">
            <li v-for="link in communityLinks" :key="link.to" class="nav-item">
              <RouterLink class="nav-link" :to="link.to" :data-testid="link.testId"><i class="bi" :class="link.icon" aria-hidden="true"></i>{{ link.label }}<span v-if="link.count" class="badge text-bg-danger" :data-testid="link.badgeId">{{ link.count }}</span></RouterLink>
            </li>
          </ul>
        </div>

        <div v-if="session.ready" class="d-flex align-items-center gap-2 flex-wrap" data-testid="account-nav">
          <template v-if="session.user">
            <RouterLink to="/profile" class="text-decoration-none d-flex align-items-center gap-2 me-1" data-testid="account-link">
              <span class="workspace-avatar" aria-hidden="true">{{ session.user.name.slice(0, 1).toUpperCase() }}</span>
              <span class="workspace-account-copy"><span class="workspace-account-name" :title="session.user.name">{{ session.user.name }}</span><span class="workspace-account-role">{{ ROLE_LABELS[session.user.role] }}</span></span>
              <span v-if="session.isCharity && !session.isVerifiedCharity" class="badge text-bg-warning" title="Waiting for an admin to verify your charity">Pending</span>
            </RouterLink>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-testid="logout" aria-label="Log out" title="Log out" @click="logout"><i class="bi bi-box-arrow-right" aria-hidden="true"></i><span class="workspace-logout-label">Log out</span></button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="btn btn-sm btn-outline-primary workspace-auth" data-testid="nav-login"><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>Log in</RouterLink>
            <RouterLink to="/register" class="btn btn-sm btn-primary workspace-auth" data-testid="nav-register"><i class="bi bi-person-plus" aria-hidden="true"></i>Sign up</RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>

  <SlotReminders v-if="session.ready" />
  <FridgeBackdrop v-if="route.name !== 'home'" />
  <ReviewPrompt v-if="session.ready" />
  <main id="main" :class="route.meta.fullWidth ? '' : 'container-fluid px-3 px-lg-4 py-4'">
    <!-- soft cross-fade between pages (opacity + blur only: a transform here would skew ScrollTrigger's pin measurements) -->
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
</template>
