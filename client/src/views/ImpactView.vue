<script setup>
import { computed, onMounted, ref } from 'vue';
import { api, errorMessage } from '../api';
import { useSession } from '../stores/session';

const session = useSession();
const data = ref(null), loading = ref(true), error = ref(''), from = ref(''), to = ref('');
const personalTitle = computed(() => session.isBakery ? 'Your bakery’s donations' : session.isCharity ? 'Your charity’s collections' : 'Your collections');
const sections = computed(() => data.value ? [
  ...(session.isAdmin ? [] : [{ title: personalTitle.value, totals: data.value.mine }]),
  { title: 'Together on Surplate', totals: data.value.platform },
] : []);
const breakdowns = computed(() => data.value ? [{ title: 'Impact by bakery', rows: data.value.bakeries }, { title: 'Food collected by charities', rows: data.value.charities }] : []);
const number = (n) => new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 }).format(n);
async function load() {
  loading.value = true; error.value = '';
  try { data.value = (await api.get('/impact', { params: { ...(from.value ? { from: from.value } : {}), ...(to.value ? { to: to.value } : {}) } })).data; }
  catch (e) { error.value = errorMessage(e); }
  finally { loading.value = false; }
}
onMounted(load);
</script>
<template>
  <div class="mx-auto" style="max-width: 1200px">
    <div class="d-flex justify-content-between gap-3 flex-wrap mb-4">
      <div><span class="text-success fw-semibold">Every collection makes a difference</span><h1 class="display-6 fw-bold mt-1">Our impact</h1><p class="text-body-secondary mb-0">Food shared, collected and given a second chance.</p></div>
      <RouterLink to="/reservations" v-if="!session.isAdmin" class="btn btn-outline-primary align-self-center">{{ session.isBakery ? 'Manage collections' : 'Reservation history' }}</RouterLink>
    </div>
    <form class="bg-white border rounded-4 p-3 d-flex align-items-end gap-3 flex-wrap mb-4" @submit.prevent="load">
      <div><label for="impact-from" class="form-label">From</label><input id="impact-from" v-model="from" class="form-control" type="date" :max="to || undefined" /></div>
      <div><label for="impact-to" class="form-label">Through</label><input id="impact-to" v-model="to" class="form-control" type="date" :min="from || undefined" /></div>
      <button class="btn btn-primary" :disabled="loading">Apply dates</button>
      <button class="btn btn-outline-secondary" type="button" :disabled="loading" @click="from = ''; to = ''; load()">All time</button>
      <span class="small text-body-secondary pb-2">Collection dates · Singapore time</span>
    </form>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button></div>
    <p v-if="loading" role="status">Loading impact…</p>
    <template v-else-if="data && !error">
      <section v-for="section in sections" :key="section.title" class="mb-4">
        <h2 class="h4 mb-3">{{ section.title }}</h2>
        <div class="row g-3">
          <div v-for="metric in [{ key: 'collectedKg', label: session.isBakery && section.title === personalTitle ? 'Kilograms donated' : 'Kilograms rescued', icon: 'bi-basket2' }, { key: 'estimatedMeals', label: 'Estimated meals rescued', icon: 'bi-heart' }, { key: 'collections', label: 'Completed collections', icon: 'bi-check-circle' }]" :key="metric.key" class="col-12 col-md-4">
            <div class="border rounded-4 p-4 h-100 bg-white"><i class="bi fs-3 text-success" :class="metric.icon" aria-hidden="true"></i><div class="display-5 fw-bold my-2" :data-testid="metric.key">{{ number(section.totals[metric.key]) }}</div><div class="text-body-secondary">{{ metric.label }}</div></div>
          </div>
        </div>
        <p v-if="!section.totals.collections" class="small text-body-secondary mt-2">No completed collections in this period yet.</p>
      </section>
      <div class="row g-4">
        <section v-for="table in breakdowns" :key="table.title" class="col-12 col-lg-6">
          <div class="bg-white border rounded-4 p-3 h-100"><h2 class="h5">{{ table.title }}</h2>
            <p v-if="!table.rows.length" class="text-body-secondary mb-0">No completed collections in this period.</p>
            <div v-else class="table-responsive"><table class="table align-middle mb-0"><caption class="visually-hidden">{{ table.title }}</caption><thead><tr><th scope="col">Organisation</th><th scope="col" class="text-end">Kg</th><th scope="col" class="text-end">Estimated meals</th></tr></thead><tbody><tr v-for="(row, index) in table.rows" :key="index"><th scope="row">{{ row.name }}</th><td class="text-end">{{ number(row.collectedKg) }}</td><td class="text-end">{{ number(row.estimatedMeals) }}</td></tr></tbody></table></div>
          </div>
        </section>
      </div>
      <p class="small text-body-secondary mt-4">Only bakery-confirmed collections count. Meal estimates use the conversion recorded at reservation time (default: 500 g per meal). Cancelled and missed pickups are excluded. Bakery and charity figures describe the same food; platform totals count each collection once.</p>
    </template>
  </div>
</template>
