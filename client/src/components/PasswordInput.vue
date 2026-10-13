<script setup>
import { ref } from 'vue';

// Password field with a show/hide toggle. v-model is the password text.
const model = defineModel({ type: String, default: '' });
defineProps({
  id: { type: String, required: true },
  invalid: Boolean,
  autocomplete: { type: String, default: 'current-password' },
  describedby: { type: String, default: '' },
});
const visible = ref(false);
</script>

<template>
  <div class="input-group has-validation">
    <input
      :id="id"
      v-model="model"
      :type="visible ? 'text' : 'password'"
      class="form-control"
      :class="{ 'is-invalid': invalid }"
      :autocomplete="autocomplete"
      :aria-invalid="invalid"
      :aria-describedby="describedby || undefined"
    />
    <button type="button" class="btn btn-outline-secondary" :aria-label="visible ? 'Hide password' : 'Show password'" :aria-pressed="visible" @click="visible = !visible">
      <i class="bi" :class="visible ? 'bi-eye-slash' : 'bi-eye'" aria-hidden="true"></i>
    </button>
    <slot />
  </div>
</template>
