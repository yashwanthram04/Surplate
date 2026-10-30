<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../api';
import { now } from '../composables/useNow';
import ConfirmModal from '../components/ConfirmModal.vue';
import CountdownRing from '../components/CountdownRing.vue';
import ListingMap from '../components/ListingMap.vue';
import { useSession } from '../stores/session';
import { formatDateTime, formatWindow } from '../utils/time';

const props = defineProps({ id: { type: String, required: true } });
const route = useRoute();
const router = useRouter();
const session = useSession();

const listing = ref(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref('');
const confirmRemove = ref(false);
const removing = ref(false);
const removeError = ref('');
const flash = ref(route.query.posted ? 'Your listing is live on the board.' : route.query.updated ? 'Your changes have been saved.' : '');

const isOwner = computed(() => !!listing.value && session.user?.id === listing.value.bakery.id);
// Derived from the shared clock so the page flips to "closed" the moment the window ends.
const ended = computed(() => !!listing.value && new Date(listing.value.pickupEnd).getTime() < now.value);
const upcoming = computed(() => !!listing.value && new Date(listing.value.pickupStart).getTime() > now.value);

async function load() {
  loading.value = true;
  notFound.value = false;
  error.value = '';
  try {
    const { data } = await api.get(`/listings/${props.id}`);
    listing.value = data;
    document.title = `${data.itemName} – Surplate`;
  } catch (err) {
    if (err.response?.status === 404) notFound.value = true;
    else error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

async function remove() {
  removing.value = true;
  removeError.value = '';
  try {
    await api.delete(`/listings/${props.id}`);
    router.push({ name: 'my-listings', query: { removed: listing.value.itemName } });
  } catch (err) {
    removeError.value = errorMessage(err);
    removing.value = false;
  }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 1100px">
    <RouterLink to="/browse" class="text-decoration-none small"><i class="bi bi-arrow-left" aria-hidden="true"></i> All listings</RouterLink>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <div v-else-if="notFound" class="text-center py-5" data-testid="not-found">
      <div class="display-5 mb-2">🥖</div>
      <h1 class="h4">This listing is no longer available</h1>
      <p class="text-body-secondary">It may have been removed by the bakery.</p>
      <RouterLink to="/browse" class="btn btn-primary">Browse available food</RouterLink>
    </div>

    <div v-else-if="error" class="alert alert-danger mt-3" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button></div>

    <template v-else-if="listing">
      <div v-if="flash" class="alert alert-success alert-dismissible mt-3" role="status" data-testid="flash">
        {{ flash }}
        <button type="button" class="btn-close" aria-label="Dismiss" @click="flash = ''"></button>
      </div>

      <div class="row g-4 mt-1">
        <div class="col-12 col-lg-7">
          <img v-if="listing.photoUrl" class="w-100 rounded-4 border" style="aspect-ratio: 3 / 2; object-fit: cover" :src="listing.photoUrl" :alt="`Photo of ${listing.itemName}`" />
          <div v-else class="photo-placeholder rounded-4" aria-hidden="true">🥖</div>
          <div v-if="listing.description" class="mt-3">
            <h2 class="h6">About this listing</h2>
            <p class="mb-0" style="white-space: pre-line">{{ listing.description }}</p>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="bg-white border rounded-4 p-4">
            <div class="d-flex justify-content-between align-items-start gap-3">
              <div>
                <h1 class="h3 mb-1" data-testid="listing-title">{{ listing.itemName }}</h1>
                <div class="text-body-secondary">{{ listing.bakery.name }}</div>
                <!-- REVIEWS FEATURE: link to the bakery's Thank-you Wall -->
                <RouterLink :to="{ name: 'bakery-wall', params: { id: listing.bakery.id } }" class="thanks-chip mt-1" data-testid="wall-link">
                  <span class="heart" aria-hidden="true">💛</span>{{ listing.bakery.thankYouCount ? `${listing.bakery.thankYouCount} ${listing.bakery.thankYouCount === 1 ? 'thank-you' : 'thank-yous'}` : 'Thank-you Wall' }}
                </RouterLink>
              </div>
              <CountdownRing :start="listing.pickupStart" :end="listing.pickupEnd" :size="76" />
            </div>

            <div v-if="ended" class="alert alert-secondary mt-3 mb-0 py-2" role="status">The pickup window for this listing has closed.</div>
            <div v-else-if="upcoming" class="alert alert-info mt-3 mb-0 py-2" role="status">Pickup opens {{ formatDateTime(listing.pickupStart) }}.</div>

            <div class="d-flex flex-wrap gap-1 mt-3">
              <span v-if="listing.priorityUntil ? new Date(listing.priorityUntil).getTime() > now : !listing.visibleToIndividuals" class="tag-pill charity-pill" data-testid="charities-only"><i class="bi bi-shield-check" aria-hidden="true"></i> {{ listing.priorityUntil ? 'Charity priority' : 'Charities only' }}</span>
              <span v-for="t in listing.dietaryTags" :key="t" class="tag-pill">{{ t }}</span>
              <span v-if="!listing.dietaryTags.length" class="small text-body-secondary">No dietary tags</span>
            </div>
            <div class="mt-3 p-2 rounded-3" :class="listing.allergens.length ? 'bg-warning-subtle' : 'bg-body-tertiary'">
              <template v-if="listing.allergens.length">
                <i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i><strong>Contains:</strong> {{ listing.allergens.join(', ') }}
              </template>
              <template v-else>No declared allergens. Ask the bakery if you have a severe allergy.</template>
            </div>

            <div v-if="isOwner && !listing.priorityUntil && !listing.visibleToIndividuals" class="small text-body-secondary mt-3" data-testid="owner-visibility-note">
              Only verified charities can see this listing. Edit it to share it with individuals too.
            </div>

            <dl class="row mt-3 mb-0 small">
              <dt class="col-5">Available</dt>
              <dd class="col-7" data-testid="detail-quantity">
                <strong>{{ listing.quantityRemaining }}</strong> of {{ listing.quantity }}
              </dd>
              <dt v-if="listing.priorityUntil" class="col-5">Opens to everyone</dt>
              <dd v-if="listing.priorityUntil" class="col-7">{{ formatDateTime(listing.priorityUntil) }}</dd>
              <dt v-if="listing.weightGramsPerUnit" class="col-5">Weight per unit</dt>
              <dd v-if="listing.weightGramsPerUnit" class="col-7">{{ listing.weightGramsPerUnit }} g</dd>
              <dt class="col-5">Pickup window</dt>
              <dd class="col-7">{{ formatWindow(listing.pickupStart, listing.pickupEnd) }}</dd>
              <dt class="col-5">Collection slots</dt>
              <dd class="col-7">{{ listing.slotMinutes }} minutes each</dd>
              <dt class="col-5">Best before</dt>
              <dd class="col-7">{{ formatDateTime(listing.bestBefore) }}</dd>
              <dt class="col-5">Address</dt>
              <dd class="col-7 mb-0">{{ listing.address }}</dd>
            </dl>

            <div class="mt-4 d-grid gap-2">
              <template v-if="isOwner">
                <RouterLink v-if="!ended" :to="{ name: 'listing-edit', params: { id: listing.id } }" class="btn btn-primary"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Edit listing</RouterLink>
                <RouterLink v-else :to="{ name: 'my-listings' }" class="btn btn-primary"><i class="bi bi-arrow-repeat me-1" aria-hidden="true"></i>Re-post from My listings</RouterLink>
                <button type="button" class="btn btn-outline-danger" @click="confirmRemove = true"><i class="bi bi-trash me-1" aria-hidden="true"></i>Remove listing</button>
              </template>
              <RouterLink v-else-if="!ended && listing.quantityRemaining > 0 && !session.isBakery && !session.isAdmin" :to="{ name: 'reserve', params: { id: listing.id } }" class="btn btn-primary btn-lg" data-testid="reserve-btn">
                Reserve
              </RouterLink>
              <button v-else-if="!ended" type="button" class="btn btn-secondary btn-lg" disabled>Fully reserved</button>
            </div>
          </div>
        </div>

        <div class="col-12">
          <h2 class="h6">Pickup location</h2>
          <div style="height: 320px"><ListingMap :listings="[listing]" :linkable="false" /></div>
        </div>
      </div>

      <ConfirmModal v-if="confirmRemove" title="Remove this listing?" confirm-text="Remove listing" danger :busy="removing" :error="removeError" @confirm="remove" @cancel="confirmRemove = false">
        <strong>{{ listing.itemName }}</strong> will disappear from the board straight away. This can't be undone.
      </ConfirmModal>
    </template>
  </div>
</template>
