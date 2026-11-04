<script setup>
import { gsap } from 'gsap';
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
  compact: Boolean,
  icon: { type: String, default: 'bi-heart-fill' },
});
const copy = ref(null);
let context;
onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  context = gsap.context(() => {
    const descriptions = copy.value.querySelectorAll('p, .text-body-secondary');
    if (descriptions.length) gsap.from(descriptions, { y: 34, scale: 0.85, opacity: 0, duration: 0.75, ease: 'back.out(2.2)', stagger: 0.12, delay: 0.75, clearProps: 'transform,opacity' });
  }, copy.value);
});
onBeforeUnmount(() => context?.revert());
</script>

<template>
  <header class="community-banner" :class="{ 'is-compact': compact }">
    <div ref="copy" class="banner-copy"><slot /></div>
    <div class="banner-art" aria-hidden="true">
      <span class="food bread">🥖</span>
      <span class="food apple">🍎</span>
      <span class="food leaf">🌿</span>
      <span class="food croissant">🥐</span>
      <span class="banner-heart"><i class="bi" :class="icon"></i></span>
      <span class="spark first">✦</span><span class="spark second">✦</span>
    </div>
  </header>
</template>

<style scoped>
.community-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
  overflow: hidden;
  padding: clamp(24px, 4vw, 44px);
  margin-bottom: 28px;
  border-radius: 32px;
  color: #fff;
  background: radial-gradient(ellipse at top left, #ffffff20, transparent 60%), linear-gradient(135deg, #3c9c63, var(--sp-green) 45%, #1e5a39);
  box-shadow: 0 26px 48px -26px #26644080, inset 0 -6px 0 #00000012;
}
.community-banner::before, .community-banner::after {
  content: '';
  position: absolute;
  width: 260px;
  height: 260px;
  border: 1px solid #ffffff18;
  border-radius: 50%;
  pointer-events: none;
}
.community-banner::before { right: -80px; top: -150px; }
.community-banner::after { right: 50px; bottom: -220px; }
.banner-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.banner-copy :deep(h1) { font-family: 'Fredoka', system-ui, sans-serif; color: #fff; }
.banner-copy :deep(h1) { overflow-wrap: anywhere; }
.banner-copy :deep(p), .banner-copy :deep(.text-body-secondary) { font-family: var(--bs-body-font-family); font-size: 1.05rem; font-weight: 400; line-height: 1.5; color: #ffffffeb !important; max-width: 46ch; overflow-wrap: anywhere; }
.banner-copy :deep(a:not(.btn)) { color: #ffdf98; }
.banner-copy :deep(p:last-child) { margin-bottom: 0; }
.banner-copy :deep(.eyebrow) { color: #ffdf98; }
.banner-copy :deep(.btn-primary) { --bs-btn-bg: #ffdf98; --bs-btn-border-color: #ffdf98; --bs-btn-color: #244b35; --bs-btn-hover-bg: #fff0cd; --bs-btn-hover-color: #244b35; --bs-btn-hover-border-color: #fff0cd; }
.banner-copy :deep(.btn-outline-primary), .banner-copy :deep(.btn-outline-secondary) {
  --bs-btn-color: #fff;
  --bs-btn-border-color: #ffffff90;
  --bs-btn-hover-bg: #fff;
  --bs-btn-hover-color: var(--sp-green-dark);
  --bs-btn-hover-border-color: #fff;
}
.banner-art { position: relative; flex: 0 0 140px; height: 150px; }
.banner-heart {
  position: absolute; inset: 37px 30px;
  display: grid; place-items: center;
  font-size: 38px; color: #ffdf98;
  border-radius: 24px; background: #ffffff16; border: 1px solid #ffffff35;
  transform: rotate(-8deg); box-shadow: 0 12px 20px #153f3520;
}
.food, .spark { position: absolute; user-select: none; }
.food { font-size: 29px; animation: food-float 5s ease-in-out infinite alternate; }
.bread { left: 0; top: 7px; rotate: -20deg; }
.apple { right: 2px; top: 12px; animation-delay: -2s; }
.leaf { left: 0; bottom: 0; animation-delay: -3s; }
.croissant { right: 0; bottom: 0; rotate: 15deg; animation-delay: -1s; }
.spark { color: #ffdf98; font-size: 18px; }
.first { left: 65px; top: 0; }.second { left: 65px; bottom: 0; font-size: 13px; }
.is-compact { padding: 24px; border-radius: 24px; }
.is-compact .banner-art { flex-basis: 80px; height: 100px; }
.is-compact .banner-heart { inset: 22px 10px; font-size: 28px; border-radius: 18px; }
.is-compact .food { font-size: 22px; }
.is-compact .apple, .is-compact .leaf, .is-compact .spark { display: none; }
@keyframes food-float { from { transform: translateY(-4px) rotate(-5deg); } to { transform: translateY(5px) rotate(5deg); } }
@media (max-width: 575px) {
  .community-banner { gap: 12px; border-radius: 24px; }
  .banner-art { flex-basis: 58px; height: 110px; }
  .banner-heart { inset: 30px 0; font-size: 25px; border-radius: 17px; }
  .food { font-size: 22px; }
  .bread { left: 0; top: 0; }.croissant { right: 0; bottom: 0; }
  .apple, .leaf, .spark { display: none; }
  .is-compact .banner-art { flex-basis: 50px; }
  .is-compact .banner-heart { inset-inline: 0; }
}
@media (prefers-reduced-motion: reduce) { .food { animation: none; } }
</style>
