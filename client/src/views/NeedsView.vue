<script setup>
// =====================================================
// NeedsView.vue = the "Charity Needs Board" page
//
// Charities: post needs, edit the quantity, cancel needs
// Bakeries:  pledge food, edit / withdraw their pledges
//
// The form, the cards and "my pledges" live in their own files:
//   NeedsForm.vue / NeedsCard.vue / MyPledges.vue
// =====================================================

// ---------- 1. Imports ----------
// (BouncingHeading + SiteBanner are the team's shared look: they must stay as they are)
import BouncingHeading from '../components/BouncingHeading.vue';
import SiteBanner from '../components/SiteBanner.vue';
import BreadConfetti from '../components/BreadConfetti.vue';
import NeedsConfirmBox from '../components/NeedsConfirmBox.vue';
import NeedForm from './NeedsForm.vue';
import MyPledges from './MyPledges.vue';
import NeedCard from './NeedsCard.vue';

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { gsap } from 'gsap'; // GSAP = animation library
import { api, errorMessage, fieldErrors } from '../api';
import { useSession } from '../stores/session';

// Who is logged in? (computed = always up to date)
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
const pledgeToWithdraw = ref(null); // the pledge waiting for "yes, withdraw it"
const pledgeEditError = ref('');
const pledgeEditSuccess = ref('');

// ---------- 3. Animations (GSAP) ----------

// The bread confetti component (so we can call burst.value.celebrate())
const burst = ref(null);

// Cards slide up one after another (only on the first load)
let cardsAnimated = false;
async function animateCards() {
  if (cardsAnimated || needs.value.length === 0) return;
  cardsAnimated = true;
  await nextTick(); // wait until Vue has drawn the cards on the page
  gsap.from('.need-item', { opacity: 0, y: 30, duration: 0.5, stagger: 0.1 });
}

// When the red banner appears, drop it in from the top
watch(newRequestCount, async (count) => {
  if (count === 0) return;
  await nextTick();
  gsap.from('.new-banner', { opacity: 0, y: -20, duration: 0.4 });
});

// ---------- 4. Loading data from the server ----------

// A quantity is OK if it is a whole number that is 1 or more
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

  animateCards();
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
    burst.value?.celebrate(); // the breads fly up
    await loadNeeds();
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

// ---------- Heading hover ----------
// The team's BouncingHeading only splits the title into WORDS.
// So, once on this page, we cut each word into single letters (class "ch-in"),
// and then the CSS below can make one letter jump when you hover over it.
function splitHeadingLetters() {
  const words = document.querySelectorAll('.needs-heading .title-word');
  words.forEach((word) => {
    const text = word.textContent; // e.g. "Charity "
    word.textContent = ''; // empty the word, then add it back letter by letter
    for (const character of text) {
      if (character === ' ') {
        word.append(' '); // a space stays a plain space
      } else {
        const letter = document.createElement('span');
        letter.className = 'ch-in';
        letter.textContent = character;
        word.append(letter);
      }
    }
  });
}

// ---------- 7. Auto refresh every 30 seconds ----------
let pollingTimer = null;

onMounted(async () => {
  splitHeadingLetters();

  await refreshAll();
  pollingTimer = window.setInterval(refreshAll, 30000);
});

// Stop the timer when we leave the page
onBeforeUnmount(() => {
  window.clearInterval(pollingTimer);
});
</script>

<template>
  <div class="needs-page">
    <!-- The team's shared banner + heading (same look as the other pages) -->
    <div class="banner-wrap mb-3">
      <SiteBanner icon="bi-heart-fill">
        <div class="mb-4">
          <BouncingHeading class="h3 needs-heading" text="Charity Needs Board" />
          <p class="text-body-secondary">
            Charities can share their food needs, and bakeries can pledge surplus food to help meet them.
          </p>
        </div>
      </SiteBanner>
    </div>

    <div class="wood-board mx-auto">
      <!-- Charity only: form to post a need -->
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

      <!-- Messages -->
      <div v-if="pageError" class="alert alert-danger" role="alert">
        {{ pageError }}
        <button class="btn btn-sm btn-outline-danger ms-2" @click="loadNeeds">Retry</button>
      </div>
      <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
      <div v-if="success" class="alert alert-success" role="status">🍞 {{ success }}</div>

      <!-- Bakery only: my pledges -->
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

      <!-- Loading -->
      <div v-if="loading" class="bg-white border rounded-4 p-5 text-center my-3">
        <div class="bread-bounce bread-huge">🍞</div>
        <p class="text-body-secondary mb-0">Baking your requests…</p>
      </div>

      <!-- No needs yet -->
      <div v-else-if="!pageError && needs.length === 0" class="bg-white border rounded-4 p-5 text-center">
        <div class="bread-bounce bread-huge">🥐</div>
        <h2 class="h5">No open requests yet</h2>
        <p class="text-body-secondary mb-0">New charity requests will appear here.</p>
      </div>

      <!-- The list of need cards -->
      <div v-else class="row g-3">
        <div v-for="need in needs" :key="need.id" class="need-item col-12 col-lg-6">
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

    <!-- Breads that fly up after a pledge or a new need -->
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
/* Loads the Fredoka font from Google Fonts (needs internet) */
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;700&display=swap');

/* Same heading font as the Community fridges page: Fredoka (a round, friendly font).
   fridges.css defines --fc-display as Fredoka, but it only exists once that file has loaded,
   so we repeat the font name after the comma, and load the font ourselves above. */
.needs-heading,
.needs-heading :deep(*) {
  font-family: var(--fc-display, 'Fredoka', 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.needs-heading {
  /* the fridge page's smaller banner size (its big hero uses clamp(2.5rem, 6vw, 4.4rem)) */
  font-size: clamp(1.8rem, 4.2vw, 2.8rem);
}

/* Hover over a WORD: the whole word lifts and grows a little.
   (translate and scale are used on purpose: the team's bounce animation
   uses "transform", so these do not fight with it) */
.needs-heading :deep(.title-word) {
  transition: translate 0.2s ease, scale 0.2s ease;
}

.needs-heading :deep(.title-word:hover) {
  translate: 0 -6px;
  scale: 1.08;
}

/* Hover over a LETTER: that letter jumps and grows even more */
.needs-heading :deep(.ch-in) {
  display: inline-block; /* a letter must be inline-block to be able to move */
  transition: transform 0.2s ease;
}

.needs-heading :deep(.ch-in:hover) {
  transform: translateY(-10px) scale(1.3);
}

/* ===== The wooden board ===== */
.wood-board {
  max-width: 1100px;
  position: relative;
  z-index: 1; /* the board sits ON TOP of the floating breads */
  padding: 2rem 1.5rem;
  border: 14px solid #5a3a1e; /* dark wood frame */
  border-radius: 1.5rem;
  /* Layers: plank lines, then wood grain, then the brown wood colour */
  background:
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.22) 0 2px, transparent 2px 180px),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0 2px, transparent 2px 7px),
    linear-gradient(180deg, #c18f58, #a8763f);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.35), 0 10px 25px rgba(0, 0, 0, 0.3);
}

/* Each card is tilted a little: odd ones left, even ones right */
.need-item:nth-child(odd) :deep(.need-card) { rotate: -1deg; }
.need-item:nth-child(even) :deep(.need-card) { rotate: 1deg; }

/* The bread (loading and empty boxes) hops up and down */
.bread-huge { font-size: 4rem; }

.bread-bounce {
  display: inline-block;
  animation: hop 1.2s ease-in-out infinite;
}

@keyframes hop {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-10px) rotate(4deg); }
}

@media (prefers-reduced-motion: reduce) {
  .bread-bounce { animation: none; }
}

/* Smaller frame on phones */
@media (max-width: 576px) {
  .wood-board { border-width: 8px; padding: 1.5rem 0.75rem; }
}
</style>