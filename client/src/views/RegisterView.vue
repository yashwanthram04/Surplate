<script setup>
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { errorMessage, fieldErrors } from '../api';
import AddressSearch from '../components/AddressSearch.vue';
import PasswordInput from '../components/PasswordInput.vue';
import { useFormErrors } from '../composables/useFormErrors';
import { homeFor, useSession } from '../stores/session';

const session = useSession();
const router = useRouter();
const route = useRoute();

const roles = [
  { key: 'bakery', icon: 'bi-shop', title: 'Bakery / restaurant', blurb: 'Share your unsold food', badge: 'Instant access' },
  { key: 'charity', icon: 'bi-heart', title: 'Charity', blurb: 'Get food for the people you serve', badge: 'Needs verification' },
  { key: 'individual', icon: 'bi-person', title: 'Individual', blurb: 'Find free food near you', badge: 'Instant access' },
];

const form = reactive({
  role: roles.some((r) => r.key === route.query.role) ? route.query.role : 'individual',
  name: '',
  email: '',
  password: '',
  phone: '',
  registrationNo: '',
  address: '',
  postal: '',
  lat: null,
  lng: null,
});

const nameLabel = computed(() => ({ bakery: 'Business name', charity: 'Organisation name' })[form.role] ?? 'Your name');

const clientErrors = computed(() => {
  const e = {};
  if (form.name.trim().length < 2) e.name = `${nameLabel.value} must be at least 2 characters.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) e.email = 'Enter a valid email address.';
  if (form.password.length < 8) e.password = 'Password must be at least 8 characters.';
  else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Password must contain at least one letter and one number.';
  if (form.phone && !/^[+\d][\d\s-]{5,19}$/.test(form.phone.trim())) e.phone = 'Enter a valid phone number, or leave it blank.';
  if (form.role === 'charity' && !/^[A-Za-z0-9-]{5,20}$/.test(form.registrationNo.trim())) {
    e.registrationNo = 'Enter your charity or UEN registration number (5–20 letters, numbers or dashes).';
  }
  if (form.role === 'bakery' && form.address && form.lat == null) e.address = 'Choose your address from the search results.';
  return e;
});
const { submitted, err, cls, setServer, hasClientErrors } = useFormErrors(form, clientErrors);

const busy = ref(false);
const failure = ref('');
const pickedAddress = ref('');

function onAddress(r) {
  pickedAddress.value = r.address;
  Object.assign(form, { address: r.address, postal: r.postal, lat: r.lat, lng: r.lng });
}
function onAddressText(text) {
  if (text !== pickedAddress.value) Object.assign(form, { address: text, lat: null, lng: null });
}

async function submit() {
  submitted.value = true;
  failure.value = '';
  if (hasClientErrors()) return focusFirstError();
  busy.value = true;
  try {
    const user = await session.register({ ...form, name: form.name.trim(), email: form.email.trim() });
    router.push(user.role === 'bakery' ? '/listings/new' : homeFor(user));
  } catch (e) {
    const fields = fieldErrors(e);
    if (Object.keys(fields).length) {
      setServer(fields);
      failure.value = 'Some details need fixing. See the highlighted fields.';
      focusFirstError();
    } else {
      failure.value = errorMessage(e);
    }
  } finally {
    busy.value = false;
  }
}
function focusFirstError() {
  setTimeout(() => {
    const el = document.querySelector('form .is-invalid');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus?.({ preventScroll: true });
  }, 0);
}
</script>

<template>
  <div class="mx-auto" style="max-width: 640px">
    <h1 class="h3 mb-1">Create your account</h1>
    <p class="text-body-secondary">Already have one? <RouterLink to="/login">Log in</RouterLink></p>

    <form class="bg-white border rounded-4 p-3 p-md-4" novalidate data-testid="register-form" @submit.prevent="submit">
      <div v-if="failure" class="alert alert-danger" role="alert" data-testid="register-error">{{ failure }}</div>

      <fieldset class="mb-4">
        <legend class="form-label fw-semibold fs-6">I am a…</legend>
        <div class="row g-2">
          <div v-for="r in roles" :key="r.key" class="col-12 col-sm-4">
            <input :id="`role-${r.key}`" v-model="form.role" class="btn-check" type="radio" name="role" :value="r.key" />
            <label class="role-card w-100 h-100" :for="`role-${r.key}`">
              <i class="bi fs-3" :class="r.icon" aria-hidden="true"></i>
              <span class="fw-semibold">{{ r.title }}</span>
              <span class="small text-body-secondary">{{ r.blurb }}</span>
              <span class="badge" :class="r.key === 'charity' ? 'text-bg-warning' : 'text-bg-success'">{{ r.badge }}</span>
            </label>
          </div>
        </div>
        <div v-if="form.role === 'charity'" class="alert alert-warning small mt-3 mb-0" role="status" data-testid="charity-note">
          <i class="bi bi-shield-check me-1" aria-hidden="true"></i>
          An admin checks your registration number before you get charity access. Until then you can use Surplate like an individual.
        </div>
      </fieldset>

      <div class="mb-3">
        <label for="name" class="form-label fw-semibold">{{ nameLabel }}</label>
        <input id="name" v-model="form.name" class="form-control" :class="cls('name')" maxlength="80" autocomplete="organization" :aria-invalid="!!err('name')" aria-describedby="name-err" />
        <div id="name-err" class="invalid-feedback">{{ err('name') }}</div>
      </div>

      <div class="mb-3">
        <label for="email" class="form-label fw-semibold">Email</label>
        <input id="email" v-model="form.email" type="email" class="form-control" :class="cls('email')" autocomplete="email" :aria-invalid="!!err('email')" aria-describedby="email-err" />
        <div id="email-err" class="invalid-feedback">{{ err('email') }}</div>
      </div>

      <div class="mb-3">
        <label for="password" class="form-label fw-semibold">Password</label>
        <PasswordInput id="password" v-model="form.password" autocomplete="new-password" :invalid="!!err('password')" describedby="password-err password-hint">
          <div id="password-err" class="invalid-feedback">{{ err('password') }}</div>
        </PasswordInput>
        <div id="password-hint" class="form-text">At least 8 characters, with a letter and a number.</div>
      </div>

      <div v-if="form.role === 'charity'" class="mb-3">
        <label for="registrationNo" class="form-label fw-semibold">Registration number</label>
        <input id="registrationNo" v-model="form.registrationNo" class="form-control" :class="cls('registrationNo')" maxlength="20" :aria-invalid="!!err('registrationNo')" aria-describedby="registrationNo-err" />
        <div id="registrationNo-err" class="invalid-feedback">{{ err('registrationNo') }}</div>
        <div class="form-text">Your registered charity or UEN number, used only for verification.</div>
      </div>

      <div class="mb-3">
        <label for="phone" class="form-label fw-semibold">Phone <span class="text-body-secondary fw-normal">(optional)</span></label>
        <input id="phone" v-model="form.phone" type="tel" class="form-control" :class="cls('phone')" autocomplete="tel" :aria-invalid="!!err('phone')" aria-describedby="phone-err" />
        <div id="phone-err" class="invalid-feedback">{{ err('phone') }}</div>
      </div>

      <div v-if="form.role === 'bakery'" class="mb-3">
        <label for="address" class="form-label fw-semibold">Pickup address <span class="text-body-secondary fw-normal">(optional)</span></label>
        <AddressSearch id="address" :model-value="form.address" :invalid="!!err('address')" placeholder="Search your address or postal code" @update:model-value="onAddressText" @select="onAddress" />
        <div v-if="err('address')" class="text-danger small mt-1" role="alert">{{ err('address') }}</div>
        <div class="form-text">Saves you retyping it on every listing.</div>
      </div>

      <button type="submit" class="btn btn-primary w-100 btn-lg mt-2" :disabled="busy" data-testid="register-submit">
        <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Create account
      </button>
    </form>
  </div>
</template>

<style scoped>
.role-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.9rem;
  border: 2px solid #e5e1d6;
  border-radius: 0.9rem;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.role-card:hover {
  border-color: #b9d9c4;
}
.btn-check:checked + .role-card {
  border-color: var(--sp-green);
  background: var(--sp-green-soft);
  box-shadow: 0 0 0 3px rgba(47, 125, 79, 0.15);
}
.btn-check:focus-visible + .role-card {
  outline: 3px solid var(--bs-focus-ring-color);
}
.role-card .bi {
  color: var(--sp-green-dark);
}
</style>
