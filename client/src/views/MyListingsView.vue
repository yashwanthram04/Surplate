<script setup>
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import ConfirmModal from '../components/ConfirmModal.vue';
import CountdownRing from '../components/CountdownRing.vue';
import { now } from '../composables/useNow';
import { useSession } from '../stores/session';
import { formatWindow, fromLocalInput, minutesFromNow, toLocalInput } from '../utils/time';

const route = useRoute();
const router = useRouter();
const session = useSession();

const items = ref([]);
const loading = ref(true);
const error = ref('');
const tab = ref('active');
const flash = ref(route.query.removed ? `"${route.query.removed}" was removed.` : '');

// "Ended" is derived from the shared clock so a listing moves to the Past tab the moment its window closes.
const isEnded = (l) => new Date(l.pickupEnd).getTime() < now.value;
const active = computed(() => items.value.filter((l) => !isEnded(l)));
const past = computed(() => items.value.filter(isEnded));
const shown = computed(() => (tab.value === 'active' ? active.value : past.value));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/listings/mine');
    items.value = data.items;
    if (!active.value.length && past.value.length) tab.value = 'past';
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
load();
if (route.query.removed) router.replace({ query: {} });

// ---- remove ----------------------------------------------------------------------------
const removing = ref(null);
const removeBusy = ref(false);
const removeError = ref('');
async function confirmRemove() {
  removeBusy.value = true;
  removeError.value = '';
  try {
    await api.delete(`/listings/${removing.value.id}`);
    flash.value = `"${removing.value.itemName}" was removed.`;
    items.value = items.value.filter((l) => l.id !== removing.value.id);
    removing.value = null;
  } catch (err) {
    removeError.value = errorMessage(err);
  } finally {
    removeBusy.value = false;
  }
}

// ---- re-post: copy a listing with fresh stock and pickup window --------------------------
const reposting = ref(null);
const repostBusy = ref(false);
const repostError = ref('');
const repostFields = reactive({ quantity: '', pickupStart: '', pickupEnd: '', bestBefore: '' });
const repostErrors = ref({});
function openRepost(l) {
  reposting.value = l;
  repostError.value = '';
  repostErrors.value = {};
  Object.assign(repostFields, {
    quantity: l.quantity,
    pickupStart: toLocalInput(new Date()),
    pickupEnd: toLocalInput(minutesFromNow(120)),
    bestBefore: toLocalInput(minutesFromNow(360)),
  });
}
async function confirmRepost() {
  repostBusy.value = true;
  repostError.value = '';
  repostErrors.value = {};
  try {
    const { data } = await api.post(`/listings/${reposting.value.id}/repost`, {
      quantity: Number(repostFields.quantity),
      pickupStart: fromLocalInput(repostFields.pickupStart),
      pickupEnd: fromLocalInput(repostFields.pickupEnd),
      bestBefore: fromLocalInput(repostFields.bestBefore),
    });
    router.push({ name: 'listing', params: { id: data.id }, query: { posted: 1 } });
  } catch (err) {
    repostErrors.value = fieldErrors(err);
    repostError.value = Object.keys(repostErrors.value).length ? '' : errorMessage(err);
  } finally {
    repostBusy.value = false;
  }
}

const badge = (l) => {
  const t = now.value;
  if (t > new Date(l.pickupEnd).getTime()) return { text: 'Ended', cls: 'text-bg-secondary' };
  if (t < new Date(l.pickupStart).getTime()) return { text: 'Upcoming', cls: 'text-bg-info' };
  return l.quantityRemaining === 0 ? { text: 'Fully reserved', cls: 'text-bg-warning' } : { text: 'Live', cls: 'text-bg-success' };
};
</script>

<template>
    <div class="mx-auto" style="max-width: 1000px">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h1 class="h3 mb-0">My listings</h1>
          <div class="text-body-secondary small">{{ session.user?.name }}</div>
        </div>
        <RouterLink to="/listings/new" class="btn btn-primary"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Post surplus food</RouterLink>
      </div>

      <div v-if="flash" class="alert alert-success alert-dismissible" role="status" data-testid="flash">
        {{ flash }}
        <button type="button" class="btn-close" aria-label="Dismiss" @click="flash = ''"></button>
      </div>
      <div v-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
        <span>{{ error }}</span><button class="btn btn-sm btn-outline-danger" @click="load">Retry</button>
      </div>

      <ul class="nav nav-pills mb-3" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link" :class="{ active: tab === 'active' }" role="tab" :aria-selected="tab === 'active'" data-testid="tab-active" @click="tab = 'active'">
            Active <span class="badge text-bg-light ms-1">{{ active.length }}</span>
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" :class="{ active: tab === 'past' }" role="tab" :aria-selected="tab === 'past'" data-testid="tab-past" @click="tab = 'past'">
            Past <span class="badge text-bg-light ms-1">{{ past.length }}</span>
          </button>
        </li>
      </ul>

      <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

      <div v-else-if="!shown.length" class="text-center py-5 bg-white border rounded-4" data-testid="empty-state">
        <div class="display-5 mb-2">🥐</div>
        <h2 class="h5">{{ tab === 'active' ? 'No active listings' : 'No past listings yet' }}</h2>
        <p class="text-body-secondary">{{ tab === 'active' ? 'Got leftovers at closing time? Post them and give them a second life.' : 'Listings move here when their pickup window closes, ready to be re-posted.' }}</p>
        <RouterLink v-if="tab === 'active'" to="/listings/new" class="btn btn-primary">Post surplus food</RouterLink>
      </div>

      <ul v-else class="list-unstyled d-grid gap-3 mb-0">
        <li v-for="l in shown" :key="l.id" class="bg-white border rounded-4 p-3" data-testid="my-listing">
          <div class="row g-3 align-items-center">
            <div class="col-4 col-md-2">
              <img v-if="l.photoUrl" :src="l.photoUrl" :alt="`Photo of ${l.itemName}`" class="w-100 rounded-3" style="aspect-ratio: 1; object-fit: cover" />
              <div v-else class="photo-placeholder rounded-3" style="aspect-ratio: 1" aria-hidden="true">🥖</div>
            </div>
            <div class="col-8 col-md-5">
              <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                <RouterLink :to="{ name: 'listing', params: { id: l.id } }" class="fw-semibold text-decoration-none text-body">{{ l.itemName }}</RouterLink>
                <span class="badge" :class="badge(l).cls">{{ badge(l).text }}</span>
                <span v-if="!l.visibleToIndividuals" class="badge text-bg-light border" data-testid="charities-only"><i class="bi bi-shield-check" aria-hidden="true"></i> Charities only</span>
              </div>
              <div class="small text-body-secondary">{{ formatWindow(l.pickupStart, l.pickupEnd) }}</div>
              <div class="small"><strong>{{ l.quantityRemaining }}</strong> of {{ l.quantity }} left</div>
            </div>
            <div class="col-4 col-md-1 d-flex justify-content-center"><CountdownRing :start="l.pickupStart" :end="l.pickupEnd" :size="54" /></div>
            <div class="col-8 col-md-4 d-flex flex-wrap gap-2 justify-content-md-end">
              <RouterLink v-if="!isEnded(l)" :to="{ name: 'listing-edit', params: { id: l.id } }" class="btn btn-sm btn-outline-primary"><i class="bi bi-pencil me-1" aria-hidden="true"></i>Edit</RouterLink>
              <button type="button" class="btn btn-sm" :class="isEnded(l) ? 'btn-primary' : 'btn-outline-primary'" @click="openRepost(l)"><i class="bi bi-arrow-repeat me-1" aria-hidden="true"></i>Re-post</button>
              <button type="button" class="btn btn-sm btn-outline-danger" :aria-label="`Remove ${l.itemName}`" @click="removing = l; removeError = ''"><i class="bi bi-trash" aria-hidden="true"></i></button>
            </div>
          </div>
        </li>
      </ul>

      <ConfirmModal v-if="removing" title="Remove this listing?" confirm-text="Remove listing" danger :busy="removeBusy" :error="removeError" @confirm="confirmRemove" @cancel="removing = null">
        <strong>{{ removing.itemName }}</strong> will disappear from the board straight away. This can't be undone.
      </ConfirmModal>

      <ConfirmModal v-if="reposting" title="Re-post listing" confirm-text="Post again" :busy="repostBusy" :error="repostError" @confirm="confirmRepost" @cancel="reposting = null">
        <p class="small text-body-secondary">Copies <strong>{{ reposting.itemName }}</strong> (photo, tags and address included) with fresh stock and a new pickup window.</p>
        <form class="vstack gap-2" novalidate @submit.prevent="confirmRepost" @keydown.enter.prevent="confirmRepost">
          <div>
            <label for="rp-qty" class="form-label small fw-semibold mb-1">Quantity</label>
            <input id="rp-qty" v-model="repostFields.quantity" type="number" min="1" max="500" class="form-control" :class="{ 'is-invalid': repostErrors.quantity }" />
            <div class="invalid-feedback">{{ repostErrors.quantity }}</div>
          </div>
          <div>
            <label for="rp-start" class="form-label small fw-semibold mb-1">Pickup opens</label>
            <input id="rp-start" v-model="repostFields.pickupStart" type="datetime-local" class="form-control" :class="{ 'is-invalid': repostErrors.pickupStart }" />
            <div class="invalid-feedback">{{ repostErrors.pickupStart }}</div>
          </div>
          <div>
            <label for="rp-end" class="form-label small fw-semibold mb-1">Pickup closes</label>
            <input id="rp-end" v-model="repostFields.pickupEnd" type="datetime-local" class="form-control" :class="{ 'is-invalid': repostErrors.pickupEnd }" />
            <div class="invalid-feedback">{{ repostErrors.pickupEnd }}</div>
          </div>
          <div>
            <label for="rp-best" class="form-label small fw-semibold mb-1">Best before</label>
            <input id="rp-best" v-model="repostFields.bestBefore" type="datetime-local" class="form-control" :class="{ 'is-invalid': repostErrors.bestBefore }" />
            <div class="invalid-feedback">{{ repostErrors.bestBefore }}</div>
          </div>
        </form>
      </ConfirmModal>
    </div>
</template>
