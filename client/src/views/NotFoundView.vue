<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="text-center py-5">
    <div class="display-5 mb-2">🥖</div>
    <h1 class="h4">Page not found</h1>
    <p class="text-body-secondary">That page doesn't exist.</p>
    <RouterLink to="/" class="btn btn-primary">Browse available food</RouterLink>
  </div>
</template>
