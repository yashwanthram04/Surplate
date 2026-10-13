<script setup>
import { RouterLink } from 'vue-router';
import { ROLE_LABELS } from '../constants';
import { useSession } from '../stores/session';

const session = useSession();
</script>

<template>
  <div class="text-center py-5" data-testid="forbidden">
    <div class="display-5 mb-2" aria-hidden="true">🔒</div>
    <h1 class="h4">This page isn't available for your account</h1>
    <p class="text-body-secondary">
      <template v-if="session.user">You're logged in as {{ ROLE_LABELS[session.user.role].toLowerCase() }}, and this page is for a different account type.</template>
    </p>
    <RouterLink to="/browse" class="btn btn-primary">Browse available food</RouterLink>
  </div>
</template>
