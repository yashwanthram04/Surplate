<script setup>
import BouncingHeading from '../components/BouncingHeading.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api, errorMessage } from '../api';
import { useSession } from '../stores/session';
import { chartPoints, fillTrend } from '../utils/impact';
import SiteBanner from '../components/SiteBanner.vue';

gsap.registerPlugin(ScrollTrigger);

const session = useSession();
const root = ref(null), data = ref(null), loading = ref(true), error = ref('');
const from = ref(''), to = ref(''), applied = ref({ from: '', to: '' });
const scope = ref('platform'), metric = ref('collectedKg'), hovered = ref(null), updatedAt = ref(null);
const chartWidth = ref(760);
const metrics = [
  { key: 'collectedKg', label: 'Kilograms rescued', short: 'Food rescued', unit: 'kg', icon: 'bi-basket2', color: 'green' },
  { key: 'estimatedMeals', label: 'Estimated meals rescued', short: 'Estimated meals', unit: 'meals', icon: 'bi-heart', color: 'orange' },
  { key: 'collections', label: 'Completed collections', short: 'Collections', unit: 'collections', icon: 'bi-check-circle', color: 'purple' },
];
const palette = ['#278260', '#7257bb', '#c67825', '#327cbd', '#ba5476'];
const number = (n) => new Intl.NumberFormat('en-SG', { maximumFractionDigits: 2 }).format(n ?? 0);
const personalTitle = computed(() => session.isBakery ? 'Your bakery’s donations' : session.isCharity ? 'Your charity’s collections' : 'Your collections');
const sections = computed(() => data.value ? [
  ...(session.isAdmin ? [] : [{ title: personalTitle.value, totals: data.value.mine, personal: true }]),
  { title: 'Together on Surplate', totals: data.value.platform, personal: false },
] : []);
const selectedMetric = computed(() => metrics.find((m) => m.key === metric.value));
const trend = computed(() => fillTrend(data.value?.trend?.[scope.value] ?? [], data.value?.trend?.interval, applied.value.from, applied.value.to));
const points = computed(() => chartPoints(trend.value, metric.value, chartWidth.value));
const line = computed(() => points.value.map((p, index) => `${index ? 'L' : 'M'}${p.x},${p.y}`).join(' '));
const area = computed(() => points.value.length ? `${line.value} L${points.value.at(-1).x},222 L${points.value[0].x},222 Z` : '');
const maximum = computed(() => Math.max(1, ...trend.value.map((row) => row[metric.value])));
const ticks = computed(() => points.value.filter((_, i, rows) => i === 0 || i === rows.length - 1 || i % Math.max(1, Math.ceil(rows.length / (chartWidth.value < 500 ? 2 : 4))) === 0));
const point = computed(() => points.value[hovered.value] ?? points.value.at(-1));
const chartTotal = computed(() => data.value?.[scope.value]?.[metric.value] ?? 0);
const formatDate = (value) => new Date(`${value}${value.length === 7 ? '-01' : ''}T00:00:00Z`).toLocaleDateString('en-SG', { month: 'short', ...(value.length === 7 ? { year: 'numeric' } : { day: 'numeric' }), timeZone: 'UTC' });
const breakdowns = computed(() => data.value ? [
  { title: 'Impact by bakery', rows: data.value.bakeries, color: '#278260', subtitle: 'The bakeries making a difference' },
  { title: 'Food collected by charities', rows: data.value.charities, color: '#7257bb', subtitle: 'Sharing food with the community' },
] : []);
const recipients = computed(() => ['charity', 'individual'].map((role, index) => {
  const value = data.value?.recipients?.find((r) => r.role === role)?.collectedKg ?? 0;
  return { label: role === 'charity' ? 'Charities' : 'Individuals', value, color: palette[index], percent: data.value?.platform.collectedKg ? value / data.value.platform.collectedKg * 100 : 0 };
}));
const fridgeStates = [
  { key: 'stocked', label: 'Stocked', color: '#278260' }, { key: 'low', label: 'Running low', color: '#c67825' },
  { key: 'empty', label: 'Empty', color: '#bc4b50' }, { key: 'unknown', label: 'No update', color: '#7b8494' },
];
const fridges = computed(() => fridgeStates.map((s) => ({ ...s, count: data.value?.community?.fridges.find((f) => f.status === s.key)?.count ?? 0 })));
const fridgeTotal = computed(() => fridges.value.reduce((total, f) => total + f.count, 0));
const staleFridges = computed(() => data.value?.community?.fridges.reduce((total, f) => total + f.stale, 0) ?? 0);
const needs = computed(() => data.value?.community?.needs ?? { open: 0, pledged: 0, target: 0 });
const pledgePercent = computed(() => needs.value.target ? Math.min(100, needs.value.pledged / needs.value.target * 100) : 0);
const periodLabel = computed(() => applied.value.from || applied.value.to ? `${applied.value.from || 'Beginning'} → ${applied.value.to || 'Today'}` : 'All time');
let controller, refreshTimer, filterTimer, animations, disposed = false;
const revealedCards = new WeakSet();

async function load() {
  clearTimeout(filterTimer);
  filterTimer = null;
  if (from.value && to.value && from.value > to.value) { error.value = 'End date must be on or after start date.'; return; }
  controller?.abort();
  const request = new AbortController();
  controller = request;
  const dates = { from: from.value, to: to.value };
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get('/impact', { signal: request.signal, params: { ...(dates.from ? { from: dates.from } : {}), ...(dates.to ? { to: dates.to } : {}) } });
    if (disposed || request.signal.aborted) return;
    data.value = response.data;
    applied.value = dates;
    updatedAt.value = new Date();
    hovered.value = null;
  } catch (e) {
    if (!request.signal.aborted && !disposed) error.value = errorMessage(e);
  } finally {
    if (controller === request && !disposed) loading.value = false;
  }
}
function preset(days) {
  const now = new Date();
  const singaporeDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  from.value = days ? singaporeDay(new Date(now.getTime() - (days - 1) * 86400000)) : '';
  to.value = days ? singaporeDay(now) : '';
  load();
}
function refreshVisible() {
  if (document.visibilityState === 'visible' && !loading.value && !filterTimer) load();
}
function resizeChart() {
  const width = root.value.clientWidth;
  chartWidth.value = width < 768 ? Math.max(320, Math.round(width - 40)) : 760;
}
watch([from, to], () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(load, 450);
}, { flush: 'sync' });
watch([data, scope, metric, chartWidth], async ([newData], [oldData]) => {
  hovered.value = null;
  await nextTick();
  if (disposed || !root.value || !data.value) return;
  animations?.revert();
  animations = gsap.matchMedia();
  animations.add('(prefers-reduced-motion: no-preference)', () => {
    root.value.querySelectorAll('.impact-card').forEach((card) => {
      const seen = revealedCards.has(card);
      const timeline = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: { trigger: card, start: 'top 90%', once: true, onEnter: () => revealedCards.add(card) },
      });
      if (!seen) timeline.from(card, { y: 26, scale: 0.98, opacity: 0, duration: 0.55 }, 0);
      const bars = card.querySelectorAll('.chart-fill');
      if (bars.length) timeline.from(bars, { scaleX: 0, transformOrigin: 'left center', duration: 0.7, stagger: 0.04 }, 0.1);
      const path = card.querySelector('.trend-line');
      if (path) timeline.fromTo(path, { strokeDasharray: path.getTotalLength(), strokeDashoffset: path.getTotalLength() }, { strokeDashoffset: 0, duration: 0.9 }, 0.1);
      const segments = card.querySelectorAll('.ring-segment');
      if (segments.length) timeline.from(segments, { strokeDasharray: '0 100', duration: 0.75, stagger: 0.1 }, 0.1);
      if (newData !== oldData || !seen) card.querySelectorAll('[data-count]').forEach((el) => {
        const counter = { value: 0 };
        timeline.to(counter, { value: Number(el.dataset.count), duration: 0.65, onUpdate: () => { el.textContent = number(el.dataset.integer === 'true' ? Math.round(counter.value) : counter.value); } }, 0.1);
      });
    });
    ScrollTrigger.refresh();
    return () => root.value?.querySelectorAll('[data-count]').forEach((el) => { el.textContent = number(Number(el.dataset.count)); });
  }, root.value);
}, { flush: 'post' });
onMounted(() => {
  resizeChart();
  window.addEventListener('resize', resizeChart);
  load();
  refreshTimer = setInterval(refreshVisible, 60000);
  window.addEventListener('focus', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
});
onBeforeUnmount(() => {
  disposed = true;
  controller?.abort();
  clearInterval(refreshTimer);
  clearTimeout(filterTimer);
  animations?.revert();
  window.removeEventListener('resize', resizeChart);
  window.removeEventListener('focus', refreshVisible);
  document.removeEventListener('visibilitychange', refreshVisible);
});
</script>

<template>
  <div ref="root" class="impact-dashboard" :aria-busy="loading">
    <SiteBanner>
      <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <span class="eyebrow"><i class="bi bi-flower1 me-1" aria-hidden="true"></i> SMALL ACTIONS. SHARED IMPACT.</span>
          <BouncingHeading text="Good food. Greater impact." />
          <p class="text-body-secondary mb-0">A little less waste. A lot more possibility. See what we’re making happen together.</p>
        </div>
        <RouterLink v-if="!session.isAdmin" :to="session.isBakery ? '/orders' : '/reservations'" class="btn btn-outline-primary rounded-pill">{{ session.isBakery ? 'Manage collections' : 'Reservation history' }} <i class="bi bi-arrow-up-right ms-1" aria-hidden="true"></i></RouterLink>
      </div>
    </SiteBanner>

    <form class="impact-filter" @submit.prevent="load">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <span class="small fw-semibold me-1"><i class="bi bi-calendar3 me-1" aria-hidden="true"></i> Collection period</span>
        <button v-for="days in [30, 90, 0]" :key="days" type="button" class="btn btn-sm rounded-pill" :class="!days && !from && !to ? 'btn-primary' : 'btn-outline-secondary'" @click="preset(days)">{{ days ? `Last ${days} days` : 'All time' }}</button>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-end">
        <div><label for="impact-from" class="form-label small">From</label><input id="impact-from" v-model="from" class="form-control form-control-sm" type="date" :max="to || undefined" /></div>
        <span class="pb-1 text-body-secondary" aria-hidden="true">→</span>
        <div><label for="impact-to" class="form-label small">Through</label><input id="impact-to" v-model="to" class="form-control form-control-sm" type="date" :min="from || undefined" /></div>
        <button class="btn btn-primary btn-sm">Apply dates</button>
      </div>
    </form>
    <div class="d-flex justify-content-between flex-wrap gap-2 small text-body-secondary mb-4">
      <span>{{ periodLabel }} · Singapore time</span>
      <span role="status" aria-live="polite">{{ loading ? 'Updating impact…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })} · refreshes every minute` : '' }} <button type="button" class="refresh-button" aria-label="Refresh impact" :disabled="loading" @click="load"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i></button></span>
    </div>
    <div v-if="error" class="alert alert-danger" role="alert">{{ error }} <span v-if="data">Showing the last successful response.</span> <button class="btn btn-sm btn-outline-danger" @click="load">Retry</button></div>
    <div v-if="loading && !data" class="empty-chart" role="status">Loading impact…</div>

    <template v-if="data">
      <section v-for="section in sections" :key="section.title" class="mb-4">
        <div class="section-heading"><h2>{{ section.title }}</h2><span class="small text-body-secondary">{{ section.personal ? 'Your part in the bigger picture' : 'Every confirmed collection, counted once' }}</span></div>
        <div class="metric-grid">
          <article v-for="m in metrics" :key="m.key" class="impact-card metric-card" :class="`metric-${m.color}`">
            <div class="d-flex align-items-center justify-content-between"><span class="metric-label">{{ section.personal && session.isBakery && m.key === 'collectedKg' ? 'Kilograms donated' : m.label }}</span><i class="bi metric-icon" :class="m.icon" aria-hidden="true"></i></div>
            <div class="metric-number"><span :data-testid="m.key" :data-count="section.totals[m.key]" :data-integer="m.key === 'collections'" aria-hidden="true">{{ number(section.totals[m.key]) }}</span><span class="visually-hidden">{{ number(section.totals[m.key]) }}</span><span class="metric-unit">{{ m.unit }}</span></div>
            <span class="metric-footnote">{{ m.key === 'estimatedMeals' ? 'Based on recorded food weight' : m.key === 'collections' ? 'Bakery-confirmed handovers' : 'Food given a second chance' }}</span>
          </article>
        </div>
        <p v-if="!section.totals.collections" class="small text-body-secondary mt-2">No completed collections in this period yet.</p>
      </section>

      <div class="chart-grid mb-4">
        <section class="impact-card trend-panel">
          <div class="section-heading align-items-start"><div><span class="eyebrow">THE BIGGER PICTURE</span><h2 class="mt-1">Impact over time</h2></div>
            <div v-if="!session.isAdmin" class="scope-switch" role="group" aria-label="Trend scope"><button type="button" :aria-pressed="scope === 'platform'" @click="scope = 'platform'">Everyone</button><button type="button" :aria-pressed="scope === 'mine'" @click="scope = 'mine'">Your impact</button></div>
          </div>
          <div class="d-flex justify-content-between align-items-end gap-3 flex-wrap mb-2">
            <div><strong class="chart-total">{{ number(chartTotal) }}</strong> <span class="text-body-secondary">{{ selectedMetric.unit }} in this period</span></div>
            <div><label for="impact-metric" class="visually-hidden">Trend metric</label><select id="impact-metric" v-model="metric" class="form-select form-select-sm"><option v-for="m in metrics" :key="m.key" :value="m.key">{{ m.short }}</option></select></div>
          </div>
          <p class="small text-body-secondary">{{ data.trend.interval === 'day' ? 'Daily' : 'Monthly' }} totals · {{ scope === 'mine' ? 'Your confirmed collections' : 'All confirmed collections' }}</p>
          <div v-if="!points.length" class="empty-chart"><i class="bi bi-graph-up" aria-hidden="true"></i><p>No completed collections to chart yet.</p><span>Confirmed pickups will appear here.</span></div>
          <template v-else>
            <svg :viewBox="`0 0 ${chartWidth} 270`" class="trend-chart" role="img" :aria-label="`${selectedMetric.short} over time, ${scope === 'mine' ? 'personal' : 'platform'} totals. A data table follows.`">
              <defs><linearGradient id="impact-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#278260" stop-opacity="0.2" /><stop offset="100%" stop-color="#278260" stop-opacity="0.015" /></linearGradient></defs>
              <g v-for="fraction in [0, 0.5, 1]" :key="fraction"><line x1="52" :x2="chartWidth - 52" :y1="222 - fraction * 170" :y2="222 - fraction * 170" stroke="#e8ede9" stroke-dasharray="4 5" /><text x="44" :y="227 - fraction * 170" text-anchor="end" class="axis-label">{{ number(maximum * fraction) }}</text></g>
              <path :d="area" fill="url(#impact-area)" />
              <path :key="`${scope}-${metric}-${line}`" :d="line" fill="none" stroke="#278260" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="trend-line" />
              <g v-for="(p, index) in points" :key="p.date">
                <circle :cx="p.x" :cy="p.y" :r="hovered === index ? 6 : 3.5" fill="#278260" stroke="white" stroke-width="2" />
                <circle :cx="p.x" :cy="p.y" r="11" fill="transparent" tabindex="0" role="button" :aria-label="`${formatDate(p.date)}: ${number(p[metric])} ${selectedMetric.unit}`" @mouseenter="hovered = index" @mouseleave="hovered = null" @focus="hovered = index" @blur="hovered = null" @click="hovered = index" @keydown.enter="hovered = index" @keydown.space.prevent="hovered = index"><title>{{ formatDate(p.date) }}: {{ number(p[metric]) }} {{ selectedMetric.unit }}</title></circle>
              </g>
              <text v-for="p in ticks" :key="p.date" :x="p.x" y="253" text-anchor="middle" class="axis-label">{{ formatDate(p.date) }}</text>
            </svg>
            <div class="chart-readout"><span class="legend-dot" style="background: #278260"></span> {{ formatDate(point.date) }} <strong>{{ number(point[metric]) }} {{ selectedMetric.unit }}</strong></div>
            <details class="data-details" @toggle="ScrollTrigger.refresh()"><summary>View trend data</summary><div class="table-responsive trend-table"><table class="table table-sm"><caption class="visually-hidden">Impact over time</caption><thead><tr><th scope="col">Period</th><th scope="col" class="text-end">{{ selectedMetric.short }}</th></tr></thead><tbody><tr v-for="row in trend" :key="row.date"><th scope="row">{{ formatDate(row.date) }}</th><td class="text-end">{{ number(row[metric]) }}</td></tr></tbody></table></div></details>
          </template>
        </section>

        <section class="impact-card reach-panel">
          <span class="eyebrow">FOOD FINDS A HOME</span><h2 class="mt-1">Who we reach</h2><p class="small text-body-secondary">Platform food rescued by recipient type</p>
          <div class="ring-wrap">
            <svg viewBox="0 0 180 180" role="img" :aria-label="recipients.map((r) => `${r.label}: ${number(r.value)} kg`).join(', ')">
              <circle cx="90" cy="90" r="70" fill="none" stroke="#edf0ed" stroke-width="17" />
              <circle v-for="(r, index) in recipients" :key="r.label" class="ring-segment" cx="90" cy="90" r="70" pathLength="100" fill="none" :stroke="r.color" stroke-width="17" :stroke-dasharray="`${r.percent} ${100 - r.percent}`" :stroke-dashoffset="index ? -recipients[0].percent : 0" transform="rotate(-90 90 90)" />
            </svg>
            <div class="ring-centre"><strong>{{ number(data.platform.collectedKg) }}</strong><span>kg shared</span></div>
          </div>
          <div v-for="r in recipients" :key="r.label" class="recipient-row"><span><span class="legend-dot" :style="{ background: r.color }"></span>{{ r.label }}</span><strong>{{ number(r.value) }} kg <small>{{ number(r.percent) }}%</small></strong></div>
          <p v-if="!data.platform.collections" class="small text-body-secondary mt-3">No confirmed collections in this period.</p>
          <div class="reach-footer"><strong>{{ data.bakeries.length }}</strong> contributing bakeries <span>·</span> <strong>{{ data.charities.length }}</strong> collecting charities</div>
        </section>
      </div>

      <div class="two-column mb-4">
        <section v-for="table in breakdowns" :key="table.title" class="impact-card">
          <h2>{{ table.title }}</h2><p class="small text-body-secondary">{{ table.subtitle }}</p>
          <p v-if="!table.rows.length" class="empty-small">No completed collections in this period.</p>
          <div v-else class="table-responsive breakdown-table"><table class="table align-middle mb-0"><caption class="visually-hidden">{{ table.title }}</caption><thead><tr><th scope="col">Organisation</th><th scope="col" class="text-end">Kg</th><th scope="col" class="text-end">Estimated meals</th></tr></thead><tbody><tr v-for="(row, index) in table.rows" :key="index"><th scope="row"><span class="organisation-name">{{ row.name }}</span><span class="bar-track"><span class="chart-fill" :style="{ width: `${row.collectedKg / (table.rows[0].collectedKg || 1) * 100}%`, background: table.color }"></span></span></th><td class="text-end fw-semibold">{{ number(row.collectedKg) }}</td><td class="text-end">{{ number(row.estimatedMeals) }}</td></tr></tbody></table></div>
        </section>
      </div>

      <section class="impact-card mb-4">
        <div class="section-heading"><div><span class="eyebrow">EVERY BITE COUNTS</span><h2 class="mt-1">Most rescued foods</h2></div><span class="small text-body-secondary">Top 5 by collected weight · platform</span></div>
        <p v-if="!data.foods.length" class="empty-small">Food rankings will appear after a confirmed collection.</p>
        <div v-for="(food, index) in data.foods" :key="food.name" class="food-row"><span class="food-rank" :style="{ color: palette[index] }">{{ String(index + 1).padStart(2, '0') }}</span><div class="food-bar"><div class="d-flex justify-content-between gap-3"><strong>{{ food.name }}</strong><span>{{ number(food.collectedKg) }} kg</span></div><span class="bar-track"><span class="chart-fill" :style="{ width: `${food.collectedKg / (data.foods[0].collectedKg || 1) * 100}%`, background: palette[index] }"></span></span></div><span class="food-meals">{{ number(food.estimatedMeals) }} est. meals</span></div>
      </section>

      <div class="section-heading"><div><span class="eyebrow">MORE WAYS TO MAKE A DIFFERENCE</span><h2 class="mt-1">Community pulse</h2></div><span class="snapshot-label">Current snapshot · independent of date filters</span></div>
      <div class="two-column mb-4">
        <section class="impact-card">
          <div class="section-heading"><h3>Community fridges</h3><RouterLink to="/fridges" class="small">Explore fridges <i class="bi bi-arrow-up-right" aria-hidden="true"></i></RouterLink></div>
          <p><strong class="chart-total">{{ fridgeTotal }}</strong> <span class="text-body-secondary">active places to share</span></p>
          <div class="stacked-bar" role="img" :aria-label="fridges.map((f) => `${f.label}: ${f.count}`).join(', ')"><span v-for="f in fridges" :key="f.key" class="chart-fill" :style="{ width: `${fridgeTotal ? f.count / fridgeTotal * 100 : 0}%`, background: f.color }"></span></div>
          <div class="fridge-legend"><span v-for="f in fridges" :key="f.key"><span class="legend-dot" :style="{ background: f.color }"></span>{{ f.label }} <strong>{{ f.count }}</strong></span></div>
          <p class="small text-body-secondary mb-0 mt-3">Latest reported statuses. {{ staleFridges }} {{ staleFridges === 1 ? 'fridge has' : 'fridges have' }} no update within 24 hours. Fridge drop-offs are not weighed or included in rescue totals.</p>
        </section>
        <section class="impact-card needs-panel">
          <div class="section-heading"><h3>Charity needs</h3><RouterLink v-if="session.isBakery || session.isCharity" to="/needs" class="small">View needs board <i class="bi bi-arrow-up-right" aria-hidden="true"></i></RouterLink></div>
          <p><strong class="chart-total">{{ needs.open }}</strong> <span class="text-body-secondary">open requests with a future deadline</span></p>
          <div class="d-flex justify-content-between small mb-2"><span>{{ number(needs.pledged) }} items pledged</span><strong>{{ number(needs.target) }} requested</strong></div>
          <div class="bar-track needs-track" role="progressbar" aria-label="Items pledged toward open charity needs" :aria-valuenow="Math.round(pledgePercent)" aria-valuemin="0" aria-valuemax="100"><span class="chart-fill" :style="{ width: `${pledgePercent}%`, background: '#c67825' }"></span></div>
          <p class="small text-body-secondary mb-0 mt-3">{{ number(Math.max(0, needs.target - needs.pledged)) }} items still needed. Pledges are promises of support; they do not count as confirmed collections.</p>
        </section>
      </div>
      <footer class="impact-note"><i class="bi bi-info-circle" aria-hidden="true"></i><p>Only bakery-confirmed collections count toward rescued food. Meal estimates use the conversion recorded at reservation time (default: 500 g per meal). Cancelled and missed pickups are excluded. Bakery and charity figures describe the same food; platform totals count each collection once. Individual recipient identities stay private.</p></footer>
    </template>
  </div>
</template>

<style scoped>
.impact-dashboard { max-width: 1280px; margin: 0 auto; color: #263b33; }
.impact-header { padding: 10px 0 28px; }
.eyebrow { color: #39765c; font-size: .69rem; font-weight: 750; letter-spacing: .12em; }
h2 { font-size: 1.1rem; font-weight: 700; margin: 0; letter-spacing: -.02em; }
h3 { font-size: 1rem; font-weight: 700; margin: 0; }
.impact-filter { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 18px; background: #fff; border: 1px solid #e3e8e1; border-radius: 16px; padding: 16px 20px; margin-bottom: 12px; }
.impact-filter .form-label { margin-bottom: 4px; }
.refresh-button { border: 0; background: transparent; color: #39765c; padding: 0 5px; }
.section-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.metric-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.impact-card { border: 1px solid #e3e8e1; border-radius: 19px; background: #fff; padding: 24px; min-width: 0; }
.metric-card { position: relative; overflow: hidden; padding: 20px 24px; }
.metric-green { background: #eaf5ee; border-color: #d6e9dc; color: #246b4e; }
.metric-orange { background: #fff3e3; border-color: #f3e3c9; color: #8e531c; }
.metric-purple { background: #f0ecf9; border-color: #e2daf2; color: #65509a; }
.metric-label { font-size: .82rem; font-weight: 600; }
.metric-icon { font-size: 1.25rem; background: #ffffff85; border-radius: 12px; padding: 7px 10px; }
.metric-number { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: clamp(2rem, 3vw, 2.65rem); line-height: 1.3; font-weight: 750; letter-spacing: -.045em; margin: 8px 0; font-variant-numeric: tabular-nums; }
.metric-unit { font-size: .85rem; font-weight: 500; letter-spacing: 0; }
.metric-footnote { font-size: .73rem; }
.chart-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(0, 1fr); gap: 20px; }
.two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.chart-total { font-size: 2rem; font-weight: 750; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.scope-switch { display: flex; gap: 3px; background: #f2f4f0; padding: 4px; border-radius: 9px; }
.scope-switch button { border: 0; border-radius: 6px; padding: 5px 10px; font-size: .75rem; color: #52635a; background: transparent; }
.scope-switch button[aria-pressed=true] { background: #fff; color: #246b4e; box-shadow: 0 1px 4px #243c3215; font-weight: 700; }
.trend-chart { display: block; width: 100%; overflow: visible; }
.axis-label { font-size: 12px; fill: #6e7b73; }
.trend-chart circle[role=button]:focus-visible { outline: none; stroke: #7257bb; stroke-width: 2px; }
.chart-readout { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; font-size: .8rem; min-height: 30px; }
.chart-readout strong { margin-left: 8px; }
.data-details { color: #53675c; font-size: .75rem; margin-top: 15px; }
.data-details summary { cursor: pointer; }
.trend-table { max-height: 240px; margin-top: 12px; }
.ring-wrap { position: relative; width: 190px; margin: 16px auto 20px; }
.ring-wrap svg { width: 100%; display: block; }
.ring-centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.ring-centre strong { font-size: 1.9rem; letter-spacing: -.05em; }
.ring-centre span { color: #748078; font-size: .8rem; }
.legend-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-right: 7px; }
.recipient-row { display: flex; justify-content: space-between; gap: 8px; padding: 10px 0; font-size: .8rem; border-bottom: 1px solid #edf0eb; }
.recipient-row small { color: #6e7b73; margin-left: 8px; font-weight: 400; }
.reach-footer { color: #6e7b73; font-size: .73rem; padding-top: 18px; line-height: 1.8; }
.reach-footer strong { color: #263b33; }
.reach-footer > span { padding: 0 4px; }
.table { --bs-table-bg: transparent; color: #263b33; font-size: .81rem; }
.table thead th { color: #718076; font-size: .69rem; font-weight: 600; vertical-align: middle; }
.table tbody th, .table tbody td { padding-top: 14px; padding-bottom: 14px; }
.organisation-name { display: block; max-width: 240px; overflow-wrap: anywhere; }
.bar-track { display: block; height: 6px; background: #f0f2ed; border-radius: 20px; overflow: hidden; margin-top: 9px; }
.chart-fill { display: block; height: 100%; border-radius: inherit; }
.breakdown-table { max-height: 350px; }
.breakdown-table th:first-child { width: 55%; min-width: 130px; }
.food-row { display: flex; gap: 18px; align-items: center; padding: 14px 0; }
.food-rank { font-weight: 750; font-size: 1.2rem; }
.food-bar { flex: 1; min-width: 0; font-size: .82rem; }
.food-bar strong { overflow-wrap: anywhere; }
.food-bar .bar-track { height: 8px; }
.food-bar .d-flex > span { white-space: nowrap; }
.food-meals { min-width: 110px; text-align: right; font-size: .76rem; color: #718076; }
.snapshot-label { font-size: .72rem; background: #eeeae0; border-radius: 20px; padding: 5px 12px; color: #70654c; }
.stacked-bar { height: 13px; display: flex; background: #f0f2ed; border-radius: 15px; overflow: hidden; }
.stacked-bar .chart-fill { border-radius: 0; }
.fridge-legend { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; font-size: .78rem; }
.fridge-legend strong { margin-left: 5px; }
.needs-track { height: 13px; }
.impact-note { display: flex; gap: 12px; color: #748078; font-size: .73rem; line-height: 1.8; border-top: 1px solid #e3e8e1; padding: 20px 0; }
.impact-note p { margin: 0; }
.empty-chart { min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: #748078; padding: 24px; }
.empty-chart > i { font-size: 2rem; margin-bottom: 12px; }
.empty-chart p { margin-bottom: 5px; }
.empty-chart > span, .empty-small { font-size: .8rem; color: #748078; }
@media (max-width: 991px) { .chart-grid { grid-template-columns: minmax(0, 1fr); } .reach-panel .ring-wrap { width: 170px; } }
@media (max-width: 767px) { .metric-grid, .two-column { grid-template-columns: minmax(0, 1fr); } .impact-card { padding: 20px; } .metric-number { font-size: 2.2rem; } .metric-grid { gap: 10px; } .metric-card { padding: 16px 20px; } .impact-filter { padding: 15px; } .impact-filter input { max-width: 140px; } .impact-filter .d-flex { gap: 8px !important; } .food-meals { display: none; } .axis-label { font-size: 14px; } .section-heading > .small { font-size: .72rem; } }
</style>
