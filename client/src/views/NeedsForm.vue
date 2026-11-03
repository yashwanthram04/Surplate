<script setup>
// The "Post a food request" form for charities.
// This file only DRAWS the form. The real work (checking and saving)
// happens in NeedsView.vue, so we "emit" (send) events up to it.
defineProps({
  form: { type: Object, required: true },
  dietaryOptions: { type: Array, required: true },
  formError: { type: String, default: '' },
  successMessage: { type: String, default: '' },
  serverErrors: { type: Object, required: true },
  submitting: { type: Boolean, default: false },
  getToday: { type: Function, required: true },
});

const emit = defineEmits(['submit', 'toggle-diet']);
</script>

<template>
  <div class="form-paper position-relative rounded-4 p-3 p-md-4 mb-4">
    <!-- The bread that pins the form to the board -->
    <span class="form-pin">🍞</span>

    <h2 class="h5">
      <span class="bread-hop">🥖</span> Post a food request
    </h2>
    <p class="small text-body-secondary">
      Tell bakeries what your organisation needs and when you need it.
    </p>

    <div v-if="formError" class="alert alert-danger" role="alert">
      {{ formError }}
    </div>

    <div v-if="successMessage" class="alert alert-success" role="status">
      🎉 {{ successMessage }}
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
/* The form is a cream paper that slides in when the page opens */
.form-paper {
  background: #fff8ec;
  border: 2px solid #f0d9b5;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
  animation: slide-in 0.6s ease-out;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateY(25px); }
  to { opacity: 1; transform: translateY(0); }
}

/* The bread pin on the top edge */
.form-pin {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 2.2rem;
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.4));
}

/* The little bread in the heading hops up and down */
.bread-hop {
  display: inline-block;
  animation: hop 1.2s ease-in-out infinite;
}

@keyframes hop {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-5px) rotate(4deg); }
}

/* Boxes glow golden when you click into them */
.form-control {
  transition: box-shadow 0.2s, border-color 0.2s;
}

.form-control:focus {
  border-color: #e0a64b;
  box-shadow: 0 0 0 0.25rem rgba(224, 166, 75, 0.35);
}

/* Dietary buttons grow a little when hovered, and "pop" when you tick them */
.tag-chip {
  transition: transform 0.15s;
}

.tag-chip:hover {
  transform: translateY(-2px) scale(1.05);
}

.tag-chip.btn-primary {
  animation: pop 0.3s ease-out;
}

@keyframes pop {
  0% { transform: scale(0.85); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

/* The Post button wiggles when you hover over it */
.post-btn:hover:not(:disabled) {
  animation: wiggle 0.4s ease-in-out;
}

@keyframes wiggle {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-4deg); }
  75% { transform: rotate(4deg); }
}

/* The green success message pops in */
.alert-success {
  animation: pop 0.4s ease-out;
}

/* People who turn off animations in their computer settings get a still form */
@media (prefers-reduced-motion: reduce) {
  .form-paper,
  .bread-hop,
  .tag-chip.btn-primary,
  .post-btn:hover,
  .alert-success {
    animation: none;
  }
}
</style>