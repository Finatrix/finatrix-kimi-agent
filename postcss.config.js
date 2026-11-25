import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import hoverGate from './scripts/postcss-hover-gate.js';

export default {
  // Hover gating runs after Tailwind so it sees the final rules (Tailwind's own
  // `hover:` output is already gated and is skipped).
  plugins: [tailwindcss(), hoverGate(), autoprefixer()],
}
