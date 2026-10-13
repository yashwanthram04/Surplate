<script setup>
import { Motion } from 'motion-v';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import CountUp from '../components/home/CountUp.vue';
import Reveal from '../components/home/Reveal.vue';
import ListingCard from '../components/ListingCard.vue';
import CountdownRing from '../components/CountdownRing.vue';
import { useSession } from '../stores/session';
import '../home.css';

const session = useSession();
const stats = ref(null);
const latest = ref([]);

onMounted(async () => {
  // Both are decorative extras: if either call fails the page still reads fine.
  api.get('/stats').then(({ data }) => (stats.value = data)).catch(() => {});
  api.get('/listings', { params: { sort: 'newest' } }).then(({ data }) => (latest.value = data.items.slice(0, 3))).catch(() => {});
});

// Example cards in the hero (decorative). Times are relative to page load so the rings look alive.
const t0 = Date.now();
const iso = (min) => new Date(t0 + min * 60000).toISOString();
const heroCards = [
  { cls: 'c1', emoji: '🥐', bg: 'linear-gradient(135deg,#fde68a,#f59e0b)', name: 'Butter croissants', by: 'Sunrise Bakery', start: iso(-30), end: iso(95) },
  { cls: 'c2', emoji: '🍞', bg: 'linear-gradient(135deg,#fed7aa,#c2410c)', name: 'Sourdough loaves', by: 'Crumb & Co', start: iso(-10), end: iso(200) },
  { cls: 'c3', emoji: '🥟', bg: 'linear-gradient(135deg,#bbf7d0,#15803d)', name: 'Halal curry puffs', by: 'Golden Loaf', start: iso(-45), end: iso(25) },
];

const steps = [
  { icon: 'bi-camera', bg: '#fde68a', title: 'Bakeries post leftovers', text: 'Snap a photo, set the quantity, allergens, best-before time and a pickup window. It takes about a minute.' },
  { icon: 'bi-geo-alt', bg: '#bbf7d0', title: 'People find food nearby', text: 'Browse a live map, filter by distance, dietary needs and pickup time, and see exactly how long is left.' },
  { icon: 'bi-bag-check', bg: '#bfdbfe', title: 'Collect before the timer ends', text: 'When the pickup window closes, the listing disappears on its own, so nothing stale stays on the board.' },
];

const audiences = [
  {
    key: 'bakery',
    emoji: '🥖',
    title: 'Bakeries & restaurants',
    lead: 'Turn closing-time leftovers into a good deed.',
    points: ['Post a listing in about a minute', 'Edit stock as it sells, or re-post in one click', 'Listings expire automatically', 'Decide who gets to see each listing'],
    cta: 'Register your bakery',
    to: '/register?role=bakery',
    btn: 'btn-primary',
  },
  {
    key: 'charity',
    emoji: '🤝',
    title: 'Charities',
    lead: 'Priority access to food for the people you serve.',
    points: ['See every available listing', 'Request food for your community', 'Verified organisations only, so donors can trust you'],
    cta: 'Register a charity',
    to: '/register?role=charity',
    btn: 'btn-primary',
  },
  {
    key: 'individual',
    emoji: '🧑‍🍳',
    title: 'Individuals',
    lead: 'Good food, free, close to home.',
    points: ['Browse listings bakeries share publicly', 'Find pickups you can actually reach in time', 'No verification needed, just sign up'],
    cta: 'Sign up as an individual',
    to: '/register?role=individual',
    btn: 'btn-outline-primary',
  },
];

const hasStats = computed(() => stats.value !== null);
</script>

<template>
  <div class="home">
    <!-- ================= hero ================= -->
    <section class="home-hero" aria-labelledby="hero-title">
      <div class="blob blob-a" aria-hidden="true"></div>
      <div class="blob blob-b" aria-hidden="true"></div>

      <div class="container position-relative">
        <div class="row align-items-center gy-5 gx-lg-5">
          <div class="col-lg-6">
            <Motion :initial="{ opacity: 0, y: 18 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.5 }">
              <span class="eyebrow"><span class="pulse-dot"></span>Free food, before it's binned</span>
            </Motion>
            <Motion as="h1" id="hero-title" class="hero-title font-display mt-3 mb-3" :initial="{ opacity: 0, y: 24 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.6, delay: 0.12 }">
              Good food shouldn't end up in the <span class="mark">bin</span>.
            </Motion>
            <Motion as="p" class="lead text-body-secondary mb-4" :initial="{ opacity: 0, y: 24 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.6, delay: 0.25 }">
              Surplate connects bakeries and restaurants that have unsold food at closing time with the charities and neighbours who can use it, with a live map and a countdown to every pickup.
            </Motion>
            <Motion class="d-flex flex-wrap gap-2" :initial="{ opacity: 0, y: 24 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.6, delay: 0.38 }">
              <template v-if="!session.isLoggedIn">
                <RouterLink to="/register?role=bakery" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-bakery"><i class="bi bi-shop me-2" aria-hidden="true"></i>I'm a bakery / restaurant</RouterLink>
                <RouterLink to="/register?role=individual" class="btn btn-outline-primary btn-lg btn-lift px-4 bg-white" data-testid="cta-individual"><i class="bi bi-people me-2" aria-hidden="true"></i>I'm an individual / charity</RouterLink>
              </template>
              <template v-else-if="session.isBakery">
                <RouterLink to="/listings/new" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-post"><i class="bi bi-plus-lg me-2" aria-hidden="true"></i>Post surplus food</RouterLink>
                <RouterLink to="/my-listings" class="btn btn-outline-primary btn-lg btn-lift px-4 bg-white">My listings</RouterLink>
              </template>
              <template v-else-if="session.isAdmin">
                <RouterLink to="/admin/charities" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-admin"><i class="bi bi-patch-check me-2" aria-hidden="true"></i>Verify charities</RouterLink>
                <RouterLink to="/browse" class="btn btn-outline-primary btn-lg btn-lift px-4 bg-white">Browse food</RouterLink>
              </template>
              <template v-else>
                <RouterLink to="/browse" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-find"><i class="bi bi-geo-alt me-2" aria-hidden="true"></i>Find food near me</RouterLink>
                <RouterLink to="/profile" class="btn btn-outline-primary btn-lg btn-lift px-4 bg-white">My account</RouterLink>
              </template>
            </Motion>
            <Motion v-if="!session.isLoggedIn" class="mt-3 small text-body-secondary" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.6, delay: 0.6 }">
              Just looking? <RouterLink to="/browse" data-testid="cta-browse">Browse what's available now →</RouterLink>
            </Motion>
          </div>

          <div class="col-lg-6 d-none d-lg-block" aria-hidden="true">
            <div class="hero-visual">
              <Motion
                v-for="(c, i) in heroCards"
                :key="c.name"
                class="float-card"
                :class="c.cls"
                :initial="{ opacity: 0, scale: 0.85 }"
                :animate="{ opacity: 1, scale: 1 }"
                :transition="{ type: 'spring', stiffness: 160, damping: 16, delay: 0.5 + i * 0.18 }"
              >
                <div class="thumb" :style="{ background: c.bg }">{{ c.emoji }}</div>
                <div class="flex-grow-1">
                  <div class="fw-semibold lh-sm">{{ c.name }}</div>
                  <div class="small text-body-secondary">{{ c.by }}</div>
                </div>
                <CountdownRing :start="c.start" :end="c.end" :size="52" />
              </Motion>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= live numbers ================= -->
    <section v-if="hasStats && stats.listings > 0" class="container" style="margin-top: -2.2rem; position: relative; z-index: 2" aria-label="Right now on Surplate">
      <div class="row g-3" data-testid="live-stats">
        <div class="col-12 col-md-4">
          <Reveal :delay="0">
            <div class="stat-tile">
              <div class="stat-number font-display"><CountUp :value="stats.items" data-testid="stat-items" /></div>
              <div class="text-body-secondary">items waiting to be rescued right now</div>
            </div>
          </Reveal>
        </div>
        <div class="col-6 col-md-4">
          <Reveal :delay="0.1">
            <div class="stat-tile">
              <div class="stat-number font-display"><CountUp :value="stats.listings" data-testid="stat-listings" /></div>
              <div class="text-body-secondary">live listings</div>
            </div>
          </Reveal>
        </div>
        <div class="col-6 col-md-4">
          <Reveal :delay="0.2">
            <div class="stat-tile">
              <div class="stat-number font-display"><CountUp :value="stats.bakeries" data-testid="stat-bakeries" /></div>
              <div class="text-body-secondary">bakeries sharing</div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>

    <!-- ================= how it works ================= -->
    <section class="home-section" aria-labelledby="how-title">
      <div class="container">
        <Reveal class="text-center mb-5">
          <div class="section-kicker mb-2">How it works</div>
          <h2 id="how-title" class="section-title font-display mb-0">From the counter to the community in three steps</h2>
        </Reveal>
        <div class="row g-4">
          <div v-for="(s, i) in steps" :key="s.title" class="col-md-4">
            <Reveal :delay="i * 0.12" class="h-100">
              <div class="step-card">
                <div class="icon-bubble" :style="{ background: s.bg }"><i class="bi" :class="s.icon" aria-hidden="true"></i></div>
                <div class="small fw-bold text-body-secondary mb-1">STEP {{ i + 1 }}</div>
                <h3 class="h5">{{ s.title }}</h3>
                <p class="mb-0 text-body-secondary">{{ s.text }}</p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= the problem ================= -->
    <section class="problem-band home-section" aria-labelledby="problem-title">
      <div class="container">
        <div class="row align-items-center gy-5 gx-lg-5">
          <div class="col-lg-6">
            <Reveal>
              <div class="section-kicker mb-2" style="color: #7fd19a">The problem</div>
              <div class="big-number font-display" data-testid="waste-number"><CountUp :value="790000" :duration="2200" /></div>
              <h2 id="problem-title" class="h4 mt-2 fw-normal">tonnes of food waste generated in Singapore in 2025</h2>
            </Reveal>
          </div>
          <div class="col-lg-6">
            <Reveal :delay="0.12">
              <p class="fs-5">Only <strong>18%</strong> of it was recycled. That works out to more than 2,100 tonnes of food every single day.</p>
              <div class="recycle-bar my-3" role="img" aria-label="18 per cent of food waste recycled">
                <Motion :initial="{ width: '0%' }" :while-in-view="{ width: '18%' }" :in-view-options="{ once: true, amount: 0.6 }" :transition="{ duration: 1.4, ease: 'easeOut', delay: 0.2 }" />
              </div>
              <p class="opacity-75">
                Bakeries and restaurants are often left with unsold food at closing time that could be redistributed, while charities and neighbours in need struggle to find out what is available and when to collect it. Surplate closes that gap.
              </p>
              <p class="small opacity-75 mb-0">
                Source: National Environment Agency,
                <a href="https://www.nea.gov.sg/docs/default-source/default-document-library/annex-tables-and-charts.pdf" target="_blank" rel="noopener noreferrer">Waste statistics and overall recycling rate, CY2025 vs CY2024</a>.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= fresh on the board ================= -->
    <section v-if="latest.length" class="home-section" aria-labelledby="latest-title">
      <div class="container">
        <Reveal class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-4">
          <div>
            <div class="section-kicker mb-2">Fresh on the board</div>
            <h2 id="latest-title" class="section-title font-display mb-0">Posted by bakeries just now</h2>
          </div>
          <RouterLink to="/browse" class="btn btn-outline-primary btn-lift">See everything on the map <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i></RouterLink>
        </Reveal>
        <div class="row g-3" data-testid="latest-listings">
          <div v-for="(l, i) in latest" :key="l.id" class="col-12 col-md-6 col-lg-4">
            <Reveal :delay="i * 0.1" class="h-100"><ListingCard :listing="l" /></Reveal>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= who it's for ================= -->
    <section class="home-section pt-0" aria-labelledby="who-title">
      <div class="container">
        <Reveal class="text-center mb-5">
          <div class="section-kicker mb-2">Who it's for</div>
          <h2 id="who-title" class="section-title font-display mb-0">One board, three ways to help</h2>
        </Reveal>
        <div class="row g-4">
          <div v-for="(a, i) in audiences" :key="a.key" class="col-md-6 col-lg-4">
            <Reveal :delay="i * 0.12" class="h-100">
              <div class="audience-card" :data-testid="`audience-${a.key}`">
                <div class="display-6 mb-2" aria-hidden="true">{{ a.emoji }}</div>
                <h3 class="h5">{{ a.title }}</h3>
                <p class="text-body-secondary">{{ a.lead }}</p>
                <ul>
                  <li v-for="p in a.points" :key="p"><i class="bi bi-check-circle-fill" aria-hidden="true"></i><span>{{ p }}</span></li>
                </ul>
                <RouterLink v-if="!session.isLoggedIn" :to="a.to" class="btn btn-lift mt-auto" :class="a.btn">{{ a.cta }}</RouterLink>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= closing call to action ================= -->
    <section class="container pb-5">
      <Reveal>
        <div class="cta-band text-center">
          <h2 class="font-display fw-bold mb-2 position-relative">Tonight's leftovers could be someone's breakfast.</h2>
          <p class="mb-4 opacity-75 position-relative">Join in, or take a look at what is available near you right now.</p>
          <div class="d-flex flex-wrap gap-2 justify-content-center position-relative">
            <RouterLink v-if="!session.isLoggedIn" to="/register" class="btn btn-light btn-lg btn-lift px-4">Create a free account</RouterLink>
            <RouterLink to="/browse" class="btn btn-outline-light btn-lg btn-lift px-4">Browse food</RouterLink>
          </div>
        </div>
      </Reveal>
    </section>

    <footer class="home-footer py-4">
      <div class="container d-flex flex-wrap justify-content-between gap-2 small text-body-secondary">
        <div><strong class="brand-mark">Surplate</strong> · IS216 Group 5 · rescuing surplus food, one pickup at a time</div>
        <div>Maps by <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> © Singapore Land Authority</div>
      </div>
    </footer>
  </div>
</template>
