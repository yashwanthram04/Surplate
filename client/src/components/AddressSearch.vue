<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { api } from '../api';

// Type-ahead address lookup backed by the OneMap search API (through our /api/geocode proxy).
// Emits `select` with { address, postal, lat, lng }.
const props = defineProps({
  id: { type: String, default: 'address-search' },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Search an address or postal code' },
  invalid: Boolean,
  size: { type: String, default: '' }, // '' | 'sm'
});
const emit = defineEmits(['update:modelValue', 'select']);

const text = ref(props.modelValue);
const results = ref([]);
const open = ref(false);
const loading = ref(false);
const failed = ref(false);
const searched = ref(false); // true once a lookup finished for the current text
const active = ref(-1);
let timer = null;
let requestId = 0;
let skipNext = false; // set after picking a result so the text change doesn't trigger a new search

watch(() => props.modelValue, (v) => {
  if (v !== text.value) {
    skipNext = true;
    text.value = v;
  }
});

watch(text, (value) => {
  emit('update:modelValue', value);
  clearTimeout(timer);
  active.value = -1;
  if (skipNext) {
    skipNext = false;
    return;
  }
  searched.value = false;
  failed.value = false;
  if (value.trim().length < 3) {
    results.value = [];
    open.value = false;
    return;
  }
  timer = setTimeout(() => search(value.trim()), 300);
});

async function search(q) {
  const mine = ++requestId;
  loading.value = true;
  try {
    const { data } = await api.get('/geocode', { params: { q } });
    if (mine !== requestId) return; // a newer search has started
    results.value = data.results;
    failed.value = false;
  } catch {
    if (mine !== requestId) return;
    results.value = [];
    failed.value = true;
  } finally {
    if (mine === requestId) {
      loading.value = false;
      searched.value = true;
      open.value = true;
    }
  }
}

function pick(r) {
  skipNext = true;
  text.value = r.address;
  open.value = false;
  results.value = [];
  emit('select', r);
}

function onKey(e) {
  if (!open.value || !results.value.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    active.value = (active.value + 1) % results.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    active.value = (active.value - 1 + results.value.length) % results.value.length;
  } else if (e.key === 'Enter' && active.value >= 0) {
    e.preventDefault();
    pick(results.value[active.value]);
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

// Delay closing so a click on a result registers before the list disappears.
const onBlur = () => setTimeout(() => (open.value = false), 150);

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="position-relative">
    <input
      :id="id"
      v-model="text"
      type="search"
      autocomplete="off"
      class="form-control"
      :class="[{ 'is-invalid': invalid }, size ? `form-control-${size}` : '']"
      :placeholder="placeholder"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="`${id}-results`"
      @keydown="onKey"
      @focus="open = results.length > 0 || searched"
      @blur="onBlur"
    />
    <div v-if="loading" class="position-absolute top-50 end-0 translate-middle-y me-5 spinner-border spinner-border-sm text-secondary" role="status">
      <span class="visually-hidden">Searching…</span>
    </div>

    <ul v-if="open" :id="`${id}-results`" class="list-group address-results mt-1" role="listbox">
      <li
        v-for="(r, i) in results"
        :key="r.address + r.lat"
        class="list-group-item list-group-item-action"
        :class="{ active: i === active }"
        role="option"
        :aria-selected="i === active"
        style="cursor: pointer"
        @mousedown.prevent="pick(r)"
      >
        {{ r.address }}
      </li>
      <li v-if="failed" class="list-group-item text-danger small">Address lookup is unavailable right now. Please try again.</li>
      <li v-else-if="!results.length" class="list-group-item text-body-secondary small">No matching Singapore address found.</li>
    </ul>
  </div>
</template>
