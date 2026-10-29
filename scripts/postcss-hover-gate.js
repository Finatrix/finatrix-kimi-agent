/**
 * Moves every `:hover` rule behind `@media (hover: hover) and (pointer: fine)`.
 *
 * A phone has no hover, but it fires `:hover` on tap and keeps it until the
 * next tap somewhere else, so a hover lift or tint sticks to whatever was just
 * pressed. Tailwind's `hover:` utilities are already gated
 * (`future.hoverOnlyWhenSupported`); this does the same for the hand-written
 * stylesheets, so a new rule cannot reintroduce sticky hover by forgetting the
 * media query. The query matches Tailwind's, so both halves agree on which
 * devices hover.
 *
 * Mixed selector lists are split: `.a:hover, .a:focus-visible { … }` keeps the
 * focus selector where it was and moves only the hover one. Rules already
 * inside a hover media query, and keyframe steps, are left alone.
 */
export const HOVER_MEDIA = '(hover: hover) and (pointer: fine)';

const gatedAlready = (rule) => {
  for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
    if (p.type === 'atrule' && p.name === 'media' && /\bhover\s*:\s*hover\b/.test(p.params)) return true;
    if (p.type === 'atrule' && /keyframes$/i.test(p.name)) return true;
  }
  return false;
};

export default function hoverGate() {
  return {
    postcssPlugin: 'fx-hover-gate',
    OnceExit(root, { AtRule }) {
      root.walkRules((rule) => {
        if (!rule.selector.includes(':hover') || gatedAlready(rule)) return;
        const hover = rule.selectors.filter((s) => s.includes(':hover'));
        const rest = rule.selectors.filter((s) => !s.includes(':hover'));
        const media = new AtRule({ name: 'media', params: HOVER_MEDIA });
        media.append(rule.clone({ selectors: hover }));
        if (rest.length) {
          rule.selectors = rest;
          rule.after(media);
        } else {
          rule.replaceWith(media);
        }
      });
    },
  };
}
hoverGate.postcss = true;
