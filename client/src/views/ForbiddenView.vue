<script setup>
import BouncingHeading from '../components/BouncingHeading.vue';
import SiteBanner from '../components/SiteBanner.vue';
import { RouterLink } from 'vue-router';
import { ROLE_LABELS } from '../constants';
import { useSession } from '../stores/session';

const session = useSession();
</script>

<template>
  <div class="text-center py-5 mx-auto" style="max-width: 900px" data-testid="forbidden">
    <SiteBanner compact icon="bi-info-circle-fill">
      <div class="display-5 mb-2" aria-hidden="true">🔒</div>
      <BouncingHeading class="h4" text="This page isn't available for your account" />
      <p class="text-body-secondary">
        <template v-if="session.user">You're logged in as {{ ROLE_LABELS[session.user.role].toLowerCase() }}, and this page is for a different account type.</template>
      </p>
      <RouterLink to="/browse" class="btn btn-primary">Browse available food</RouterLink>
    </SiteBanner>
  </div>
</template>
