import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import hoverGate, { HOVER_MEDIA } from '../../scripts/postcss-hover-gate.js';

/** Output compared without whitespace: the plugin's job is structure, not formatting. */
const squash = (css: string) => css.replace(/\s+/g, '');
const run = (css: string) => squash(postcss([hoverGate()]).process(css, { from: undefined }).css);

describe('postcss hover gate', () => {
  it('moves a :hover rule behind the hover media query', () => {
    expect(run('.a:hover { color: red; }')).toBe(squash(`@media ${HOVER_MEDIA} { .a:hover { color: red; } }`));
  });

  it('splits a mixed selector list, leaving the non-hover part where it was', () => {
    const out = run('.a:hover, .a:focus-visible { color: red; }');
    expect(out).toBe(squash(`.a:focus-visible { color: red; } @media ${HOVER_MEDIA} { .a:hover { color: red; } }`));
  });

  it('leaves rules that are already gated alone', () => {
    const css = `@media ${HOVER_MEDIA} { .a:hover { color: red; } }`;
    expect(run(css)).toBe(squash(css));
  });

  it('gates hover rules nested in another media query', () => {
    expect(run('@media (max-width: 600px) { .a:hover { color: red; } }')).toBe(squash(`@media (max-width: 600px) { @media ${HOVER_MEDIA} { .a:hover { color: red; } } }`));
  });

  it('does not touch rules without :hover', () => {
    expect(run('.a:active { color: red; }')).toBe(squash('.a:active { color: red; }'));
  });
});
