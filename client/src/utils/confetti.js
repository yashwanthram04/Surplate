// A short burst of bakery-themed emoji from an element (or the middle of the screen). Pure Web Animations API:
// no dependency, cleans up after itself, and does nothing for people who ask for reduced motion.
const reduced = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (min, max) => min + Math.random() * (max - min);

export function burst(origin, { emojis = ['🥐', '🍞', '💛', '✨', '🧁', '🥖'], count = 28, spread = 280 } = {}) {
  if (reduced() || typeof document === 'undefined') return;
  const box = origin?.getBoundingClientRect?.();
  const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
  const y = box ? box.top + box.height / 2 : window.innerHeight / 3;

  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.textContent = emojis[i % emojis.length];
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    piece.style.fontSize = `${rand(16, 30)}px`;
    const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05); // upwards, fanned out
    const power = rand(0.4, 1) * spread;
    const dx = Math.cos(angle) * power;
    const dy = Math.sin(angle) * power;
    const spin = rand(-260, 260);
    piece.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 320}px)) scale(0.9) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: rand(1100, 1900), easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
    );
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2300);
}
