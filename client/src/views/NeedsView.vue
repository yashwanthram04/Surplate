<script setup>
// ---------- 1. Imports ----------
import BouncingHeading from '../components/BouncingHeading.vue';
import SiteBanner from '../components/SiteBanner.vue';
import BreadConfetti from '../components/BreadConfetti.vue';
import NeedsConfirmBox from '../components/NeedsConfirmBox.vue';
import NeedForm from './NeedsForm.vue';
import MyPledges from './MyPledges.vue';
import NeedCard from './NeedsCard.vue';

import CountUp from '../components/home/CountUp.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { gsap } from 'gsap'; // GSAP = animation library
import { api, errorMessage, fieldErrors } from '../api';
import { useEntrance, useListMotion } from '../composables/useMotion';
import { useSession } from '../stores/session';

const session = useSession();
const isCharity = computed(() => session.isCharity);
const isBakery = computed(() => session.isBakery);

// ---------- 2. Variables ----------
// The list of needs from the server
const needs = ref([]);
const loading = ref(true); // true = show the loading box
const pageError = ref(''); // error when the list fails to load

// One red message and one green message for most actions
const error = ref('');
const success = ref('');

// Red banner for bakeries: "new charity request available"
const newRequestCount = ref(0);
const seenNeedIds = ref([]); // ids of needs we already saw
let firstLoadDone = false; // we don't count the very first load

// Charity: the "post a need" form
const dietaryOptions = ['vegetarian', 'vegan', 'halal', 'gluten-free', 'dairy-free', 'nut-free', 'egg-free'];

function getToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 5 -> "05"
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
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
const submitting = ref(false);
const formError = ref('');
const successMessage = ref('');
const serverErrors = ref({});

// Charity: editing / cancelling a need
const editingNeedId = ref(null); // which card is in edit mode
const editQuantities = reactive({});
const savingNeed = ref(false);
const needToCancel = ref(null); // the need waiting for "yes, cancel it"

// Bakery: pledging
const pledgeQuantities = reactive({}); // how many units typed on each card
const pledging = ref(false);

// Bakery: my pledges
const myPledges = ref([]);
const editingPledgeId = ref(null);
const editPledgeQuantity = ref(1);
const savingPledge = ref(false);
const withdrawingPledgeId = ref(null);
const pledgeToWithdraw = ref(null);
const pledgeEditError = ref('');
const pledgeEditSuccess = ref('');

// ---------- 3. Animations (GSAP) ----------
// The bread confetti component (so we can call burst.value.celebrate())
const burst = ref(null);

// The page settles in; cards rise one after another and glide to their new places when a filter changes the list
// (shared with the browse board, see composables/useMotion.js).
const page = ref(null);
const grid = ref(null);
useEntrance(page);

// When the red banner appears, drop it in from the top
watch(newRequestCount, async (count) => {
  if (count === 0) return;
  await nextTick();
  gsap.from('.new-banner', { opacity: 0, y: -20, duration: 0.4 });
});

// ---------- 4. Loading data from the server ----------
function isValidQuantity(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1;
}

async function loadNeeds() {
  pageError.value = '';

  try {
    const { data } = await api.get('/needs');
    const items = data.items ?? data.needs ?? [];

    // Charities also ask for their OWN needs, which include the bakeries who pledged
    if (isCharity.value) {
      const mine = await api.get('/needs/mine');
      const pledgesByNeed = {}; // needId -> list of pledges
      for (const myNeed of mine.data.items) {
        pledgesByNeed[myNeed.id] = myNeed.pledges;
      }
      for (const need of items) {
        need.pledges = pledgesByNeed[need.id] ?? []; // other charities' needs get an empty list
      }
    }

    // Count needs we have not seen before (bakeries only, never on the first load)
    const ids = items.map((need) => need.id ?? need._id);
    if (isBakery.value && firstLoadDone) {
      for (const id of ids) {
        if (!seenNeedIds.value.includes(id)) {
          newRequestCount.value = newRequestCount.value + 1;
        }
      }
    }
    seenNeedIds.value = ids;
    firstLoadDone = true;

    needs.value = items;

    // Every card starts with a pledge quantity of 1
    for (const need of items) {
      if (pledgeQuantities[need.id] === undefined) {
        pledgeQuantities[need.id] = 1;
      }
    }
  } catch (err) {
    pageError.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function loadMyPledges() {
  if (!isBakery.value) return; // only bakeries have pledges
  try {
    const { data } = await api.get('/needs/pledges/mine');
    myPledges.value = data.items ?? [];
  } catch (err) {
    pledgeEditError.value = errorMessage(err);
  }
}

// Load both lists
async function refreshAll() {
  await loadNeeds();
  await loadMyPledges();
}

// ---------- Status filter ----------
// "Pending" = still open on the server.
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Pending' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];
const statusFilter = ref('all');
const statusCounts = computed(() => {
  const counts = { all: needs.value.length, open: 0, fulfilled: 0, cancelled: 0 };
  for (const need of needs.value) {
    if (counts[need.status] !== undefined) counts[need.status] += 1;
  }
  return counts;
});
const filteredNeeds = computed(() =>
  statusFilter.value === 'all' ? needs.value : needs.value.filter((need) => need.status === statusFilter.value),
);

// Glide watches the ids (not the array), so the 30-second refresh does not replay it.
const listKey = computed(() => filteredNeeds.value.map((need) => need.id).join(','));
const cardMotion = useListMotion(grid, listKey);

// Numbers for the strip at the top (open requests only, so they match what bakeries can act on).
const statTiles = computed(() => {
  const open = needs.value.filter((need) => need.status === 'open');
  return [
    { icon: 'bi-megaphone', bg: '#fde68a', value: open.length, label: 'open requests' },
    { icon: 'bi-basket2', bg: '#bfdbfe', value: open.reduce((sum, need) => sum + need.quantityRemaining, 0), label: 'units still needed' },
    { icon: 'bi-heart-fill', bg: '#bbf7d0', value: needs.value.reduce((sum, need) => sum + (need.status === 'cancelled' ? 0 : need.quantityPledged), 0), label: 'units pledged so far' },
  ];
});
const hasAside = computed(() => isCharity.value || isBakery.value);

// ---------- 5. Charity actions ----------
// Tick / untick a dietary tag
function toggleDiet(tag) {
  const position = form.dietaryTags.indexOf(tag);
  if (position === -1) {
    form.dietaryTags.push(tag); // not ticked yet -> add it
  } else {
    form.dietaryTags.splice(position, 1); // already ticked -> remove it
  }
}

// Post a new need
async function createNeed() {
  formError.value = '';
  successMessage.value = '';
  serverErrors.value = {};

  // Check the form first
  if (form.title.trim().length < 2) {
    formError.value = 'Please enter a title with at least 2 characters.';
    return;
  }
  if (!isValidQuantity(form.quantityTarget)) {
    formError.value = 'Enter a quantity of at least 1.';
    return;
  }

  const neededBy = new Date(`${form.neededDate}T${form.neededTime}`);
  if (Number.isNaN(neededBy.getTime()) || neededBy <= new Date()) {
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

    // Clear the form
    form.title = '';
    form.description = '';
    form.quantityTarget = 1;
    form.neededDate = getToday();
    form.neededTime = getCurrentTime();
    form.dietaryTags = [];

    successMessage.value = 'Your need has been posted!';
    burst.value?.celebrate(); // the breads fly up
    await loadNeeds();
  } catch (err) {
    serverErrors.value = fieldErrors(err);
    if (Object.keys(serverErrors.value).length > 0) {
      formError.value = 'Please check the details and try again.';
    } else {
      formError.value = errorMessage(err);
    }
  } finally {
    submitting.value = false;
  }
}

// Open edit mode on a card
function startEditing(need) {
  editingNeedId.value = need.id;
  editQuantities[need.id] = need.quantityTarget;
  error.value = '';
  success.value = '';
}

// Close edit mode
function stopEditing() {
  editingNeedId.value = null;
}

// Save the new quantity
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

// Cancel a need - step 1: the "Cancel" button only opens our own confirm box
function cancelNeed(need) {
  needToCancel.value = need;
}

// Cancel a need - step 2: the box's "Yes" button does the real cancel
async function confirmCancelNeed() {
  const need = needToCancel.value;
  needToCancel.value = null; // close the box

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

// ---------- 6. Bakery actions ----------

// Pledge food to a need
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
    burst.value?.celebrate();
    await refreshAll();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    pledging.value = false;
  }
}

// Open edit mode on one of my pledges
function startEditingPledge(item) {
  editingPledgeId.value = item.id;
  editPledgeQuantity.value = item.quantity;
  pledgeEditError.value = '';
  pledgeEditSuccess.value = '';
}

// Close edit mode
function stopEditingPledge() {
  editingPledgeId.value = null;
  pledgeEditError.value = '';
}

// Save the new pledge quantity
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

// Withdraw a pledge - step 1: only open our own confirm box
function askWithdraw(item) {
  pledgeToWithdraw.value = item;
}

// Withdraw a pledge - step 2: the box's "Yes" button does the real withdraw
async function confirmWithdraw() {
  const item = pledgeToWithdraw.value;
  pledgeToWithdraw.value = null; // close the box

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

// ---------- 7. Auto refresh every 30 seconds ----------
let pollingTimer = null;

onMounted(async () => {
  await refreshAll();
  pollingTimer = window.setInterval(refreshAll, 30000);
});

// Stop the timer when we leave the page
onBeforeUnmount(() => {
  window.clearInterval(pollingTimer);
});
</script>

<template>
  <div ref="page" class="needs-page">
    <!-- The team's shared banner + heading (same look as the other pages) -->
    <div class="banner-wrap mb-3" data-enter>
      <SiteBanner icon="bi-heart-fill">
        <div class="mb-4">
          <BouncingHeading class="h3 needs-heading" text="Charity Needs Board" />
          <p class="text-body-secondary">
            Charities can share their food needs, and bakeries can pledge surplus food to help meet them.
          </p>
        </div>
      </SiteBanner>
    </div>

    <div class="needs-board mx-auto">
      <!-- Live numbers -->
      <div v-if="!loading && needs.length > 0" class="row g-3 mb-4" data-testid="needs-stats">
        <div v-for="tile in statTiles" :key="tile.label" class="col-12 col-sm-4" data-enter>
          <div class="stat-card">
            <span class="stat-icon" :style="{ background: tile.bg }" aria-hidden="true"><i class="bi" :class="tile.icon"></i></span>
            <div>
              <div class="stat-value font-display"><CountUp :value="tile.value" :duration="1100" /></div>
              <div class="stat-label">{{ tile.label }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bakery only: red banner when new requests arrive -->
      <div
        v-if="isBakery && newRequestCount > 0"
        class="new-banner alert alert-danger d-flex align-items-center justify-content-between"
        role="alert"
      >
        <span>
          <strong>{{ newRequestCount }}</strong>
          new charity request{{ newRequestCount === 1 ? '' : 's' }} available!
        </span>
        <button class="btn-close" aria-label="Dismiss alert" @click="newRequestCount = 0"></button>
      </div>

      <div class="row g-4 align-items-start">
        <!-- Left: the form (charities) or the bakery's own pledges -->
        <aside v-if="hasAside" class="col-12 col-lg-4" data-enter>
          <div class="needs-aside">
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
              @dismiss-success="successMessage = ''"
            />

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
              @withdraw="askWithdraw"
            />
          </div>
        </aside>

        <!-- Right: the requests -->
        <section class="col-12" :class="{ 'col-lg-8': hasAside }" aria-label="Food requests">
          <!-- Messages -->
          <div v-if="pageError" class="alert alert-danger" role="alert">
            {{ pageError }}
            <button class="btn btn-sm btn-outline-danger ms-2" @click="loadNeeds">Retry</button>
          </div>
          <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
          <div v-if="success" class="alert alert-success" role="status">🍞 {{ success }}</div>

          <!-- Loading -->
          <div v-if="loading" class="state-card">
            <div class="bread-bounce bread-huge">🍞</div>
            <p class="text-body-secondary mb-0">Baking your requests…</p>
          </div>

          <!-- No needs yet -->
          <div v-else-if="!pageError && needs.length === 0" class="state-card">
            <div class="bread-bounce bread-huge">🥐</div>
            <h2 class="h5">No open requests yet</h2>
            <p class="text-body-secondary mb-0">New charity requests will appear here.</p>
          </div>

          <!-- Status filter -->
          <div v-else-if="needs.length > 0" class="filter-pills mb-3" role="group" aria-label="Filter requests by status">
            <button
              v-for="f in STATUS_FILTERS"
              :key="f.value"
              type="button"
              class="pill"
              :class="{ 'is-active': statusFilter === f.value }"
              :aria-pressed="statusFilter === f.value"
              :data-testid="`needs-filter-${f.value}`"
              @click="statusFilter = f.value"
            >
              {{ f.label }} ({{ statusCounts[f.value] }})
            </button>
          </div>

          <div v-if="!loading && needs.length > 0 && filteredNeeds.length === 0" class="state-card">
            <p class="text-body-secondary mb-0">No {{ STATUS_FILTERS.find((f) => f.value === statusFilter).label.toLowerCase() }} requests.</p>
          </div>

          <!-- The list of need cards: they rise in one after another and glide when a filter changes the list -->
          <TransitionGroup
            v-if="!loading && needs.length > 0"
            ref="grid"
            tag="div"
            :css="false"
            appear
            class="row g-3 position-relative"
            @before-enter="cardMotion.onBeforeEnter"
            @enter="cardMotion.onEnter"
            @leave="cardMotion.onLeave"
          >
            <div
              v-for="(need, i) in filteredNeeds"
              :key="need.id"
              class="need-item col-12"
              :class="hasAside ? 'col-xl-6' : 'col-md-6 col-xl-4'"
              :data-index="i"
              :data-testid="`need-${need.id}`"
            >
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
          </TransitionGroup>
        </section>
      </div>
    </div>

    <BreadConfetti ref="burst" />

    <!-- "Are you sure?" boxes (only visible when something is waiting inside them) -->
    <NeedsConfirmBox
      :show="needToCancel !== null"
      title="Cancel this request?"
      message="Bakeries will see that it was cancelled."
      yes-text="Yes, cancel request"
      no-text="Keep request"
      @yes="confirmCancelNeed"
      @no="needToCancel = null"
    />

    <NeedsConfirmBox
      :show="pledgeToWithdraw !== null"
      title="Withdraw this pledge?"
      message="The charity will see that your units are no longer promised."
      yes-text="Yes, withdraw"
      no-text="Keep pledge"
      @yes="confirmWithdraw"
      @no="pledgeToWithdraw = null"
    />
  </div>
</template>

<style scoped>
.needs-board { max-width: 1300px; }

/* The strip of live numbers */
.stat-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  height: 100%;
  padding: 1rem 1.2rem;
  background: #fff;
  border: 1px solid #e8e4da;
  border-radius: 1.1rem;
  box-shadow: 0 1px 2px rgba(40, 60, 40, 0.04);
  transition: transform 0.25s, box-shadow 0.25s;
}
.stat-card:hover { transform: translateY(-3px); box-shadow: 0 14px 28px -14px rgba(40, 60, 40, 0.25); }
.stat-icon { display: grid; place-items: center; width: 2.8rem; height: 2.8rem; border-radius: 0.9rem; font-size: 1.2rem; color: #1f3d2b; }
.stat-value { font-size: 1.9rem; font-weight: 600; line-height: 1; color: var(--sp-green-dark); }
.stat-label { margin-top: 0.15rem; font-size: 0.85rem; color: #6b7a70; }

/* On wide screens the form (or pledges) stays in view while the requests scroll */
@media (min-width: 992px) {
  .needs-aside { position: sticky; top: 5rem; max-height: calc(100vh - 6.5rem); overflow-y: auto; padding: 4px; margin: -4px; }
}

/* Status filter: pill buttons */
.filter-pills { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.pill {
  padding: 0.35rem 0.95rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #3a4a40;
  background: #fff;
  border: 1px solid #ddd8cb;
  border-radius: 99px;
  transition: background 0.2s, color 0.2s, border-color 0.2s, transform 0.15s;
}
.pill:hover { border-color: var(--sp-green); transform: translateY(-1px); }
.pill.is-active { color: #fff; background: var(--sp-green); border-color: var(--sp-green); }
.pill:focus-visible { outline: 3px solid var(--bs-focus-ring-color); outline-offset: 1px; }

/* Loading and empty boxes */
.state-card { padding: 2.5rem 1rem; margin-bottom: 1rem; text-align: center; background: #fff; border: 1px solid #e8e4da; border-radius: 1.1rem; }

/* The bread (loading and empty boxes) hops up and down */
.bread-huge { font-size: 4rem; }
.bread-bounce { display: inline-block; animation: hop 1.2s ease-in-out infinite; }
@keyframes hop {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-10px) rotate(4deg); }
}

@media (prefers-reduced-motion: reduce) {
  .bread-bounce { animation: none; }
  .stat-card,
  .pill { transition: none; }
  .stat-card:hover,
  .pill:hover { transform: none; }
}

/* Make the green banner the same width as the board */
.banner-wrap { max-width: 1300px; margin-left: auto; margin-right: auto; }
</style>
