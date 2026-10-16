<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { api, errorMessage } from '../api';
import { now } from '../composables/useNow';
import { useSession } from '../stores/session';
import { timeAgo } from '../utils/fridge';

// Spoiled-food reports. Bakeries see the reports sent to them (they dropped the food off);
// admins see every report, including ones no supplier could be matched to.
const session = useSession();
const tab = ref('open'); // open | resolved
const items = ref([]);
const loading = ref(true);
const error = ref('');

const resolvingId = ref(null); // which report has its "resolve" box open
const resolution = ref('');
const busyId = ref(null);
const actionError = ref('');

let requestId = 0;
async function load() {
  const mine = ++requestId;
  try {
    const { data } = await api.get('/fridges/alerts', { params: { status: tab.value } });
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
  } catch (err) {
    actionError.value = errorMessage(err);
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 900px">
    <h1 class="h3 mb-1">Spoiled food alerts</h1>
    <p class="text-body-secondary">
      <template v-if="session.isAdmin">Every spoiled-food report from community fridges and pantries.</template>
      <template v-else>People flagged food you dropped off at a community fridge or pantry. Please collect it if you can, then mark the alert resolved.</template>
    </p>

    <ul class="nav nav-pills mb-3" role="tablist">
      <li class="nav-item"><button type="button" class="nav-link" :class="{ active: tab === 'open' }" role="tab" :aria-selected="tab === 'open'" data-testid="tab-open" @click="tab = 'open'">Open</button></li>
      <li class="nav-item"><button type="button" class="nav-link" :class="{ active: tab === 'resolved' }" role="tab" :aria-selected="tab === 'resolved'" data-testid="tab-resolved" @click="tab = 'resolved'">Resolved</button></li>
    </ul>

    <div v-if="error" class="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
      <span>{{ error }}</span><button class="btn btn-sm btn-outline-danger" @click="load">Retry</button>
    </div>
    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>
    <div v-else-if="!items.length && !error" class="text-center py-5 bg-white border rounded-4" data-testid="empty-state">
      <div class="display-5 mb-2">✅</div>
      <h2 class="h5">{{ tab === 'open' ? 'No open alerts' : 'Nothing resolved yet' }}</h2>
    </div>

    <div v-else class="d-flex flex-column gap-3">
      <article v-for="r in items" :key="r.id" class="bg-white border rounded-4 p-3 p-md-4" data-testid="alert-card">
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
