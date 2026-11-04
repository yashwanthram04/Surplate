<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import FridgeBanner from '../components/FridgeBanner.vue';
import FridgeMascot from '../components/FridgeMascot.vue';
import { api, errorMessage } from '../api';
import { now } from '../composables/useNow';
import { useSmoothScroll, vReveal } from '../composables/useFridgeMotion';
import { useSession } from '../stores/session';
import { statusMeta, timeAgo } from '../utils/fridge';

const session = useSession();
useSmoothScroll();
const tab = ref('open'); // open | resolved | stale (admins only: fridges whose food may be stale)
const items = ref([]); // reports, or fridges on the stale tab
const loading = ref(true);
const error = ref('');

const resolvingId = ref(null);
const resolution = ref('');
const busyId = ref(null);
const actionError = ref('');

// Tab counts: open spoiled reports, and (admins) stale fridges nobody has said they're checking yet.
const counts = ref({ reports: null, stale: null });
async function loadCounts() {
  try {
    const { data } = await api.get('/fridges/alerts/count');
    counts.value = { reports: data.reports ?? data.open, stale: data.stale ?? null };
  } catch {
    /* the counts are a nicety: the tabs still work without them */
  }
}
const withCount = (label, n) => (n == null ? label : `${label} (${n})`);

let requestId = 0;
async function load() {
  const mine = ++requestId;
  loadCounts();
  try {
    const { data } = tab.value === 'stale' ? await api.get('/fridges/alerts/stale') : await api.get('/fridges/alerts', { params: { status: tab.value } });
    if (mine !== requestId) return;
    items.value = data.items;
    error.value = '';
  } catch (err) {
    if (mine !== requestId) return;
    error.value = errorMessage(err);
  } finally {
    if (mine === requestId) loading.value = false;
  }
}
watch(tab, () => {
  loading.value = true;
  resolvingId.value = null;
  load();
}, { immediate: true });
const refresh = setInterval(load, 60 * 1000);
onBeforeUnmount(() => clearInterval(refresh));

function startResolve(id) {
  resolvingId.value = id;
  resolution.value = '';
  actionError.value = '';
}
async function resolve(report) {
  busyId.value = report.id;
  actionError.value = '';
  try {
    await api.post(`/fridges/alerts/${report.id}/resolve`, { resolution: resolution.value.trim() });
    items.value = items.value.filter((r) => r.id !== report.id);
    resolvingId.value = null;
    loadCounts();
  } catch (err) {
    actionError.value = errorMessage(err);
  } finally {
    busyId.value = null;
  }
}

async function startCheck(fridge) {
  busyId.value = fridge.id;
  actionError.value = '';
  try {
    const { data } = await api.post(`/fridges/${fridge.id}/checking`);
    items.value = items.value.map((f) => (f.id === fridge.id ? data : f));
    loadCounts();
  } catch (err) {
    actionError.value = errorMessage(err);
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 1280px">
    <FridgeBanner class="mb-4" title="Spoiled food alerts" :mood="tab !== 'resolved' && items.length ? 'low' : 'stocked'" mini :foods="['🧽', '🧤', '🗑️', '💚']">
      <p class="mb-0">
        <template v-if="session.isAdmin">Two separate lists: <strong>spoiled reports</strong> people sent about bad food, and fridges that <strong>need a check</strong> because nobody has updated them in over 2 days.</template>
        <template v-else>People flagged food you dropped off at a community fridge. Please collect it if you can, then mark the alert resolved.</template>
      </p>
    </FridgeBanner>

    <ul class="nav nav-pills mb-3" role="tablist">
      <li class="nav-item"><button type="button" class="nav-link" :class="{ active: tab === 'open' }" role="tab" :aria-selected="tab === 'open'" data-testid="tab-open" @click="tab = 'open'">{{ withCount(session.isAdmin ? 'Open reports' : 'Open', counts.reports) }}</button></li>
      <li class="nav-item"><button type="button" class="nav-link" :class="{ active: tab === 'resolved' }" role="tab" :aria-selected="tab === 'resolved'" data-testid="tab-resolved" @click="tab = 'resolved'">{{ session.isAdmin ? 'Resolved reports' : 'Resolved' }}</button></li>
      <li v-if="session.isAdmin" class="nav-item"><button type="button" class="nav-link" :class="{ active: tab === 'stale' }" role="tab" :aria-selected="tab === 'stale'" data-testid="tab-stale" @click="tab = 'stale'">{{ withCount('Needs a check', counts.stale) }}</button></li>
    </ul>

    <div v-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span>{{ error }}</span><button class="btn btn-sm btn-outline-danger" @click="load">Retry</button>
    </div>
    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>
    <div v-else-if="!items.length && !error" class="text-center py-5 bg-white border rounded-4" data-testid="empty-state">
      <FridgeMascot mood="stocked" :size="110" />
      <h2 class="h5">{{ tab === 'open' ? 'No open alerts' : tab === 'stale' ? 'Every stocked fridge has a recent update' : 'Nothing resolved yet' }}</h2>
    </div>

    <div v-else-if="tab === 'stale'" class="d-flex flex-column gap-3">
      <p class="small text-body-secondary mb-0">
        These fridges said food was inside, but nobody has updated them in over 2 days, so users see a "food may not be fresh" warning.
        Tap "I'm checking this" so they know someone is on it, then post a status update on the fridge page once you've checked or cleared it out.
        The count on this tab is fridges nobody has claimed yet. Spoiled-food reports are handled separately under Open reports.
      </p>
      <div v-if="actionError" class="alert alert-danger py-2 mb-0" role="alert">{{ actionError }}</div>
      <article v-for="(f, i) in items" :key="f.id" v-reveal="i" class="bg-white border rounded-4 p-3 p-md-4 alert-card" data-testid="stale-card">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <h2 class="h6 mb-0"><RouterLink :to="{ name: 'fridge', params: { id: f.id } }">{{ f.name }}</RouterLink></h2>
          <span class="small text-body-secondary">last update {{ timeAgo(f.latestUpdateAt, now) }}</span>
        </div>
        <div class="small mt-1">
          Last reported as {{ statusMeta(f.latestStatus).label.toLowerCase() }}<template v-if="f.latestNote">: “{{ f.latestNote }}”</template>
        </div>
        <div class="small text-body-secondary">{{ f.address }}</div>
        <div v-if="f.checking" class="small mt-2" data-testid="checking-note">
          <i class="bi bi-person-check-fill me-1" aria-hidden="true"></i>{{ f.checking.byName }} is checking this ({{ timeAgo(f.checking.at, now) }}).
        </div>
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button v-if="!f.checking" type="button" class="btn btn-stale btn-sm" :disabled="busyId === f.id" data-testid="start-check" @click="startCheck(f)">
            <span v-if="busyId === f.id" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span><i v-else class="bi bi-person-check me-1" aria-hidden="true"></i>I'm checking this
          </button>
          <RouterLink :to="{ name: 'fridge', params: { id: f.id } }" class="btn btn-outline-primary btn-sm"><i class="bi bi-pencil-square me-1" aria-hidden="true"></i>Post an update</RouterLink>
        </div>
      </article>
    </div>

    <div v-else class="d-flex flex-column gap-3">
      <article v-for="(r, i) in items" :key="r.id" v-reveal="i" class="bg-white border rounded-4 p-3 p-md-4 alert-card" :class="{ 'is-resolved': r.status === 'resolved' }" data-testid="alert-card">
        <div class="d-flex flex-wrap justify-content-between gap-2">
          <h2 class="h6 mb-0">{{ r.items }}</h2>
          <span class="small text-body-secondary">{{ timeAgo(r.createdAt, now) }}</span>
        </div>
        <div class="small mt-1">
          at <RouterLink :to="{ name: 'fridge', params: { id: r.fridge.id } }">{{ r.fridge.name }}</RouterLink>
          · reported by {{ r.reportedByName }}
          <span v-if="session.isAdmin && !r.suppliersNotified" class="tag-pill charity-pill ms-1">No supplier matched</span>
        </div>
        <p v-if="r.note" class="mb-0 mt-2">{{ r.note }}</p>
        <img v-if="r.photoUrl" :src="r.photoUrl" class="update-photo d-block mt-2" :alt="`Photo of ${r.items}`" loading="lazy" />

        <div v-if="r.status === 'resolved'" class="small text-body-secondary mt-2">
          <i class="bi bi-check-circle-fill text-success me-1" aria-hidden="true"></i>Resolved by {{ r.resolvedByName }}<template v-if="r.resolution">: {{ r.resolution }}</template>
        </div>
        <template v-else>
          <div v-if="resolvingId === r.id" class="mt-3">
            <label :for="`res-${r.id}`" class="form-label small fw-semibold">What did you do? <span class="text-body-secondary fw-normal">(optional)</span></label>
            <input :id="`res-${r.id}`" v-model="resolution" class="form-control" maxlength="300" placeholder="e.g. Collected and discarded" />
            <div v-if="actionError" class="text-danger small mt-1" role="alert">{{ actionError }}</div>
            <div class="d-flex gap-2 mt-2">
              <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === r.id" data-testid="confirm-resolve" @click="resolve(r)">
                <span v-if="busyId === r.id" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Mark resolved
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="resolvingId = null">Cancel</button>
            </div>
          </div>
          <button v-else type="button" class="btn btn-outline-primary btn-sm mt-3" data-testid="resolve" @click="startResolve(r.id)">
            <i class="bi bi-check2 me-1" aria-hidden="true"></i>Mark as resolved
          </button>
        </template>
      </article>
    </div>
  </div>
</template>
