<script setup>
import { ref, watch } from 'vue';
import { MotionConfig } from 'motion-v';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { ROLE_LABELS } from './constants';
import { useSession } from './stores/session';

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
          <template v-if="session.isBakery">
            <li class="nav-item"><RouterLink class="nav-link" to="/listings/new">Post surplus</RouterLink></li>
            <li class="nav-item"><RouterLink class="nav-link" to="/my-listings">My listings</RouterLink></li>
          </template>
          <li v-if="session.isAdmin" class="nav-item"><RouterLink class="nav-link" to="/admin/charities">Verify charities</RouterLink></li>
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
    <main id="main" :class="route.meta.fullWidth ? '' : 'container-fluid px-3 px-lg-4 py-4'">
      <RouterView />
    </main>
  </MotionConfig>
</template>
