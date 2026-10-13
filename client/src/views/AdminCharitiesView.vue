<script setup>
import { onMounted, ref, watch } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import ConfirmModal from '../components/ConfirmModal.vue';
import { formatDateTime } from '../utils/time';

const tab = ref('pending');
const items = ref([]);
const counts = ref({ pending: 0, approved: 0, rejected: 0 });
const loading = ref(true);
const error = ref('');
const flash = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/admin/charities', { params: { status: tab.value } });
    items.value = data.items;
    counts.value = data.counts;
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(tab, load);

// ---- deciding --------------------------------------------------------------------------------
const target = ref(null); // the charity being rejected
const note = ref('');
const noteError = ref('');
const busy = ref(false);

async function decide(charity, decision, reason = '') {
  busy.value = true;
  noteError.value = '';
  try {
    await api.post(`/admin/charities/${charity.id}/decision`, { decision, note: reason });
    flash.value = `${charity.name} was ${decision === 'approve' ? 'approved' : 'rejected'}.`;
    target.value = null;
    note.value = '';
    await load();
  } catch (e) {
    noteError.value = fieldErrors(e).note || errorMessage(e);
  } finally {
    busy.value = false;
  }
}
const tabs = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];
</script>

<template>
  <div class="mx-auto" style="max-width: 900px">
    <h1 class="h3 mb-1">Verify charities</h1>
    <p class="text-body-secondary">Check each registration number before approving. Approved charities can see every listing.</p>

    <div v-if="flash" class="alert alert-success alert-dismissible" role="status" data-testid="flash">
      {{ flash }}<button type="button" class="btn-close" aria-label="Dismiss" @click="flash = ''"></button>
    </div>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger ms-2" @click="load">Retry</button></div>

    <ul class="nav nav-pills mb-3" role="tablist">
      <li v-for="t in tabs" :key="t.key" class="nav-item" role="presentation">
        <button class="nav-link" :class="{ active: tab === t.key }" role="tab" :aria-selected="tab === t.key" :data-testid="`tab-${t.key}`" @click="tab = t.key">
          {{ t.label }} <span class="badge text-bg-light ms-1">{{ counts[t.key] }}</span>
        </button>
      </li>
    </ul>

    <div v-if="loading" class="text-center py-5"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div></div>

    <div v-else-if="!items.length" class="text-center py-5 bg-white border rounded-4" data-testid="empty-state">
      <div class="display-5 mb-2" aria-hidden="true">✅</div>
      <h2 class="h5">Nothing {{ tab }}</h2>
      <p class="text-body-secondary mb-0">{{ tab === 'pending' ? "You're all caught up." : 'Charities will appear here once you have reviewed them.' }}</p>
    </div>

    <ul v-else class="list-unstyled d-grid gap-3">
      <li v-for="c in items" :key="c.id" class="bg-white border rounded-4 p-3" data-testid="charity-row">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-semibold fs-5">{{ c.name }}</div>
            <dl class="row small mb-0 mt-1" style="max-width: 460px">
              <dt class="col-5 text-body-secondary fw-normal">Registration no.</dt><dd class="col-7 mb-1"><code data-testid="reg-no">{{ c.registrationNo }}</code></dd>
              <dt class="col-5 text-body-secondary fw-normal">Email</dt><dd class="col-7 mb-1">{{ c.email }}</dd>
              <dt v-if="c.phone" class="col-5 text-body-secondary fw-normal">Phone</dt><dd v-if="c.phone" class="col-7 mb-1">{{ c.phone }}</dd>
              <dt class="col-5 text-body-secondary fw-normal">Registered</dt><dd class="col-7 mb-1">{{ formatDateTime(c.createdAt) }}</dd>
              <template v-if="c.verification.note"><dt class="col-5 text-body-secondary fw-normal">Reason given</dt><dd class="col-7 mb-1">{{ c.verification.note }}</dd></template>
            </dl>
          </div>
          <div class="d-flex gap-2">
            <button v-if="tab !== 'approved'" type="button" class="btn btn-primary" :disabled="busy" :aria-label="`Approve ${c.name}`" @click="decide(c, 'approve')"><i class="bi bi-check-lg me-1" aria-hidden="true"></i>Approve</button>
            <button v-if="tab !== 'rejected'" type="button" class="btn btn-outline-danger" :disabled="busy" :aria-label="`Reject ${c.name}`" @click="target = c; note = ''; noteError = ''"><i class="bi bi-x-lg me-1" aria-hidden="true"></i>Reject</button>
          </div>
        </div>
      </li>
    </ul>

    <ConfirmModal v-if="target" :title="`Reject ${target.name}?`" confirm-text="Reject" danger :busy="busy" @confirm="decide(target, 'reject', note)" @cancel="target = null">
      <label for="reject-note" class="form-label small fw-semibold">Reason (shown to the charity)</label>
      <textarea id="reject-note" v-model="note" class="form-control" :class="{ 'is-invalid': noteError }" rows="3" maxlength="300" placeholder="e.g. We couldn't find this registration number."></textarea>
      <div class="invalid-feedback">{{ noteError }}</div>
    </ConfirmModal>
  </div>
</template>
