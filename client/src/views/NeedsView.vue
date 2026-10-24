<script setup>
import NeedForm from './NeedsForm.vue';
import MyPledges from './MyPledges.vue';
import NeedCard from './NeedsCard.vue';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { api, errorMessage, fieldErrors } from '../api';
import { useSession } from '../stores/session';

const session = useSession();

const needs = ref([]);
const loading = ref(true);
const submitting = ref(false);
const pageError = ref('');
const formError = ref('');
const successMessage = ref('');
const serverErrors = ref({});

const pledgeQuantities = reactive({});
const pledgeError = ref('');
const pledgeSuccess = ref('');
const pledging = ref(false);

const newRequestCount = ref(0);
const seenNeedIds = ref([]);
const hasLoadedNeeds = ref(false);

const editingNeedId = ref(null);
const editQuantities = reactive({});
const savingNeed = ref(false);
const actionError = ref('');
const actionSuccess = ref('');

const myPledges = ref([]);
const editingPledgeId = ref(null);
const editPledgeQuantity = ref(1);
const savingPledge = ref(false);
const pledgeEditError = ref('');
const pledgeEditSuccess = ref('');

let pollingTimer = null;


function getToday() {
  const now = new Date();
  return formatDate(now);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const form = reactive({
  title: '',
  description: '',
  quantityTarget: 1,
  neededDate: getToday(),
  neededTime: getCurrentTime(),
  dietaryTags: [],
});


const dietaryOptions = [
  'vegetarian',
  'vegan',
  'halal',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'egg-free',
];


const isCharity = computed(() => session.isCharity);
const isBakery = computed(() => session.isBakery);



async function loadNeeds() {
  pageError.value = '';

  try {
    const { data } = await api.get('/needs');
    const items = data.items ?? data.needs ?? [];

    if (isBakery.value && hasLoadedNeeds.value) {
    const newItems = items.filter(
        (need) =>
        !seenNeedIds.value.includes(need.id ?? need._id)
    );

    newRequestCount.value += newItems.length;
    }

    seenNeedIds.value = items.map(
    (need) => need.id ?? need._id
    );

    hasLoadedNeeds.value = true;

    needs.value = items;

    needs.value.forEach((need) => {
      if (pledgeQuantities[need.id] === undefined) {
        pledgeQuantities[need.id] = 1;
      }
    });
  } catch (err) {
    pageError.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}


function toggleDiet(tag) {
  const index = form.dietaryTags.indexOf(tag);

  if (index === -1) {
    form.dietaryTags.push(tag);
  } else {
    form.dietaryTags.splice(index, 1);
  }
}

async function createNeed() {
  formError.value = '';
  successMessage.value = '';
  serverErrors.value = {};

  if (form.title.trim().length < 2) {
    formError.value = 'Please enter a title with at least 2 characters.';
    return;
  }

  if (
    !Number.isInteger(Number(form.quantityTarget)) ||
    Number(form.quantityTarget) < 1
  ) {
    formError.value = 'Enter a quantity of at least 1.';
    return;
  }

  const neededBy = new Date(
    `${form.neededDate}T${form.neededTime}`
  );

  if (
    !form.neededDate || !form.neededTime || Number.isNaN(neededBy.getTime()) || neededBy <= new Date()) {
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

    form.title = '';
    form.description = '';
    form.quantityTarget = 1;
    form.neededDate = getToday();
    form.neededTime = getCurrentTime();
    form.dietaryTags = [];

    successMessage.value = 'Your need has been posted!';
    await loadNeeds();
  } catch (err) {
    const fields = fieldErrors(err);
    serverErrors.value = fields;
    formError.value = Object.keys(fields).length ? 'Please check the details and try again.' : errorMessage(err);
  } finally {
    submitting.value = false;
  }
}


async function pledge(need) {
  pledgeError.value = '';
  pledgeSuccess.value = '';

  const quantity = Number(pledgeQuantities[need.id]);

  if (!Number.isInteger(quantity) || quantity < 1) {
    pledgeError.value = 'Please enter a whole number greater than 0.';
    return;
  }

  if (quantity > need.quantityRemaining) {
    pledgeError.value =
      `Only ${need.quantityRemaining} more units are needed for this request.`;
    return;
  }

  pledging.value = true;

  try {
    await api.post(`/needs/${need.id}/pledge`, { quantity });
    pledgeSuccess.value = 'Your pledge has been submitted!';
    await loadNeeds();
  } catch (err) {
    pledgeError.value = errorMessage(err);
  } finally {
    pledging.value = false;
  }
}


async function loadMyPledges() {
  if (!isBakery.value) return;

  try {
    const { data } = await api.get('/needs/pledges/mine');
    myPledges.value = data.items ?? [];
  } catch (err) {
    pledgeEditError.value = errorMessage(err);
  }
}

function startEditingPledge(pledge) {
  editingPledgeId.value = pledge.id;
  editPledgeQuantity.value = pledge.quantity;
  pledgeEditError.value = '';
  pledgeEditSuccess.value = '';
}

function stopEditingPledge() {
  editingPledgeId.value = null;
  pledgeEditError.value = '';
}

async function savePledgeQuantity(pledge) {
  const quantity = Number(editPledgeQuantity.value);

  if (!Number.isInteger(quantity) || quantity < 1) {
    pledgeEditError.value = 'Enter a whole number greater than 0.';
    return;
  }

  savingPledge.value = true;
  pledgeEditError.value = '';
  pledgeEditSuccess.value = '';

  try {
    await api.put(`/needs/pledges/${pledge.id}`, { quantity });

    editingPledgeId.value = null;
    pledgeEditSuccess.value = 'Pledge quantity updated!';

    await loadMyPledges();
    await loadNeeds();
  } catch (err) {
    pledgeEditError.value = errorMessage(err);
  } finally {
    savingPledge.value = false;
  }
}

function startEditing(need) {
  editingNeedId.value = need.id;
  editQuantities[need.id] = need.quantityTarget;
  actionError.value = '';
  actionSuccess.value = '';
}

function stopEditing() {
  editingNeedId.value = null;
}

async function saveQuantity(need) {
  actionError.value = '';
  actionSuccess.value = '';

  const quantity = Number(editQuantities[need.id]);

  if (!Number.isInteger(quantity) || quantity < 1) {
    actionError.value = 'Enter a whole number greater than 0.';
    return;
  }

  if (quantity < need.quantityPledged) {
    actionError.value =
      `You already have ${need.quantityPledged} units pledged. The quantity cannot be lower than this.`;
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
    actionSuccess.value = 'Request quantity updated!';
    await loadNeeds();
  } catch (err) {
    actionError.value = errorMessage(err);
  } finally {
    savingNeed.value = false;
  }
}

async function cancelNeed(need) {
  const confirmed = window.confirm(
    'Cancel this request? Bakeries will see that it was cancelled.'
  );

  if (!confirmed) return;

  actionError.value = '';
  actionSuccess.value = '';

  try {
    await api.delete(`/needs/${need.id}`);
    actionSuccess.value = 'Your request has been cancelled.';
    await loadNeeds();
  } catch (err) {
    actionError.value = errorMessage(err);
  }
}

onMounted(async () => {
  await loadNeeds();
  await loadMyPledges();

  pollingTimer = window.setInterval(async () => {
    await loadNeeds();
    await loadMyPledges();
  }, 30000);
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


    <NeedForm
        v-if="isCharity"
        :form="form"
        :dietary-options="dietaryOptions"
        :form-error="formError"
        :success-message="successMessage"
        :server-errors="serverErrors"
        :submitting="submitting"
        :get-today="getToday"
        @submit="createNeed"
        @toggle-diet="toggleDiet"
    />


    <div v-if="isBakery && newRequestCount > 0"
        class="alert alert-danger d-flex align-items-center justify-content-between"
        role="alert">

        <span>
            <strong>{{ newRequestCount }}</strong>
            new charity request{{ newRequestCount === 1 ? '' : 's' }} available!
        </span>

        <button
            class="btn-close"
            aria-label="Dismiss alert"
            @click="newRequestCount = 0">
        </button>
    </div>

    <div v-if="pageError" class="alert alert-danger" role="alert">
      {{ pageError }}
      <button class="btn btn-sm btn-outline-danger ms-2" @click="loadNeeds">
        Retry
      </button>
    </div>

    <div v-if="actionError" class="alert alert-danger" role="alert">
    {{ actionError }}
    </div>

    <div v-if="actionSuccess" class="alert alert-success" role="status">
    {{ actionSuccess }}
    </div>


    <div v-if="pledgeError" class="alert alert-danger" role="alert">
    {{ pledgeError }}
    </div>

    <div v-if="pledgeSuccess" class="alert alert-success" role="status">
    {{ pledgeSuccess }}
    </div>

    <!-- Bakery's own pledges -->
    <MyPledges
        v-if="isBakery"
        :my-pledges="myPledges"
        :editing-pledge-id="editingPledgeId"
        :edit-pledge-quantity="editPledgeQuantity"
        :saving-pledge="savingPledge"
        :pledge-edit-error="pledgeEditError"
        :pledge-edit-success="pledgeEditSuccess"
        @update:edit-pledge-quantity="editPledgeQuantity = $event"
        @start-edit="startEditingPledge"
        @stop-edit="stopEditingPledge"
        @save-quantity="savePledgeQuantity"/>
    

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-secondary" role="status">
        <span class="visually-hidden">Loading requests…</span>
      </div>
    </div>

    <div v-else-if="!pageError && needs.length === 0"
      class="bg-white border rounded-4 p-5 text-center">
      <h2 class="h5">No open requests yet</h2>
      <p class="text-body-secondary mb-0">
        New charity requests will appear here.
      </p>
    </div>

    
    <div v-else class="row g-3">
        <div
            v-for="need in needs"
            :key="need.id"
            class="col-12 col-lg-6">
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