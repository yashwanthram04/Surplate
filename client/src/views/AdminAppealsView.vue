<script setup>
import { onMounted, ref, watch } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import ConfirmModal from '../components/ConfirmModal.vue';
import ReliabilityGauge from '../components/ReliabilityGauge.vue';
import { formatDateTime } from '../utils/time';

// Admins review blocked recipients' appeals. Approving lifts the block for a week; declining needs a reason
// the recipient will see.
const tab = ref('pending');
const items = ref([]);
const counts = ref({ pending: 0, approved: 0, denied: 0 });
const loading = ref(true);
const error = ref('');
const flash = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/appeals', { params: { status: tab.value } });
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

const target = ref(null); // the appeal being declined
const note = ref('');
const noteError = ref('');
const busy = ref(false);

async function decide(appeal, decision, reason = '') {
  busy.value = true;
  noteError.value = '';
  try {
    await api.post(`/appeals/${appeal.id}/decision`, { decision, note: reason });
    flash.value = `${appeal.userName}’s appeal was ${decision === 'approve' ? 'approved: they can reserve for the next 7 days' : 'declined'}.`;
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
  { key: 'denied', label: 'Declined' },
];
</script>

<template>
  <div class="mx-auto" style="max-width: 900px">
    <h1 class="h3 mb-1">Block appeals</h1>
    <p class="text-body-secondary">Recipients are blocked from reserving after repeated missed pickups. Approving lets them reserve again (one at a time) for 7 days.</p>

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
      <div class="display-5 mb-2" aria-hidden="true">🕊️</div>
      <h2 class="h5">No {{ tab === 'denied' ? 'declined' : tab }} appeals</h2>
      <p class="text-body-secondary mb-0">{{ tab === 'pending' ? "You're all caught up." : 'Decisions you make will appear here.' }}</p>
    </div>

    <TransitionGroup v-else name="rate" tag="ul" class="rate-list list-unstyled d-grid gap-3">
      <li v-for="a in items" :key="a.id" class="bg-white border rounded-4 p-3" data-testid="appeal-row">
        <div class="d-flex flex-wrap gap-3 align-items-start">
          <ReliabilityGauge :score="a.snapshot?.score ?? null" :size="84" />
          <div class="flex-grow-1" style="min-width: 220px">
            <div class="fw-semibold fs-5">{{ a.userName }} <span class="badge text-bg-light border fw-normal fs-6">{{ a.userRole }}</span></div>
            <div class="small text-body-secondary mb-2">{{ a.snapshot?.missed }} missed of {{ a.snapshot?.recent }} recent pickups · filed {{ formatDateTime(a.createdAt) }}</div>
            <blockquote class="appeal-quote mb-2">{{ a.reason }}</blockquote>
            <div v-if="a.status !== 'pending'" class="small">
              <strong>{{ a.status === 'approved' ? 'Approved' : 'Declined' }}</strong> {{ formatDateTime(a.decidedAt) }}<template v-if="a.adminNote"> · “{{ a.adminNote }}”</template>
              <template v-if="a.waivedUntil"> · lifted until {{ formatDateTime(a.waivedUntil) }}</template>
            </div>
          </div>
          <div v-if="a.status === 'pending'" class="d-flex gap-2">
            <button type="button" class="btn btn-primary" :disabled="busy" :aria-label="`Approve ${a.userName}’s appeal`" data-testid="approve" @click="decide(a, 'approve')"><i class="bi bi-check-lg me-1" aria-hidden="true"></i>Approve</button>
            <button type="button" class="btn btn-outline-danger" :disabled="busy" :aria-label="`Decline ${a.userName}’s appeal`" data-testid="deny" @click="target = a; note = ''; noteError = ''"><i class="bi bi-x-lg me-1" aria-hidden="true"></i>Decline</button>
          </div>
        </div>
      </li>
    </TransitionGroup>

    <ConfirmModal v-if="target" :title="`Decline ${target.userName}’s appeal?`" confirm-text="Decline" danger :busy="busy" @confirm="decide(target, 'deny', note)" @cancel="target = null">
      <label for="deny-note" class="form-label small fw-semibold">Reason (shown to them)</label>
      <textarea id="deny-note" v-model="note" class="form-control" :class="{ 'is-invalid': noteError }" rows="3" maxlength="300" placeholder="e.g. Please send proof of the hospital stay."></textarea>
      <div class="invalid-feedback">{{ noteError }}</div>
    </ConfirmModal>
  </div>
</template>
