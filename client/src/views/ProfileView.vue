<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, errorMessage, fieldErrors } from '../api';
import AddressSearch from '../components/AddressSearch.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import PasswordInput from '../components/PasswordInput.vue';
import { ROLE_LABELS } from '../constants';
import { useFormErrors } from '../composables/useFormErrors';
import { useSession } from '../stores/session';
import { formatDateTime } from '../utils/time';

const session = useSession();
const router = useRouter();
const user = computed(() => session.user);

// ---- details -----------------------------------------------------------------------------
const form = reactive({
  name: user.value.name,
  phone: user.value.phone,
  registrationNo: user.value.registrationNo,
  address: user.value.address,
  postal: user.value.postal,
  lat: user.value.lat,
  lng: user.value.lng,
  currentPassword: '',
  newPassword: '',
});
const pickedAddress = ref(user.value.address);

const clientErrors = computed(() => {
  const e = {};
  if (form.name.trim().length < 2) e.name = 'Name must be at least 2 characters.';
  if (form.phone && !/^[+\d][\d\s-]{5,19}$/.test(form.phone.trim())) e.phone = 'Enter a valid phone number, or leave it blank.';
  if (user.value.role === 'charity' && !/^[A-Za-z0-9-]{5,20}$/.test(form.registrationNo.trim())) e.registrationNo = 'Enter 5–20 letters, numbers or dashes.';
  if (user.value.role === 'bakery' && form.address && form.lat == null) e.address = 'Choose your address from the search results.';
  if (form.newPassword) {
    if (!form.currentPassword) e.currentPassword = 'Enter your current password to change it.';
    if (form.newPassword.length < 8 || !/[A-Za-z]/.test(form.newPassword) || !/\d/.test(form.newPassword)) {
      e.newPassword = 'At least 8 characters, with a letter and a number.';
    }
  }
  return e;
});
const { submitted, err, cls, setServer, hasClientErrors } = useFormErrors(form, clientErrors);
const saving = ref(false);
const saved = ref(false);
const failure = ref('');

function onAddress(r) {
  pickedAddress.value = r.address;
  Object.assign(form, { address: r.address, postal: r.postal, lat: r.lat, lng: r.lng });
}
function onAddressText(text) {
  if (text !== pickedAddress.value) Object.assign(form, { address: text, lat: null, lng: null });
}

async function save() {
  submitted.value = true;
  saved.value = false;
  failure.value = '';
  if (hasClientErrors()) return;
  saving.value = true;
  try {
    const { data } = await api.put('/auth/me', form);
    session.user = data.user;
    Object.assign(form, { currentPassword: '', newPassword: '' });
    submitted.value = false;
    saved.value = true;
  } catch (e) {
    const fields = fieldErrors(e);
    if (Object.keys(fields).length) setServer(fields);
    else failure.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

// ---- delete account ------------------------------------------------------------------------
const deleting = ref(false);
const deletePassword = ref('');
const deleteError = ref('');
const deleteBusy = ref(false);
async function deleteAccount() {
  deleteBusy.value = true;
  deleteError.value = '';
  try {
    await api.delete('/auth/me', { data: { password: deletePassword.value } });
    session.user = null;
    router.push('/');
  } catch (e) {
    deleteError.value = fieldErrors(e).password || errorMessage(e);
    deleteBusy.value = false;
  }
}

const status = computed(() => user.value.verification.status);
</script>

<template>
  <!-- v-if: on log out / account deletion the user is cleared a moment before the redirect happens -->
  <div v-if="user" class="mx-auto" style="max-width: 680px">
    <div class="d-flex align-items-center gap-2 mb-1">
      <h1 class="h3 mb-0">My account</h1>
      <span class="badge text-bg-secondary" data-testid="role-badge">{{ ROLE_LABELS[user.role] }}</span>
    </div>
    <p class="text-body-secondary">{{ user.email }}</p>

    <!-- charity verification status -->
    <div v-if="user.role === 'charity'" class="mb-4" data-testid="verification-banner">
      <div v-if="status === 'approved'" class="alert alert-success mb-0" role="status">
        <i class="bi bi-patch-check-fill me-1" aria-hidden="true"></i><strong>Verified charity.</strong> You can see every listing, including those bakeries keep for charities only.
      </div>
      <div v-else-if="status === 'pending'" class="alert alert-warning mb-0" role="status">
        <i class="bi bi-hourglass-split me-1" aria-hidden="true"></i><strong>Waiting for verification.</strong> An admin is checking your registration number. Until then you can use Surplate like an individual.
      </div>
      <div v-else class="alert alert-danger mb-0" role="alert">
        <i class="bi bi-x-octagon-fill me-1" aria-hidden="true"></i><strong>Verification was declined.</strong>
        <div v-if="user.verification.note" class="mt-1">Reason: {{ user.verification.note }}</div>
        <div class="mt-1 small">Correct your registration number below and save to ask for another review.</div>
      </div>
    </div>

    <form class="bg-white border rounded-4 p-3 p-md-4 mb-4" novalidate data-testid="profile-form" @submit.prevent="save">
      <h2 class="h5 mb-3">Your details</h2>
      <div v-if="saved" class="alert alert-success" role="status" data-testid="profile-saved">Your details have been saved.</div>
      <div v-if="failure" class="alert alert-danger" role="alert">{{ failure }}</div>

      <div class="mb-3">
        <label for="name" class="form-label fw-semibold">{{ user.role === 'bakery' ? 'Business name' : user.role === 'charity' ? 'Organisation name' : 'Name' }}</label>
        <input id="name" v-model="form.name" class="form-control" :class="cls('name')" maxlength="80" :aria-invalid="!!err('name')" aria-describedby="name-err" />
        <div id="name-err" class="invalid-feedback">{{ err('name') }}</div>
      </div>

      <div class="mb-3">
        <label for="email" class="form-label fw-semibold">Email</label>
        <input id="email" :value="user.email" class="form-control" disabled aria-describedby="email-hint" />
        <div id="email-hint" class="form-text">Your email is your login, so it can't be changed here.</div>
      </div>

      <div class="mb-3">
        <label for="phone" class="form-label fw-semibold">Phone <span class="text-body-secondary fw-normal">(optional)</span></label>
        <input id="phone" v-model="form.phone" type="tel" class="form-control" :class="cls('phone')" :aria-invalid="!!err('phone')" aria-describedby="phone-err" />
        <div id="phone-err" class="invalid-feedback">{{ err('phone') }}</div>
      </div>

      <div v-if="user.role === 'charity'" class="mb-3">
        <label for="registrationNo" class="form-label fw-semibold">Registration number</label>
        <input id="registrationNo" v-model="form.registrationNo" class="form-control" :class="cls('registrationNo')" maxlength="20" :aria-invalid="!!err('registrationNo')" aria-describedby="registrationNo-err registrationNo-hint" />
        <div id="registrationNo-err" class="invalid-feedback">{{ err('registrationNo') }}</div>
        <div id="registrationNo-hint" class="form-text">Changing this sends your charity back to verification.</div>
      </div>

      <div v-if="user.role === 'bakery'" class="mb-3">
        <label for="address" class="form-label fw-semibold">Pickup address <span class="text-body-secondary fw-normal">(optional)</span></label>
        <AddressSearch id="address" :model-value="form.address" :invalid="!!err('address')" @update:model-value="onAddressText" @select="onAddress" />
        <div v-if="err('address')" class="text-danger small mt-1" role="alert">{{ err('address') }}</div>
        <div class="form-text">Pre-fills the address on new listings.</div>
      </div>

      <hr />
      <h2 class="h5 mb-3">Change password <span class="text-body-secondary fw-normal fs-6">(optional)</span></h2>
      <div class="row g-3">
        <div class="col-12 col-sm-6">
          <label for="currentPassword" class="form-label fw-semibold">Current password</label>
          <PasswordInput id="currentPassword" v-model="form.currentPassword" :invalid="!!err('currentPassword')" describedby="currentPassword-err">
            <div id="currentPassword-err" class="invalid-feedback">{{ err('currentPassword') }}</div>
          </PasswordInput>
        </div>
        <div class="col-12 col-sm-6">
          <label for="newPassword" class="form-label fw-semibold">New password</label>
          <PasswordInput id="newPassword" v-model="form.newPassword" autocomplete="new-password" :invalid="!!err('newPassword')" describedby="newPassword-err">
            <div id="newPassword-err" class="invalid-feedback">{{ err('newPassword') }}</div>
          </PasswordInput>
        </div>
      </div>

      <div class="d-flex justify-content-end mt-4">
        <button type="submit" class="btn btn-primary px-4" :disabled="saving" data-testid="profile-save">
          <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Save changes
        </button>
      </div>
    </form>

    <div class="small text-body-secondary mb-4">Member since {{ formatDateTime(user.createdAt) }}</div>

    <section v-if="user.role !== 'admin'" class="border border-danger-subtle rounded-4 p-3 p-md-4 bg-white" aria-labelledby="danger-title">
      <h2 id="danger-title" class="h5 text-danger">Delete account</h2>
      <p class="mb-3 text-body-secondary">
        This permanently removes your account.<template v-if="user.role === 'bakery'"> Your listings come off the board straight away.</template>
      </p>
      <button type="button" class="btn btn-outline-danger" data-testid="delete-account" @click="deleting = true">Delete my account</button>
    </section>

    <ConfirmModal v-if="deleting" title="Delete your account?" confirm-text="Delete account" danger :busy="deleteBusy" :error="deleteError" @confirm="deleteAccount" @cancel="deleting = false; deletePassword = ''; deleteError = ''">
      <p class="mb-2">This can't be undone. Enter your password to confirm.</p>
      <label for="delete-password" class="form-label small fw-semibold">Password</label>
      <PasswordInput id="delete-password" v-model="deletePassword" />
    </ConfirmModal>
  </div>
</template>
