<script setup>
// The "Post a food request" form for charities.
defineProps({
  form: { type: Object, required: true },
  dietaryOptions: { type: Array, required: true },
  formError: { type: String, default: '' },
  successMessage: { type: String, default: '' },
  serverErrors: { type: Object, required: true },
  submitting: { type: Boolean, default: false },
  getToday: { type: Function, required: true },
});

const emit = defineEmits(['submit', 'toggle-diet', 'dismiss-success']);
</script>

<template>
  <div class="form-paper">
    <div class="form-head">
      <span class="form-icon" aria-hidden="true">🥖</span>
      <div>
        <h2 class="h5 mb-0">Post a food request</h2>
        <p class="small text-body-secondary mb-0">Tell bakeries what you need and when.</p>
      </div>
    </div>

    <div v-if="formError" class="alert alert-danger" role="alert">
      {{ formError }}
    </div>

    <div v-if="successMessage" class="alert alert-success alert-dismissible" role="status">
      🎉 {{ successMessage }}
      <button type="button" class="btn-close" aria-label="Dismiss" @click="emit('dismiss-success')"></button>
    </div>

    <form @submit.prevent="emit('submit')">
      <div class="mb-3">
        <label for="need-title" class="form-label fw-semibold">Request title</label>
        <input
          id="need-title"
          v-model="form.title"
          class="form-control"
          maxlength="100"
          placeholder="e.g. Bread for Saturday breakfast"
          required
        />
        <div v-if="serverErrors.title" class="text-danger small">
          {{ serverErrors.title }}
        </div>
      </div>

      <div class="mb-3">
        <label for="need-description" class="form-label fw-semibold">Description</label>
        <textarea
          id="need-description"
          v-model="form.description"
          class="form-control"
          rows="3"
          maxlength="500"
          placeholder="Who is the food for, and are there any special requirements?"
        ></textarea>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-12 col-md-6">
          <label for="need-quantity" class="form-label fw-semibold">Quantity needed</label>
          <input
            id="need-quantity"
            v-model.number="form.quantityTarget"
            type="number"
            min="1"
            step="1"
            class="form-control"
            required
          />
        </div>

        <div class="col-12 col-md-6">
          <label for="need-date" class="form-label fw-semibold">Date needed</label>
          <input
            id="need-date"
            v-model="form.neededDate"
            type="date"
            :min="getToday()"
            class="form-control"
            required
          />
        </div>

        <div class="col-12 col-md-6">
          <label for="need-time" class="form-label fw-semibold">Time needed</label>
          <input id="need-time" v-model="form.neededTime" type="time" class="form-control" required />
        </div>
      </div>

      <fieldset class="mb-3">
        <legend class="form-label fw-semibold fs-6">Dietary requirements</legend>

        <div class="d-flex flex-wrap gap-2">
          <label
            v-for="tag in dietaryOptions"
            :key="tag"
            class="tag-chip btn btn-sm"
            :class="form.dietaryTags.includes(tag) ? 'btn-primary' : 'btn-outline-secondary'"
          >
            <input
              type="checkbox"
              class="visually-hidden"
              :checked="form.dietaryTags.includes(tag)"
              @change="emit('toggle-diet', tag)"
            />
            {{ tag }}
          </label>
        </div>
      </fieldset>

      <button type="submit" class="post-btn btn btn-primary" :disabled="submitting">
        {{ submitting ? 'Posting…' : '🥖 Post request' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.form-paper {
  position: relative;
  padding: 1.25rem;
  background: #fff;
  border: 1px solid #e8e4da;
  border-radius: 1.1rem;
  box-shadow: 0 1px 2px rgba(40, 60, 40, 0.04);
  overflow: hidden;
}
.form-paper::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: linear-gradient(90deg, var(--sp-green), #6cc08b);
}

.form-head { display: flex; align-items: center; gap: 0.8rem; margin: 0.2rem 0 1.1rem; }
.form-icon {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.8rem;
  font-size: 1.4rem;
  background: var(--sp-green-soft);
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.form-paper:hover .form-icon { transform: rotate(-10deg) scale(1.1); }

.form-control { transition: box-shadow 0.2s, border-color 0.2s; }

.tag-chip { transition: transform 0.15s; }
.tag-chip:hover { transform: translateY(-2px); }
.tag-chip.btn-primary { animation: pop 0.3s ease-out; }
@keyframes pop {
  0% { transform: scale(0.85); }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); }
}

.post-btn { transition: transform 0.15s, box-shadow 0.15s; }
.post-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 16px -8px rgba(38, 100, 64, 0.6); }

.alert-success { animation: pop 0.4s ease-out; }

/* People who turn off animations in their computer settings get a still form */
@media (prefers-reduced-motion: reduce) {
  .tag-chip.btn-primary,
  .alert-success { animation: none; }
  .form-icon,
  .tag-chip,
  .post-btn { transition: none; }
  .form-paper:hover .form-icon,
  .tag-chip:hover,
  .post-btn:hover:not(:disabled) { transform: none; }
}
</style>
