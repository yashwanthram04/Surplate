<script setup>
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage } from '../api';
import ConfirmModal from '../components/ConfirmModal.vue';
import FridgeMap from '../components/FridgeMap.vue';
import FridgeStatusBadge from '../components/FridgeStatusBadge.vue';
import FridgeStatusForm from '../components/FridgeStatusForm.vue';
import SpoiledFlagModal from '../components/SpoiledFlagModal.vue';
import { now } from '../composables/useNow';
import { useSession } from '../stores/session';
import { isStale, timeAgo } from '../utils/fridge';
import { formatDateTime } from '../utils/time';

const props = defineProps({ id: { type: String, required: true } });
const route = useRoute();
const router = useRouter();
const session = useSession();

const fridge = ref(null);
const loading = ref(true);
const notFound = ref(false);
const error = ref('');
const flash = ref(route.query.added ? 'Thanks! The fridge is on the map. Post a status update so people know what is inside.' : route.query.updated ? 'Your changes have been saved.' : '');

const updates = ref([]);
const nextBefore = ref(null);
const loadingMore = ref(false);
const updatesError = ref('');

const flagging = ref(false); // is the spoiled-food modal open?
const flagUpdate = ref(null); // the drop-off being flagged, or null for a general report
const confirmRemove = ref(false);
const removing = ref(false);
const removeError = ref('');

const canManage = computed(() => !!fridge.value && !!session.user && (session.isAdmin || session.user.id === fridge.value.createdBy.id));
const stale = computed(() => !!fridge.value && fridge.value.latestUpdateAt && isStale(fridge.value.latestUpdateAt, now.value));
// For the single-pin map. Rebuilt whenever `fridge` is replaced (after a new status update).
const mapFridges = computed(() => (fridge.value ? [fridge.value] : []));

async function load() {
  loading.value = true;
  notFound.value = false;
  error.value = '';
  try {
    const { data } = await api.get(`/fridges/${props.id}`);
    fridge.value = data;
    document.title = `${data.name} – Surplate`;
    await loadUpdates(true);
  } catch (err) {
    if (err.response?.status === 404) notFound.value = true;
    else error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
watch(() => props.id, load, { immediate: true });

async function loadUpdates(reset = false) {
  loadingMore.value = true;
  updatesError.value = '';
  try {
    const params = reset || !nextBefore.value ? {} : { before: nextBefore.value };
    const { data } = await api.get(`/fridges/${props.id}/updates`, { params });
    updates.value = reset ? data.items : [...updates.value, ...data.items];
    nextBefore.value = data.nextBefore;
  } catch (err) {
    updatesError.value = errorMessage(err);
  } finally {
    loadingMore.value = false;
  }
}

// A new status update from the form: show it at the top and refresh the headline status.
function onPosted(update) {
  updates.value = [update, ...updates.value];
  fridge.value = { ...fridge.value, latestStatus: update.status, latestUpdateAt: update.createdAt, latestNote: update.note };
  flash.value = 'Thanks! The status has been updated.';
}

function openFlag(update = null) {
  flagUpdate.value = update;
  flagging.value = true;
}
function onFlagged({ suppliersNotified }) {
  flagging.value = false;
  flash.value = suppliersNotified
    ? `Thank you. ${suppliersNotified === 1 ? 'The supplier has' : `${suppliersNotified} suppliers have`} been notified.`
    : 'Thank you. No registered supplier could be matched, so the Surplate admins will see your report.';
  fridge.value = { ...fridge.value, openSpoiledReports: fridge.value.openSpoiledReports + 1 };
}

async function remove() {
  removing.value = true;
  removeError.value = '';
  try {
    await api.delete(`/fridges/${props.id}`);
    router.push({ name: 'fridges' });
  } catch (err) {
    removeError.value = errorMessage(err);
    removing.value = false;
  }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 1100px">
    <RouterLink :to="{ name: 'fridges' }" class="text-decoration-none small"><i class="bi bi-arrow-left" aria-hidden="true"></i> All community fridges</RouterLink>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <div v-else-if="notFound" class="text-center py-5" data-testid="not-found">
      <div class="display-5 mb-2">🧊</div>
      <h1 class="h4">This fridge is no longer on the map</h1>
      <p class="text-body-secondary">It may have been removed.</p>
      <RouterLink :to="{ name: 'fridges' }" class="btn btn-primary">Back to the map</RouterLink>
    </div>

    <div v-else-if="error" class="alert alert-danger mt-3" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button></div>

    <template v-else-if="fridge">
      <div v-if="flash" class="alert alert-success alert-dismissible mt-3" role="status" data-testid="flash">
        {{ flash }}
        <button type="button" class="btn-close" aria-label="Dismiss" @click="flash = ''"></button>
      </div>

      <div v-if="fridge.openSpoiledReports" class="alert alert-warning mt-3 mb-0" role="status" data-testid="spoiled-warning">
        <i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>
        Someone reported spoiled food here and the supplier has been told. Check dates and smell before you take anything.
      </div>

      <div class="row g-4 mt-1">
        <!-- left: photo, notes, history -->
        <div class="col-12 col-lg-7">
          <img v-if="fridge.photoUrl" class="w-100 rounded-4 border" style="aspect-ratio: 3 / 2; object-fit: cover" :src="fridge.photoUrl" :alt="`Photo of ${fridge.name}`" />
          <div v-else class="photo-placeholder rounded-4" aria-hidden="true">🧊</div>
          <div v-if="fridge.description" class="mt-3">
            <h2 class="h6">About this fridge</h2>
            <p class="mb-0" style="white-space: pre-line">{{ fridge.description }}</p>
          </div>

          <section class="mt-4" aria-labelledby="history-title">
            <h2 id="history-title" class="h5">Status history</h2>
            <div v-if="updatesError" class="alert alert-danger py-2" role="alert">{{ updatesError }} <button class="btn btn-sm btn-outline-danger ms-2" @click="loadUpdates(true)">Retry</button></div>
            <p v-else-if="!updates.length && !loadingMore" class="text-body-secondary" data-testid="no-updates">Nobody has posted an update yet. Be the first!</p>
            <ul class="update-list" data-testid="update-list">
              <li v-for="u in updates" :key="u.id" class="update-item" data-testid="update-item">
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <FridgeStatusBadge :status="u.status" />
                  <span class="small text-body-secondary" :title="formatDateTime(u.createdAt)">
                    {{ u.author.name }}<span v-if="u.author.role === 'bakery'" class="badge text-bg-light border ms-1">Supplier</span> · {{ timeAgo(u.createdAt, now) }}
                  </span>
                </div>
                <p v-if="u.note" class="mb-1 mt-2">{{ u.note }}</p>
                <img v-if="u.photoUrl" :src="u.photoUrl" class="update-photo d-block mt-2" :alt="`Photo posted with this update by ${u.author.name}`" loading="lazy" />
                <button v-if="session.isLoggedIn" type="button" class="btn btn-link btn-sm text-danger p-0 mt-1" data-testid="flag-update" @click="openFlag(u)">
                  <i class="bi bi-flag me-1" aria-hidden="true"></i>Flag spoiled food from this drop-off
                </button>
              </li>
            </ul>
            <button v-if="nextBefore" type="button" class="btn btn-outline-secondary btn-sm" :disabled="loadingMore" @click="loadUpdates()">
              <span v-if="loadingMore" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Show older updates
            </button>
          </section>
        </div>

        <!-- right: current status, details, actions -->
        <div class="col-12 col-lg-5">
          <div class="bg-white border rounded-4 p-4">
            <div class="text-body-secondary small">Community fridge</div>
            <h1 class="h3 mb-3" data-testid="fridge-title">{{ fridge.name }}</h1>

            <FridgeStatusBadge :status="fridge.latestStatus" large />
            <div class="small mt-2" data-testid="last-updated" :title="fridge.latestUpdateAt ? formatDateTime(fridge.latestUpdateAt) : ''">
              <template v-if="fridge.latestUpdateAt"><i class="bi bi-clock me-1" aria-hidden="true"></i>Last updated {{ timeAgo(fridge.latestUpdateAt, now) }}</template>
              <template v-else>Nobody has posted an update yet.</template>
            </div>
            <div v-if="stale" class="small text-body-secondary mt-1"><i class="bi bi-info-circle me-1" aria-hidden="true"></i>This is more than a day old, so it may be out of date.</div>
            <p v-if="fridge.latestNote" class="fridge-note mt-2 mb-0">“{{ fridge.latestNote }}”</p>

            <dl class="row mt-3 mb-0 small">
              <dt class="col-4">Hours</dt>
              <dd class="col-8">{{ fridge.openingHours }}</dd>
              <dt class="col-4">Address</dt>
              <dd class="col-8">{{ fridge.address }}</dd>
              <dt class="col-4">Added by</dt>
              <dd class="col-8 mb-0">{{ fridge.createdBy.name }}</dd>
            </dl>

            <div v-if="canManage" class="mt-3 d-flex gap-2">
              <RouterLink :to="{ name: 'fridge-edit', params: { id: fridge.id } }" class="btn btn-outline-primary btn-sm"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Edit</RouterLink>
              <button type="button" class="btn btn-outline-danger btn-sm" data-testid="remove-fridge" @click="confirmRemove = true"><i class="bi bi-trash me-1" aria-hidden="true"></i>Remove</button>
            </div>
          </div>

          <div class="bg-white border rounded-4 p-4 mt-4">
            <h2 class="h5">Post a status update</h2>
            <FridgeStatusForm v-if="session.isLoggedIn" :fridge-id="fridge.id" @posted="onPosted" />
            <p v-else class="mb-0">
              <RouterLink :to="{ name: 'login', query: { next: route.fullPath } }" data-testid="login-to-post">Log in</RouterLink>
              or <RouterLink :to="{ name: 'register' }">sign up</RouterLink> to tell people if this fridge is stocked, low or empty.
            </p>
            <hr />
            <button v-if="session.isLoggedIn" type="button" class="btn btn-outline-danger w-100" data-testid="flag-spoiled" @click="openFlag()">
              <i class="bi bi-flag me-1" aria-hidden="true"></i>Flag spoiled food
            </button>
          </div>
        </div>

        <div class="col-12">
          <h2 class="h6">Location</h2>
          <div style="height: 320px"><FridgeMap :fridges="mapFridges" :linkable="false" /></div>
        </div>
      </div>

      <SpoiledFlagModal v-if="flagging" :fridge-id="fridge.id" :fridge-name="fridge.name" :update="flagUpdate" @done="onFlagged" @cancel="flagging = false" />
      <ConfirmModal v-if="confirmRemove" title="Remove this fridge?" confirm-text="Remove" danger :busy="removing" :error="removeError" @confirm="remove" @cancel="confirmRemove = false">
        <strong>{{ fridge.name }}</strong> will disappear from the map. This can't be undone.
      </ConfirmModal>
    </template>
  </div>
</template>
