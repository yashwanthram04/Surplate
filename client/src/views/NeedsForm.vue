<script setup>
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
    <div class="bg-white border rounded-4 p-3 p-md-4 mb-4">
    <h2 class="h5">Post a food request</h2>
    <p class="small text-body-secondary">
        Tell bakeries what your organisation needs and when you need it.
    </p>

    <div v-if="formError" class="alert alert-danger" role="alert">
        {{ formError }}
    </div>

    <div v-if="successMessage" class="alert alert-success" role="status">
        {{ successMessage }}
    </div>

    <form @submit.prevent="emit('submit')">
        <div class="mb-3">
            <label for="need-title" class="form-label fw-semibold">
                Request title
            </label>
            
            <input
            id="need-title"
            v-model="form.title"
            class="form-control"
            maxlength="100"
            placeholder="e.g. Bread for Saturday breakfast"
            required/>
            
            <div v-if="serverErrors.title" class="text-danger small">
                {{ serverErrors.title }}
            </div>
        </div>

        <div class="mb-3">
            <label for="need-description" class="form-label fw-semibold">
            Description
            </label>
            
            <textarea
                id="need-description"
                v-model="form.description"
                class="form-control"
                rows="3"
                maxlength="500"
                placeholder="Who is the food for, and are there any special requirements?">
            </textarea>
        
        </div>
        
        <div class="row g-3 mb-3">
            <div class="col-12 col-md-6">
                <label for="need-quantity" class="form-label fw-semibold">
                    Quantity needed
                </label>
                <input
                    id="need-quantity"
                    v-model.number="form.quantityTarget"
                    type="number"
                    min="1"
                    step="1"
                    class="form-control"
                    required/>
                </div>
                
                <div class="col-12 col-md-6">
                    <label for="need-date" class="form-label fw-semibold">
                        Date needed
                    </label>
                    <input
                        id="need-date"
                        v-model="form.neededDate"
                        type="date"
                        :min="getToday()"
                        class="form-control"
                        required/>
                </div>
                <div class="col-12 col-md-6">
                    <label for="need-time" class="form-label fw-semibold">
                        Time needed
                    </label>
                    <input
                        id="need-time"
                        v-model="form.neededTime"
                        type="time"
                        class="form-control"
                        required/>
                </div>
        </div>
        
        <fieldset class="mb-3">
        <legend class="form-label fw-semibold fs-6">
            Dietary requirements
        </legend>

        <div class="d-flex flex-wrap gap-2">
            <label
                v-for="tag in dietaryOptions"
                :key="tag"
                class="btn btn-sm"
                :class="form.dietaryTags.includes(tag)
                ? 'btn-primary'
                : 'btn-outline-secondary'">
                
                <input
                    type="checkbox"
                    class="visually-hidden"
                    :checked="form.dietaryTags.includes(tag)"
                    @change="emit('toggle-diet', tag)"/>
                    {{ tag }}
                </label>
        </div>
        </fieldset>

        <button
            type="submit"
            class="btn btn-primary"
            :disabled="submitting">
            {{ submitting ? 'Posting…' : 'Post request' }}
        </button>
    </form>
    </div>
</template>