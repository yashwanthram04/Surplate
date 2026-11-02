<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../api';
import CountdownRing from '../components/CountdownRing.vue';
import CountUp from '../components/home/CountUp.vue';
import ListingCard from '../components/ListingCard.vue';
import { useHomeMotion } from '../composables/useHomeMotion';
import { useSession } from '../stores/session';
import '../home.css';

const session = useSession();
const root = ref(null);
const stats = ref(null);
const latest = ref([]);
const motion = useHomeMotion(root);

onMounted(async () => {
  motion.start(); // builds every scroll animation (see composables/useHomeMotion.js)
  // Both are decorative extras: if either call fails the page still reads fine.
  // They change the page height, so ScrollTrigger is told to re-measure once they land.
  const grow = async () => {
    await nextTick();
    motion.refresh();
  };
  api.get('/stats').then(({ data }) => (stats.value = data)).then(grow).catch(() => {});
  api.get('/listings', { params: { sort: 'newest' } }).then(({ data }) => (latest.value = data.items.slice(0, 3))).then(grow).catch(() => {});
});
onBeforeUnmount(() => motion.stop());

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
    points: ['Post a listing in about a minute', 'Edit stock as it sells, or re-post in one click', 'Listings expire automatically', 'New listings go to charities first'],
    cta: 'Register your bakery',
    to: '/register?role=bakery',
    btn: 'btn-primary',
  },
  {
    key: 'charity',
    emoji: '🤝',
    title: 'Charities',
    lead: 'Priority access to food for the people you serve.',
    points: ['See every available listing', 'Reserve during the charity priority period', 'Verified organisations only, so donors can trust you'],
    cta: 'Register a charity',
    to: '/register?role=charity',
    btn: 'btn-primary',
  },
  {
    key: 'individual',
    emoji: '🧑‍🍳',
    title: 'Individuals',
    lead: 'Good food, free, close to home.',
    points: ['Browse listings once charity priority ends', 'Find pickups you can actually reach in time', 'No verification needed, just sign up'],
    cta: 'Sign up as an individual',
    to: '/register?role=individual',
    btn: 'btn-outline-primary',
  },
];

const hasStats = computed(() => stats.value !== null);
</script>

<template>
  <div ref="root" class="home">
    <!-- the one piece of page furniture: a hairline that fills as you scroll -->
    <div class="scroll-progress" aria-hidden="true"></div>

    <!-- ================= hero ================= -->
    <section class="hero" aria-labelledby="hero-title">
      <div class="blob blob-a" aria-hidden="true"></div>
      <div class="blob blob-b" aria-hidden="true"></div>

      <div class="container position-relative">
        <div class="row align-items-center gy-5 gx-lg-5">
          <div class="col-lg-6 hero-copy">
            <span class="eyebrow"><span class="pulse-dot"></span>Free food, before it's binned</span>
            <h1 id="hero-title" data-hero-title class="hero-title font-display mt-3 mb-3">Good food shouldn't end up in the <span class="mark">bin</span>.</h1>
            <p class="lead text-body-secondary mb-4 hero-lede">
              Surplate connects bakeries and restaurants that have unsold food at closing time with the charities and neighbours who can use it, with a live map and a countdown to every pickup.
            </p>
            <div class="d-flex flex-wrap gap-2 hero-ctas">
              <template v-if="!session.isLoggedIn">
                <RouterLink to="/register?role=bakery" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-bakery"><i class="bi bi-shop me-2" aria-hidden="true"></i>I'm a bakery / restaurant</RouterLink>
                <RouterLink to="/register?role=individual" class="btn btn-outline-primary btn-lg btn-lift hero-individual-btn px-4" data-testid="cta-individual"><i class="bi bi-people me-2" aria-hidden="true"></i>I'm an individual / charity</RouterLink>
              </template>
              <template v-else-if="session.isBakery">
                <RouterLink to="/listings/new" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-post"><i class="bi bi-plus-lg me-2" aria-hidden="true"></i>Post surplus food</RouterLink>
                <RouterLink to="/my-listings" class="btn btn-outline-primary btn-lg btn-lift btn-on-white px-4">My listings</RouterLink>
              </template>
              <template v-else-if="session.isAdmin">
                <RouterLink to="/admin/charities" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-admin"><i class="bi bi-patch-check me-2" aria-hidden="true"></i>Verify charities</RouterLink>
                <RouterLink to="/browse" class="btn btn-outline-primary btn-lg btn-lift btn-on-white px-4">Browse food</RouterLink>
              </template>
              <template v-else>
                <RouterLink to="/browse" class="btn btn-primary btn-lg btn-lift px-4" data-testid="cta-find"><i class="bi bi-geo-alt me-2" aria-hidden="true"></i>Find food near me</RouterLink>
                <RouterLink to="/profile" class="btn btn-outline-primary btn-lg btn-lift btn-on-white px-4">My account</RouterLink>
              </template>
            </div>
            <div v-if="!session.isLoggedIn" class="mt-3 small text-body-secondary hero-note">
              Just looking? <RouterLink to="/browse" data-testid="cta-browse">Browse what's available now →</RouterLink>
            </div>
          </div>

          <div class="col-lg-6 d-none d-lg-block" aria-hidden="true">
            <div class="hero-visual">
              <div v-for="c in heroCards" :key="c.name" class="fcard-wrap" :class="c.cls">
                <div class="float-card">
                  <div class="thumb" :style="{ background: c.bg }">{{ c.emoji }}</div>
                  <div class="flex-grow-1">
                    <div class="fw-semibold lh-sm">{{ c.name }}</div>
                    <div class="small text-body-secondary">{{ c.by }}</div>
                  </div>
                  <CountdownRing :start="c.start" :end="c.end" :size="52" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="hero-cue" aria-hidden="true"><span class="cue-mouse"><i></i></span>Scroll</div>
    </section>

    <!-- ================= mission statement: the words light up as you scroll through it ================= -->
    <section class="statement" aria-labelledby="statement-title">
      <div class="container">
        <div id="statement-title" class="section-kicker mb-3" data-reveal>Why Surplate</div>
        <p class="statement-text font-display" data-statement>
          Every evening, good food is left on the counter. Surplate gives it <span class="em">somewhere to go</span>, before the timer runs out.
        </p>
      </div>
    </section>

    <!-- ================= live numbers ================= -->
    <section v-if="hasStats && stats.listings > 0" class="container live" aria-label="Right now on Surplate">
      <div class="row g-3" data-testid="live-stats">
        <div class="col-12 col-md-4">
          <div class="stat-tile" data-reveal>
            <div class="stat-number font-display"><CountUp :value="stats.items" data-testid="stat-items" /></div>
            <div class="text-body-secondary">items waiting to be rescued right now</div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="stat-tile" data-reveal>
            <div class="stat-number font-display"><CountUp :value="stats.listings" data-testid="stat-listings" /></div>
            <div class="text-body-secondary">live listings</div>
          </div>
        </div>
        <div class="col-6 col-md-4">
          <div class="stat-tile" data-reveal>
            <div class="stat-number font-display"><CountUp :value="stats.bakeries" data-testid="stat-bakeries" /></div>
            <div class="text-body-secondary">bakeries sharing</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= how it works: three stacked cards, or one pinned scene on wide screens ================= -->
    <section class="story" aria-labelledby="how-title">
      <div class="container story-static">
        <div class="text-center mb-5" data-reveal>
          <div class="section-kicker mb-2">How it works</div>
          <h2 id="how-title" class="section-title font-display mb-0">From the counter to the community in three steps</h2>
        </div>
        <div class="row g-4">
          <div v-for="(s, i) in steps" :key="s.title" class="col-md-4">
            <div class="step-card" data-reveal>
              <div class="icon-bubble" :style="{ background: s.bg }"><i class="bi" :class="s.icon" aria-hidden="true"></i></div>
              <div class="small fw-bold text-body-secondary mb-1">STEP {{ i + 1 }}</div>
              <h3 class="h5">{{ s.title }}</h3>
              <p class="mb-0 text-body-secondary">{{ s.text }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- pinned version (only shown when the page is wide and motion is allowed): scrolling plays the steps -->
      <div class="story-scene" data-active-step="1" data-testid="story-scene">
        <div class="scene-copy">
          <div class="section-kicker mb-2">How it works</div>
          <h2 class="section-title font-display">From the counter to the community in three steps</h2>
          <ol class="scene-steps">
            <li v-for="(s, i) in steps" :key="s.title" class="scene-step" :class="{ 'is-active': i === 0 }" :data-step="i + 1">
              <span class="scene-no">{{ i + 1 }}</span>
              <div><h3>{{ s.title }}</h3><p>{{ s.text }}</p></div>
            </li>
          </ol>
          <div class="scene-progress" aria-hidden="true"><i class="progress-fill"></i></div>
        </div>

        <div class="scene-stage" aria-hidden="true">
          <!-- 1. post -->
          <div class="panel p1">
            <div class="mock-card">
              <div class="mock-photo" data-pop>🥐</div>
              <div class="mock-lines"><i class="ln w70" data-pop></i><i class="ln w45" data-pop></i></div>
              <div class="mock-chips"><span data-pop>vegetarian</span><span data-pop class="warn">contains gluten</span><span data-pop>6 – 8 pm</span></div>
              <div class="mock-btn" data-pop>Post listing</div>
            </div>
          </div>
          <!-- 2. find -->
          <div class="panel p2">
            <div class="mock-map">
              <span class="map-radius"></span>
              <span class="map-pin" style="left: 24%; top: 34%"><b>🥐</b></span>
              <span class="map-pin" style="left: 58%; top: 26%"><b>🍞</b></span>
              <span class="map-pin" style="left: 46%; top: 62%"><b>🥖</b></span>
              <span class="map-me"></span>
              <div class="mock-filter"><span data-pop>🌱 vegan</span><span data-pop>📍 within 2 km</span><span data-pop>⏱ ending soon</span></div>
            </div>
          </div>
          <!-- 3. collect -->
          <div class="panel p3">
            <div class="mock-timer">
              <svg class="timer-ring" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="18" /><circle class="val" cx="22" cy="22" r="18" transform="rotate(-90 22 22)" /></svg>
              <div class="timer-label">1h 12m</div>
              <div class="timer-stamp">Collected ✓</div>
              <div class="mock-chips" data-pop><span>listing closes itself</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= the problem: a dark circle swallows the page; the number counts with your scroll ================= -->
    <section class="problem" aria-labelledby="problem-title">
      <div class="problem-iris" aria-hidden="true"></div>
      <div class="container problem-inner">
        <div class="row align-items-center gy-5 gx-lg-5">
          <div class="col-lg-6">
            <div class="section-kicker mb-2" style="color: #7fd19a" data-problem>The problem</div>
            <div class="big-number font-display" data-testid="waste-number" data-problem>
              <span aria-hidden="true" data-count="790000">790,000</span><span class="visually-hidden">790,000</span>
            </div>
            <h2 id="problem-title" class="h4 mt-2 fw-normal" data-problem>tonnes of food waste generated in Singapore in 2025</h2>
          </div>
          <div class="col-lg-6">
            <p class="fs-5" data-problem>Only <strong>18%</strong> of it was recycled. That works out to more than 2,100 tonnes of food every single day.</p>
            <div class="recycle-bar my-3" role="img" aria-label="18 per cent of food waste recycled" data-problem><div class="recycle-fill"></div></div>
            <p class="problem-muted" data-problem>
              Bakeries and restaurants are often left with unsold food at closing time that could be redistributed, while charities and neighbours in need struggle to find out what is available and when to collect it. Surplate closes that gap.
            </p>
            <p class="small problem-muted mb-0" data-problem>
              Source: National Environment Agency,
              <a href="https://www.nea.gov.sg/docs/default-source/default-document-library/annex-tables-and-charts.pdf" target="_blank" rel="noopener noreferrer">Waste statistics and overall recycling rate, CY2025 vs CY2024</a>.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= fresh on the board ================= -->
    <section v-if="latest.length" class="home-section latest" aria-labelledby="latest-title">
      <div class="container">
        <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-4" data-reveal>
          <div>
            <div class="section-kicker mb-2">Fresh on the board</div>
            <h2 id="latest-title" class="section-title font-display mb-0">Posted by bakeries just now</h2>
          </div>
          <RouterLink to="/browse" class="btn btn-outline-primary btn-lift">See everything on the map <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i></RouterLink>
        </div>
        <div class="row g-3" data-testid="latest-listings">
          <div v-for="(l, i) in latest" :key="l.id" class="col-12 col-md-6 col-lg-4" :data-parallax="i === 1 ? 0.14 : 0">
            <div class="h-100" data-reveal><ListingCard :listing="l" /></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= who it's for: pins, then the cards slide sideways ================= -->
    <section class="audiences" aria-labelledby="who-title">
      <div class="giant-word" aria-hidden="true">Bake · Share · Eat · Repeat</div>
      <div class="container audiences-head" data-reveal>
        <div class="section-kicker mb-2">Who it's for</div>
        <h2 id="who-title" class="section-title font-display mb-0">One board, three ways to help</h2>
      </div>
      <div class="h-track">
        <div v-for="a in audiences" :key="a.key" class="audience-card" :data-testid="`audience-${a.key}`">
          <div class="display-6 mb-2" aria-hidden="true">{{ a.emoji }}</div>
          <h3 class="h5">{{ a.title }}</h3>
          <p class="text-body-secondary">{{ a.lead }}</p>
          <ul>
            <li v-for="p in a.points" :key="p"><i class="bi bi-check-circle-fill" aria-hidden="true"></i><span>{{ p }}</span></li>
          </ul>
          <RouterLink v-if="!session.isLoggedIn" :to="a.to" class="btn btn-lift mt-auto" :class="a.btn">{{ a.cta }}</RouterLink>
        </div>
      </div>
    </section>

    <!-- ================= closing call to action ================= -->
    <section class="container pb-5 closing">
      <div class="cta-band text-center">
        <span class="cta-orb o1" aria-hidden="true">🥐</span><span class="cta-orb o2" aria-hidden="true">🍞</span><span class="cta-orb o3" aria-hidden="true">🥖</span>
        <h2 data-closing-title class="font-display fw-bold mb-2 position-relative">Tonight's leftovers could be someone's breakfast.</h2>
        <p class="mb-4 opacity-75 position-relative">Join in, or take a look at what is available near you right now.</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center position-relative">
          <RouterLink v-if="!session.isLoggedIn" to="/register" class="btn btn-light btn-lg btn-lift px-4">Create a free account</RouterLink>
          <RouterLink to="/browse" class="btn btn-outline-light btn-lg btn-lift px-4">Browse food</RouterLink>
        </div>
      </div>
    </section>

    <footer class="home-footer py-4">
      <div class="container d-flex flex-wrap justify-content-between gap-2 small text-body-secondary">
        <div><strong class="brand-mark">Surplate</strong> · IS216 Group 5 · rescuing surplus food, one pickup at a time</div>
        <div>Maps by <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> © Singapore Land Authority</div>
      </div>
    </footer>
  </div>
</template>
