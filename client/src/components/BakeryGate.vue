<script setup>
import { useSession } from '../stores/session';

// Shows its content to bakery accounts only. Stand-in until the Accounts feature adds real role-based routing.
const session = useSession();
</script>

<template>
  <div v-if="!session.ready" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>
  <div v-else-if="!session.isBakery" class="alert alert-warning" role="alert" data-testid="bakery-only">
    <h1 class="h5">Bakery accounts only</h1>
    <p class="mb-0">Only bakeries can post and manage surplus food. Switch to a bakery using the <strong>Demo account</strong> menu in the top bar.</p>
  </div>
  <slot v-else />
</template>
