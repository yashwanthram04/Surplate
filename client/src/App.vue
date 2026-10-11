<script setup>
import { ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useSession } from './stores/session';

const session = useSession();
const route = useRoute();
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
          <li class="nav-item"><RouterLink class="nav-link" to="/" exact-active-class="active">Browse food</RouterLink></li>
          <template v-if="session.isBakery">
            <li class="nav-item"><RouterLink class="nav-link" to="/listings/new">Post surplus</RouterLink></li>
            <li class="nav-item"><RouterLink class="nav-link" to="/my-listings">My listings</RouterLink></li>
          </template>
        </ul>

        <!-- Stand-in for login until the Accounts feature lands -->
        <div v-if="session.users.length" class="d-flex align-items-center gap-2">
          <label for="acting-as" class="small text-body-secondary mb-0 text-nowrap">Demo account</label>
          <select
            id="acting-as"
            class="form-select form-select-sm"
            :value="session.userId"
            @change="session.setUser($event.target.value)"
          >
            <option v-for="u in session.users" :key="u.id" :value="u.id">{{ u.name }}</option>
          </select>
        </div>
      </div>
    </div>
  </nav>

  <main id="main" class="container-fluid px-3 px-lg-4 py-4">
    <RouterView />
  </main>
</template>
