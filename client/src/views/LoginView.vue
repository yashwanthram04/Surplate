<script setup>
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { errorMessage } from '../api';
import PasswordInput from '../components/PasswordInput.vue';
import { useFormErrors } from '../composables/useFormErrors';
import { homeFor, useSession } from '../stores/session';

const session = useSession();
const router = useRouter();
const route = useRoute();

const form = reactive({ email: '', password: '' });
const clientErrors = computed(() => {
  const e = {};
  if (!form.email.trim()) e.email = 'Enter your email address.';
  if (!form.password) e.password = 'Enter your password.';
  return e;
});
const { submitted, err, cls, hasClientErrors } = useFormErrors(form, clientErrors);
const busy = ref(false);
const failure = ref('');

// The demo accounts are seeded by `npm run seed` (see README). Hidden if VITE_DEMO_LOGINS=false.
const showDemo = import.meta.env.VITE_DEMO_LOGINS !== 'false';
const demos = [
  { label: 'Bakery', email: 'sunrise@demo.surplate.sg' },
  { label: 'Charity (verified)', email: 'hope@demo.surplate.sg' },
  { label: 'Charity (pending)', email: 'newhope@demo.surplate.sg' },
  { label: 'Individual', email: 'alex@demo.surplate.sg' },
  { label: 'Admin', email: 'admin@demo.surplate.sg' },
];
const useDemo = (email) => Object.assign(form, { email, password: 'demo1234' });

async function submit() {
  submitted.value = true;
  failure.value = '';
  if (hasClientErrors()) return;
  busy.value = true;
  try {
    const user = await session.login(form.email.trim(), form.password);
    const next = typeof route.query.next === 'string' && /^\/(?!\/)/.test(route.query.next) ? route.query.next : homeFor(user);
    router.push(next);
  } catch (e) {
    failure.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto" style="max-width: 440px">
    <h1 class="h3 mb-1">Welcome back</h1>
    <p class="text-body-secondary">Log in to post, reserve and manage food.</p>

    <form class="bg-white border rounded-4 p-4" novalidate data-testid="login-form" @submit.prevent="submit">
      <div v-if="failure" class="alert alert-danger" role="alert" data-testid="login-error">{{ failure }}</div>

      <div class="mb-3">
        <label for="email" class="form-label fw-semibold">Email</label>
        <input id="email" v-model="form.email" type="email" class="form-control" :class="cls('email')" autocomplete="username" :aria-invalid="!!err('email')" aria-describedby="email-err" />
        <div id="email-err" class="invalid-feedback">{{ err('email') }}</div>
      </div>

      <div class="mb-4">
        <label for="password" class="form-label fw-semibold">Password</label>
        <PasswordInput id="password" v-model="form.password" :invalid="!!err('password')" describedby="password-err">
          <div id="password-err" class="invalid-feedback">{{ err('password') }}</div>
        </PasswordInput>
      </div>

      <button type="submit" class="btn btn-primary w-100" :disabled="busy" data-testid="login-submit">
        <span v-if="busy" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Log in
      </button>
    </form>

    <p class="text-center mt-3 mb-0">New here? <RouterLink to="/register">Create an account</RouterLink></p>

    <details v-if="showDemo" class="mt-4 small bg-white border rounded-4 p-3" data-testid="demo-logins">
      <summary class="fw-semibold" style="cursor: pointer">Demo accounts</summary>
      <p class="text-body-secondary mt-2 mb-2">For the course demo. Every account uses the password <code>demo1234</code>.</p>
      <div class="d-flex flex-wrap gap-1">
        <button v-for="d in demos" :key="d.email" type="button" class="btn btn-sm btn-outline-secondary" @click="useDemo(d.email)">{{ d.label }}</button>
      </div>
    </details>
  </div>
</template>
