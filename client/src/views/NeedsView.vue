<script setup>
import NeedForm from './NeedsForm.vue';
import MyPledges from './MyPledges.vue';
import NeedCard from './NeedsCard.vue';

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import { useSession } from '../stores/session';

const session = useSession();
const isCharity = session.isCharity;
const isBakery = session.isBakery;

const needs = ref([]);
const loading = ref(true);
const pageError = ref('');

// One shared error/success message for pledging, editing and cancelling
const error = ref('');
const success = ref('');

// New-request alert (bakeries only)
const newRequestCount = ref(0);
const seenNeedIds = ref([]);
let firstLoadDone = false;

const dietaryOptions = ['vegetarian', 'vegan', 'halal', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free'];

const today = () => new Date().toLocaleDateString('en-CA');
const now = () => new Date().toTimeString().slice(0, 5);

const form = reactive({
  title: '',
  description: '',
  quantityTarget: 1,
  neededDate: today(),
  neededTime: now(),
  dietaryTags: [],
});
const submitting = ref(false);
const formError = ref('');
const successMessage = ref('');
const serverErrors = ref({});

// ---------- Charity: edit a need ----------
const editingNeedId = ref(null);
const editQuantities = reactive({});
const savingNeed = ref(false);

// ---------- Bakery: pledging ----------
const pledgeQuantities = reactive({});
const pledging = ref(false);

// ---------- Bakery: my pledges ----------
const myPledges = ref([]);
const editingPledgeId = ref(null);
const editPledgeQuantity = ref(1);
const savingPledge = ref(false);
const withdrawingPledgeId = ref(null);
const pledgeEditError = ref('');
const pledgeEditSuccess = ref('');

const isValidQuantity = (value) => Number.isInteger(Number(value)) && Number(value) >= 1;

async function loadNeeds() {
  pageError.value = '';

  try {
    const { data } = await api.get('/needs');
    const items = data.items ?? data.needs ?? [];
    const ids = items.map((need) => need.id ?? need._id);

    // Count requests we have not seen before (but not on the very first load)
    if (isBakery && firstLoadDone) {
      newRequestCount.value += ids.filter((id) => !seenNeedIds.value.includes(id)).length;
    }
    seenNeedIds.value = ids;
    firstLoadDone = true;

    needs.value = items;

    // Every need gets a default pledge quantity of 1
    items.forEach((need) => {
      if (pledgeQuantities[need.id] === undefined) pledgeQuantities[need.id] = 1;
    });
  } catch (err) {
    pageError.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function loadMyPledges() {
  if (!isBakery) return;

  try {
    const { data } = await api.get('/needs/pledges/mine');
    myPledges.value = data.items ?? [];
  } catch (err) {
    pledgeEditError.value = errorMessage(err);
  }
}

async function refreshAll() {
  await loadNeeds();
  await loadMyPledges();
}

// ---------- Charity: create ----------
function toggleDiet(tag) {
  const index = form.dietaryTags.indexOf(tag);
  if (index === -1) form.dietaryTags.push(tag);
  else form.dietaryTags.splice(index, 1);
}

function resetForm() {
  form.title = '';
  form.description = '';
  form.quantityTarget = 1;
  form.neededDate = today();
  form.neededTime = now();
  form.dietaryTags = [];
}

async function createNeed() {
  formError.value = '';
  successMessage.value = '';
  serverErrors.value = {};

  if (form.title.trim().length < 2) {
    formError.value = 'Please enter a title with at least 2 characters.';
    return;
  }
  if (!isValidQuantity(form.quantityTarget)) {
    formError.value = 'Enter a quantity of at least 1.';
    return;
  }

  const neededBy = new Date(`${form.neededDate}T${form.neededTime}`);
  if (!form.neededDate || !form.neededTime || Number.isNaN(neededBy.getTime()) || neededBy <= new Date()) {
    formError.value = 'Please choose a future date and time.';
    return;
  }

  submitting.value = true;
  try {
    await api.post('/needs', {
      title: form.title.trim(),
      description: form.description.trim(),
      quantityTarget: Number(form.quantityTarget),
      neededBy: neededBy.toISOString(),
      dietaryTags: form.dietaryTags,
    });

    resetForm();
    successMessage.value = 'Your need has been posted!';
    await loadNeeds();
  } catch (err) {
    serverErrors.value = fieldErrors(err);
    formError.value = Object.keys(serverErrors.value).length
      ? 'Please check the details and try again.'
      : errorMessage(err);
  } finally {
    submitting.value = false;
  }
}

// ---------- Charity: edit quantity / cancel ----------
function startEditing(need) {
  editingNeedId.value = need.id;
  editQuantities[need.id] = need.quantityTarget;
  error.value = '';
  success.value = '';
}

function stopEditing() {
  editingNeedId.value = null;
}

async function saveQuantity(need) {
  error.value = '';
  success.value = '';

  const quantity = Number(editQuantities[need.id]);

  if (!isValidQuantity(quantity)) {
    error.value = 'Enter a whole number greater than 0.';
    return;
  }
  if (quantity < need.quantityPledged) {
    error.value = `You already have ${need.quantityPledged} units pledged. The quantity cannot be lower than this.`;
    return;
  }

  savingNeed.value = true;
  try {
    await api.put(`/needs/${need.id}`, {
      title: need.title,
      description: need.description || '',
      quantityTarget: quantity,
      neededBy: new Date(need.neededBy).toISOString(),
      dietaryTags: need.dietaryTags || [],
    });

    editingNeedId.value = null;
    success.value = 'Request quantity updated!';
    await loadNeeds();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    savingNeed.value = false;
  }
}

async function cancelNeed(need) {
  if (!window.confirm('Cancel this request? Bakeries will see that it was cancelled.')) return;

  error.value = '';
  success.value = '';

  try {
    await api.delete(`/needs/${need.id}`);
    success.value = 'Your request has been cancelled.';
    await loadNeeds();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

// ---------- Bakery: pledge ----------
async function pledge(need) {
  error.value = '';
  success.value = '';

  const quantity = Number(pledgeQuantities[need.id]);

  if (!isValidQuantity(quantity)) {
    error.value = 'Please enter a whole number greater than 0.';
    return;
  }
  if (quantity > need.quantityRemaining) {
    error.value = `Only ${need.quantityRemaining} more units are needed for this request.`;
    return;
  }

  pledging.value = true;
  try {
    await api.post(`/needs/${need.id}/pledge`, { quantity });
    success.value = 'Your pledge has been submitted!';
    await loadNeeds();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    pledging.value = false;
  }
}

// ---------- Bakery: edit / withdraw a pledge ----------
function startEditingPledge(item) {
  editingPledgeId.value = item.id;
  editPledgeQuantity.value = item.quantity;
  pledgeEditError.value = '';
  pledgeEditSuccess.value = '';
}

function stopEditingPledge() {
  editingPledgeId.value = null;
  pledgeEditError.value = '';
}

async function savePledgeQuantity(item) {
  pledgeEditError.value = '';
  pledgeEditSuccess.value = '';

  if (!isValidQuantity(editPledgeQuantity.value)) {
    pledgeEditError.value = 'Enter a whole number greater than 0.';
    return;
  }

  savingPledge.value = true;
  try {
    await api.put(`/needs/pledges/${item.id}`, { quantity: Number(editPledgeQuantity.value) });

    editingPledgeId.value = null;
    pledgeEditSuccess.value = 'Pledge quantity updated!';
    await refreshAll();
  } catch (err) {
    pledgeEditError.value = errorMessage(err);
  } finally {
    savingPledge.value = false;
  }
}

async function withdrawPledge(item) {
  if (!window.confirm('Are you sure you want to withdraw this pledge?')) return;

  pledgeEditError.value = '';
  pledgeEditSuccess.value = '';
  withdrawingPledgeId.value = item.id;

  try {
    await api.post(`/needs/pledges/${item.id}/withdraw`);
    pledgeEditSuccess.value = 'Your pledge has been withdrawn!';
    await refreshAll();
  } catch (err) {
    pledgeEditError.value = errorMessage(err);
  } finally {
    withdrawingPledgeId.value = null;
  }
}

// ---------- Auto refresh every 30 seconds ----------
let pollingTimer = null;

onMounted(async () => {
  await refreshAll();
  pollingTimer = window.setInterval(refreshAll, 30000);
});

onBeforeUnmount(() => {
  window.clearInterval(pollingTimer);
});
</script>

<template>
  <div class="mx-auto" style="max-width: 1100px">
    <div class="mb-4">
      <h1 class="h3">Charity Needs Board</h1>
      <p class="text-body-secondary">
        Charities can share their food needs, and bakeries can pledge surplus food to help meet them.
      </p>
    </div>

    <!-- Charity: post a new need -->
    <NeedForm
      v-if="isCharity"
      :form="form"
      :dietary-options="dietaryOptions"
      :form-error="formError"
      :success-message="successMessage"
      :server-errors="serverErrors"
      :submitting="submitting"
      :get-today="today"
      @submit="createNeed"
      @toggle-diet="toggleDiet"
    />

    <!-- Bakery: new request alert -->
    <div
      v-if="isBakery && newRequestCount > 0"
      class="alert alert-danger d-flex align-items-center justify-content-between"
      role="alert"
    >
      <span>
        <strong>{{ newRequestCount }}</strong>
        new charity request{{ newRequestCount === 1 ? '' : 's' }} available!
      </span>
      <button class="btn-close" aria-label="Dismiss alert" @click="newRequestCount = 0"></button>
    </div>

    <!-- Messages -->
    <div v-if="pageError" class="alert alert-danger" role="alert">
      {{ pageError }}
      <button class="btn btn-sm btn-outline-danger ms-2" @click="loadNeeds">Retry</button>
    </div>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <div v-if="success" class="alert alert-success" role="status">{{ success }}</div>

    <!-- Bakery: my pledges -->
    <MyPledges
      v-if="isBakery"
      :my-pledges="myPledges"
      :editing-pledge-id="editingPledgeId"
      :edit-pledge-quantity="editPledgeQuantity"
      :saving-pledge="savingPledge"
      :pledge-edit-error="pledgeEditError"
      :pledge-edit-success="pledgeEditSuccess"
      :withdrawing-pledge-id="withdrawingPledgeId"
      @update:edit-pledge-quantity="editPledgeQuantity = $event"
      @start-edit="startEditingPledge"
      @stop-edit="stopEditingPledge"
      @save-quantity="savePledgeQuantity"
      @withdraw="withdrawPledge"
    />

    <!-- Needs list -->
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-secondary" role="status">
        <span class="visually-hidden">Loading requests…</span>
      </div>
    </div>

    <div v-else-if="!pageError && needs.length === 0" class="bg-white border rounded-4 p-5 text-center">
      <h2 class="h5">No open requests yet</h2>
      <p class="text-body-secondary mb-0">New charity requests will appear here.</p>
    </div>

    <div v-else class="row g-3">
      <div v-for="need in needs" :key="need.id" class="col-12 col-lg-6">
        <NeedCard
          :need="need"
          :is-charity="isCharity"
          :is-bakery="isBakery"
          :editing-need-id="editingNeedId"
          :edit-quantities="editQuantities"
          :saving-need="savingNeed"
          :pledge-quantities="pledgeQuantities"
          :pledging="pledging"
          @start-edit="startEditing"
          @stop-edit="stopEditing"
          @save-quantity="saveQuantity"
          @cancel-need="cancelNeed"
          @pledge="pledge"
        />
      </div>
    </div>
  </div>
</template>