import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * All the scroll-driven motion on the home page, in one place.
 *
 *   GSAP          timelines, tweens and the render loop
 *   ScrollTrigger scrubbing, pinning, parallax and reveal-on-scroll
 *   SplitText     the headline, mission statement and closing line are split into characters and words
 *   Lenis         inertial ("buttery") smooth scrolling, fed into ScrollTrigger
 *
 * The page is deliberately quiet: a few purposeful scenes (hero, mission statement, pinned "how it works",
 * the problem, sideways audiences) and nothing decorative competing with them.
 *
 * Design rules:
 *   - The page's HTML/CSS is complete and readable with no JavaScript. Hidden "before" states are only
 *     set from here, so anyone with "reduce motion" on (and no JS) just gets the finished static page.
 *   - Pinned scenes (the story, the horizontal row) only run on wide screens. Phones get stacked content.
 *   - Everything is created inside gsap.matchMedia(), so it is torn down and rebuilt when the window
 *     is resized across a breakpoint or the visitor changes their motion setting.
 *
 * Markup hooks are data attributes (data-reveal, data-parallax, data-statement, ...) and a few
 * classes, all documented where they are used in HomeView.vue.
 */
export function useHomeMotion(rootRef) {
  let mm = null;
  let scope = null; // gsap context handed to us by matchMedia: lets us add animations after the first build

  const q = (sel) => rootRef.value.querySelector(sel);
  const qa = (sel) => gsap.utils.toArray(sel, rootRef.value);

  function start() {
    mm = gsap.matchMedia();
    mm.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        wide: '(min-width: 992px)',
        fine: '(hover: hover) and (pointer: fine)',
      },
      (context) => {
        const { motion, wide, fine } = context.conditions;
        if (!motion) return; // reduced motion: keep the static page exactly as rendered
        scope = context;
        context.add('bindReveals', bindReveals);

        const cleanups = [];
        cleanups.push(smoothScroll());
        scrollProgress();
        cleanups.push(hero(fine));
        statement();
        // ScrollTriggers must be created top-to-bottom in page order: every pin adds scroll distance, and the
        // sections below it are measured on top of that. Pinned scenes first, then everything that depends on them.
        if (wide) story();
        problemScene(wide);
        if (wide) horizontalAudiences();
        bindReveals();
        parallaxElements();
        closing();

        // Layout moves when fonts, images and API data arrive: tell ScrollTrigger to re-measure.
        const refresh = () => ScrollTrigger.refresh();
        requestAnimationFrame(refresh);
        document.fonts?.ready.then(refresh);
        window.addEventListener('load', refresh);
        cleanups.push(() => window.removeEventListener('load', refresh));

        return () => {
          scope = null;
          cleanups.forEach((fn) => fn && fn());
          rootRef.value?.classList.remove('is-pinned-story', 'is-horizontal');
        };
      },
      rootRef.value
    );
  }

  /** Call after content that changes the page height arrives (live stats, newest listings). */
  function refresh() {
    if (!scope) return;
    scope.bindReveals?.();
    ScrollTrigger.refresh();
  }

  function stop() {
    mm?.revert();
    mm = null;
    scope = null;
  }

  // ---------------------------------------------------------------------------------------------
  // Smooth scrolling (Lenis -> ScrollTrigger)
  // ---------------------------------------------------------------------------------------------
  function smoothScroll() {
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }

  // Thin bar across the top that fills as you scroll the page
  function scrollProgress() {
    gsap.to(q('.scroll-progress'), {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Hero: split-text headline, staggered entrance, mouse + scroll parallax
  // ---------------------------------------------------------------------------------------------
  function hero(fine) {
    const title = q('[data-hero-title]');
    if (title) {
      SplitText.create(title, {
        type: 'lines,chars',
        mask: 'lines',
        linesClass: 'split-line',
        charsClass: 'split-char',
        autoSplit: true, // re-split if the font loads late or the window is resized
        onSplit: (self) =>
          gsap.from(self.chars, { yPercent: 115, rotate: 7, duration: 1, stagger: 0.022, ease: 'power4.out', delay: 0.15 }),
      });
    }

    const intro = gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from('.hero .eyebrow', { y: 24, opacity: 0, duration: 0.7 }, 0)
      .from('.hero-lede', { y: 28, opacity: 0, duration: 0.8 }, 0.55)
      .from('.hero-ctas > *', { y: 30, opacity: 0, stagger: 0.1, duration: 0.7 }, 0.75)
      .from('.hero-cue', { opacity: 0, y: -10, duration: 0.8 }, 1.4)
      .from('.fcard-wrap', { scale: 0.86, opacity: 0, y: 60, rotate: (i) => (i % 2 ? 5 : -5), stagger: 0.14, duration: 1.2 }, 0.5);
    if (q('.hero-note')) intro.from('.hero-note', { opacity: 0, duration: 0.8 }, 1.1); // only shown to logged-out visitors

    // Scroll: the copy lifts away, the cards drift up at different speeds, the blobs lag behind
    const heroScroll = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero-copy', { y: -90, opacity: 0.15, ease: 'none', scrollTrigger: heroScroll });
    gsap.to('.hero-cue', { opacity: 0, ease: 'none', scrollTrigger: { ...heroScroll, end: '+=200' } });
    qa('.fcard-wrap').forEach((el, i) => gsap.to(el, { y: -140 - i * 70, rotate: (i % 2 ? 1 : -1) * 4, ease: 'none', scrollTrigger: heroScroll }));
    gsap.to('.blob-a', { y: 220, scale: 1.3, ease: 'none', scrollTrigger: heroScroll });
    gsap.to('.blob-b', { y: -160, scale: 1.2, ease: 'none', scrollTrigger: heroScroll });

    // Mouse parallax on the example cards (each card has its own depth)
    if (fine) {
      const hero = q('.hero');
      const movers = qa('.fcard-wrap').map((el, i) => ({
        x: gsap.quickTo(el.querySelector('.float-card'), 'x', { duration: 0.8, ease: 'power3' }),
        y: gsap.quickTo(el.querySelector('.float-card'), 'y', { duration: 0.8, ease: 'power3' }),
        depth: 18 + i * 12,
      }));
      const onMove = (e) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        movers.forEach((m) => {
          m.x(nx * m.depth * 2);
          m.y(ny * m.depth * 2);
        });
      };
      hero.addEventListener('mousemove', onMove);
      return () => hero.removeEventListener('mousemove', onMove);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Mission statement: the words light up one after another as you scroll through the sentence
  // ---------------------------------------------------------------------------------------------
  function statement() {
    const line = q('[data-statement]');
    if (!line) return;
    SplitText.create(line, {
      type: 'words',
      wordsClass: 'st-word',
      aria: 'none', // a plain <p> ignores aria-label, so leave the real words readable instead of hiding them
      autoSplit: true, // re-split if the font loads late or the window is resized
      onSplit: (self) =>
        gsap.fromTo(
          self.words,
          { opacity: 0.14 },
          { opacity: 1, ease: 'none', stagger: 0.12, scrollTrigger: { trigger: line, start: 'top 80%', end: 'bottom 50%', scrub: 0.6 } }
        ),
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Generic reveal-on-scroll: anything with data-reveal rises and fades in (staggered per batch)
  // Re-run after data arrives: already-bound elements are skipped.
  // ---------------------------------------------------------------------------------------------
  function bindReveals() {
    const fresh = qa('[data-reveal]:not([data-reveal-bound])');
    if (!fresh.length) return;
    fresh.forEach((el) => el.setAttribute('data-reveal-bound', ''));
    gsap.set(fresh, { opacity: 0, y: 40 });
    ScrollTrigger.batch(fresh, {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', overwrite: true }),
    });
  }

  // Elements that drift at their own speed as they cross the screen: data-parallax="-0.2" (fraction of viewport height)
  function parallaxElements() {
    qa('[data-parallax]').forEach((el) => {
      const speed = Number(el.dataset.parallax);
      gsap.fromTo(
        el,
        { y: () => -speed * window.innerHeight * 0.5 },
        { y: () => speed * window.innerHeight * 0.5, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } }
      );
    });
  }

  // ---------------------------------------------------------------------------------------------
  // The problem: a dark circle swallows the page, then the number counts up with your scroll
  // ---------------------------------------------------------------------------------------------
  function problemScene(wide) {
    const section = q('.problem');
    const iris = q('.problem-iris');
    const number = q('[data-count]');
    if (!section || !iris || !number) return;
    const target = Number(number.dataset.count);
    const counter = { value: 0 };

    gsap.set(iris, { clipPath: 'circle(7% at 50% 55%)' }); // a dark seed is visible from the first frame, so the pin never starts on a blank screen
    gsap.set('[data-problem]', { opacity: 0, y: 50 });
    gsap.set('.recycle-fill', { scaleX: 0 });
    number.textContent = '0';

    // Wide screens pin the scene. On phones the content is taller than the screen, so it scrubs without pinning.
    const trigger = wide
      ? { trigger: section, start: 'top top', end: '+=170%', pin: true, scrub: 0.7, anticipatePin: 1 }
      : { trigger: section, start: 'top 75%', end: 'bottom 85%', scrub: 0.7 };
    gsap
      .timeline({ defaults: { ease: 'none' }, scrollTrigger: trigger })
      .to(iris, { clipPath: 'circle(150% at 50% 55%)', duration: 1.2, ease: 'power1.in' })
      .to('[data-problem]', { opacity: 1, y: 0, stagger: 0.18, duration: 0.5, ease: 'power3.out' }, 1.25) // only once the circle has covered the whole page
      .to(counter, { value: target, duration: 1.3, onUpdate: () => (number.textContent = Math.round(counter.value).toLocaleString('en-SG')) }, 1.35)
      .to('.recycle-fill', { scaleX: 1, duration: 0.9, ease: 'power2.out' }, 2.05)
      .to({}, { duration: 0.6 }); // hold the finished scene for a beat
  }

  // ---------------------------------------------------------------------------------------------
  // "How it works": one pinned scene. Scrolling advances through three illustrated steps.
  // Wide screens only; narrow screens keep the three stacked cards.
  // ---------------------------------------------------------------------------------------------
  function story() {
    const section = q('.story');
    const scene = q('.story-scene');
    if (!section || !scene) return;
    rootRef.value.classList.add('is-pinned-story');

    const panels = qa('.story-scene .panel');
    const steps = qa('.scene-step');
    gsap.set(panels.slice(1), { opacity: 0, y: 70, scale: 0.92 });
    gsap.set('[data-pop]', { opacity: 0, y: 24, scale: 0.8 });
    gsap.set('.map-pin', { opacity: 0, y: -120 });
    gsap.set('.map-radius', { scale: 0, opacity: 0 });
    gsap.set('.timer-stamp', { opacity: 0, scale: 2.4, rotate: -18 });
    gsap.set('.progress-fill', { scaleY: 0 });

    const ring = q('.timer-ring .val');
    const circumference = 2 * Math.PI * 18;
    gsap.set(ring, { strokeDasharray: circumference, strokeDashoffset: 0 });
    const label = q('.timer-label');
    const timer = { left: 72 };

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=320%',
        pin: true,
        scrub: 0.7,
        anticipatePin: 1,
        onUpdate: (self) => {
          const active = Math.min(3, 1 + Math.floor(self.progress * 3 * 0.9999));
          if (Number(scene.dataset.activeStep) !== active) {
            scene.dataset.activeStep = active;
            steps.forEach((el, i) => el.classList.toggle('is-active', i + 1 === active));
          }
        },
      },
    });

    // 0 -> 1 : the listing builds itself
    tl.to('.p1 [data-pop]', { opacity: 1, y: 0, scale: 1, stagger: 0.12, duration: 0.5, ease: 'back.out(1.6)' }, 0.05)
      .to('.p1 .mock-btn', { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1 }, 0.82)
      // 1 -> 2 : the listing leaves, the map arrives and pins drop in
      .to('.p1', { opacity: 0, y: -70, scale: 1.06, duration: 0.35 }, 0.92)
      .to('.p2', { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out' }, 1.0)
      .to('.map-radius', { scale: 1, opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.1)
      .to('.map-pin', { opacity: 1, y: 0, stagger: 0.14, duration: 0.45, ease: 'bounce.out' }, 1.2)
      .to('.p2 [data-pop]', { opacity: 1, y: 0, scale: 1, stagger: 0.1, duration: 0.4, ease: 'back.out(1.6)' }, 1.3)
      // 2 -> 3 : the map leaves, the countdown ring drains, the collected stamp lands
      .to('.p2', { opacity: 0, y: -70, scale: 1.06, duration: 0.35 }, 1.92)
      .to('.p3', { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out' }, 2.0)
      .to(ring, { strokeDashoffset: circumference * 0.97, duration: 0.8, ease: 'power1.inOut' }, 2.15)
      .to(timer, { left: 0, duration: 0.8, ease: 'power1.inOut', onUpdate: () => (label.textContent = timer.left >= 60 ? `${Math.floor(timer.left / 60)}h ${String(Math.round(timer.left % 60)).padStart(2, '0')}m` : `${Math.max(0, Math.round(timer.left))}m`) }, 2.15)
      .to('.timer-stamp', { opacity: 1, scale: 1, rotate: -8, duration: 0.25, ease: 'power4.in' }, 2.8)
      .to('.p3 [data-pop]', { opacity: 1, y: 0, scale: 1, stagger: 0.1, duration: 0.3 }, 2.45)
      .to('.progress-fill', { scaleY: 1, duration: 3 }, 0)
      .to({}, { duration: 0.2 }, 3);
  }

  // ---------------------------------------------------------------------------------------------
  // "Who it's for": the section pins and the three cards slide sideways as you scroll down
  // ---------------------------------------------------------------------------------------------
  function horizontalAudiences() {
    const section = q('.audiences');
    const track = q('.h-track');
    if (!section || !track) return;
    rootRef.value.classList.add('is-horizontal');
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 120);

    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true },
    });
    // the giant background word slides against the cards
    gsap.fromTo('.giant-word', { x: 0 }, { x: () => distance() * 0.45, ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance()}`, scrub: true, invalidateOnRefresh: true } });
    // each card swells as it reaches the middle of the screen
    qa('.audience-card').forEach((card) => {
      gsap.fromTo(card, { scale: 0.86, opacity: 0.55 }, { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: card, containerAnimation: slide, start: 'left 95%', end: 'left 45%', scrub: true } });
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Closing banner: the sentence is split into words that rise one after another
  // ---------------------------------------------------------------------------------------------
  function closing() {
    const line = q('[data-closing-title]');
    if (line) {
      SplitText.create(line, {
        type: 'words',
        mask: 'words',
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.words, { yPercent: 120, rotate: 4, duration: 0.9, stagger: 0.07, ease: 'power4.out', scrollTrigger: { trigger: line, start: 'top 85%', once: true } }),
      });
    }
    gsap.fromTo('.cta-orb', { y: 80, scale: 0.8 }, { y: -80, scale: 1.2, ease: 'none', scrollTrigger: { trigger: '.cta-band', start: 'top bottom', end: 'bottom top', scrub: true } });
  }

  return { start, stop, refresh };
}
