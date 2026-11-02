<script setup>
import BouncingHeading from '../components/BouncingHeading.vue';
import SiteBanner from '../components/SiteBanner.vue';
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="text-center py-5 mx-auto" style="max-width: 900px">
    <SiteBanner compact icon="bi-info-circle-fill">
      <div class="display-5 mb-2">🥖</div>
      <BouncingHeading class="h4" text="Page not found" />
      <p class="text-body-secondary">That page doesn't exist.</p>
      <RouterLink to="/browse" class="btn btn-primary">Browse available food</RouterLink>
    </SiteBanner>
  </div>
</template>
