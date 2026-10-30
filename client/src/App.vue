<script setup>
import { ref, watch } from 'vue';
import { MotionConfig } from 'motion-v';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { api } from './api';
import { ROLE_LABELS } from './constants';
import { useSession } from './stores/session';
import SlotReminders from './components/SlotReminders.vue';
import ReviewPrompt from './components/ReviewPrompt.vue'; // REVIEWS FEATURE

const session = useSession();
const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);

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

async function logout() {
  await session.logout();
  router.push('/');
}
</script>

<template>
  <a class="visually-hidden-focusable position-absolute p-2 bg-white" href="#main">Skip to content</a>

  <nav class="navbar navbar-expand-lg navbar-surplate sticky-top">
    <div class="container-fluid px-3 px-lg-4">
      <RouterLink class="navbar-brand brand-mark fs-4" to="/"><i class="bi bi-basket2-fill me-1" aria-hidden="true"></i>Surplate</RouterLink>
      <button
        class="navbar-toggler"
        type="button"
        aria-controls="main-nav"
        :aria-expanded="menuOpen"
        aria-label="Toggle navigation"
        @click="menuOpen = !menuOpen"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div id="main-nav" class="navbar-collapse collapse" :class="{ show: menuOpen }">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item"><RouterLink class="nav-link" to="/browse">Browse food</RouterLink></li>
          <li class="nav-item"><RouterLink class="nav-link" to="/fridges">Community fridges</RouterLink></li>
          <li v-if="session.isBakery || session.isVerifiedCharity" class="nav-item">
            <RouterLink class="nav-link" to="/needs">Charity Needs Board</RouterLink>
          </li>
          <template v-if="session.isBakery">
            <li class="nav-item"><RouterLink class="nav-link" to="/listings/new">Post surplus</RouterLink></li>
            <li class="nav-item"><RouterLink class="nav-link" to="/my-listings">My listings</RouterLink></li>
            <li class="nav-item"><RouterLink class="nav-link" to="/orders">Orders</RouterLink></li>
            <!-- REVIEWS FEATURE -->
            <li class="nav-item"><RouterLink class="nav-link" :to="`/bakeries/${session.user.id}`" data-testid="nav-wall">Thank-you wall</RouterLink></li>
          </template>
          <li v-if="session.isLoggedIn" class="nav-item"><RouterLink class="nav-link" to="/impact">Impact dashboard</RouterLink></li>
          <li v-if="session.isLoggedIn && !session.isAdmin && !session.isBakery" class="nav-item"><RouterLink class="nav-link" to="/reservations">My reservations</RouterLink></li>
          <li v-if="session.isAdmin" class="nav-item"><RouterLink class="nav-link" to="/admin/charities">Verify charities</RouterLink></li>
          <!-- REVIEWS FEATURE -->
          <li v-if="session.isAdmin" class="nav-item">
            <RouterLink class="nav-link" to="/admin/appeals" data-testid="nav-appeals">Appeals<span v-if="appealCount" class="badge text-bg-danger ms-1" data-testid="appeal-count">{{ appealCount }}</span></RouterLink>
          </li>
          <li v-if="session.isBakery || session.isAdmin" class="nav-item">
            <RouterLink class="nav-link" to="/spoiled-alerts" data-testid="nav-alerts">Spoiled alerts<span v-if="alertCount" class="badge text-bg-danger ms-1" data-testid="alert-count">{{ alertCount }}</span></RouterLink>
          </li>
        </ul>

        <div v-if="session.ready" class="d-flex align-items-center gap-2 flex-wrap" data-testid="account-nav">
          <template v-if="session.user">
            <RouterLink to="/profile" class="text-decoration-none d-flex align-items-center gap-2 me-1" data-testid="account-link">
              <span class="fw-semibold text-body">{{ session.user.name }}</span>
              <span class="badge text-bg-light border">{{ ROLE_LABELS[session.user.role] }}</span>
              <span v-if="session.isCharity && !session.isVerifiedCharity" class="badge text-bg-warning" title="Waiting for an admin to verify your charity">Pending</span>
            </RouterLink>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-testid="logout" @click="logout">Log out</button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="btn btn-sm btn-outline-primary" data-testid="nav-login">Log in</RouterLink>
            <RouterLink to="/register" class="btn btn-sm btn-primary" data-testid="nav-register">Sign up</RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>

  <!-- reducedMotion="user": every animation on the site honours the visitor's "reduce motion" setting -->
  <MotionConfig reduced-motion="user">
    <SlotReminders v-if="session.ready" />
    <ReviewPrompt v-if="session.ready" />
    <main id="main" :class="route.meta.fullWidth ? '' : 'container-fluid px-3 px-lg-4 py-4'">
      <RouterView />
    </main>
  </MotionConfig>
</template>
