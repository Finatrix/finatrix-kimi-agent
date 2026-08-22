/**
 * Structural guard: every `createPortal` root carries the tools token scope.
 *
 * WHY THIS EXISTS
 * ---------------
 * CSS custom properties inherit down the **DOM** tree. React's `createPortal`
 * keeps a component in the React tree but moves its node to `document.body` —
 * outside `.fx-tools`, which is where the entire tools/careers token block
 * lives (`--card-solid`, `--hair`, `--ink3`, `--gold`, `--gold-bg`,
 * `--fill-05`, `--z-modal`, …). A portal that forgets the class therefore
 * resolves every one of those to nothing.
 *
 * The failure is quiet and asymmetric, which is what makes it worth a test
 * rather than a code review note. `color` is an inherited property, so muted
 * text just renders at full ink and looks *fine*. `background` is not, so an
 * unresolved `var()` computes to `transparent` — and on the dark theme the
 * overlay's own scrim sits behind the panel and hides it. The Command Palette
 * shipped like this: correct-looking on dark, and on light the page read
 * straight through the panel, with no active-row highlight and no border.
 *
 * `.fx-scope` is the other half of the pair and is equally load-bearing: it
 * cancels `.fx-tools`'s `min-height: 100%`, which on a `position: fixed`
 * element resolves against the VIEWPORT and once laid the undo toast out
 * 100vh tall with its button above the top of the screen. See the "Portaled
 * token scope" note in src/tools/tools.css.
 *
 * So the rule is structural: if a file calls `createPortal`, its portal root
 * must carry both classes. Checked at the file level rather than by parsing
 * JSX — the portal root is sometimes a variable built well above the call —
 * which is enough to catch the only mistake anyone actually makes here:
 * writing a portal and never thinking about the token scope at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test') continue; // this file names the API it guards
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Both classes, in either order, anywhere in the file's className strings. */
const HAS_SCOPE = /className\s*=\s*(?:"|'|\{`)[^"'`]*\bfx-tools\b[^"'`]*\bfx-scope\b/;

describe('portaled roots carry the tools token scope', () => {
  it('every file calling createPortal renders it inside .fx-tools.fx-scope', () => {
    const offenders = sourceFiles(srcRoot)
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return /\bcreatePortal\s*\(/.test(src) && !HAS_SCOPE.test(src);
      })
      .map((f) => f.slice(srcRoot.length + 1));

    expect(
      offenders,
      'A portal root is missing `className="fx-tools fx-scope"`. Portaled nodes '
        + 'land on <body>, outside the .fx-tools token block, so every var(--card-solid), '
        + 'var(--hair), var(--ink3) and var(--gold-bg) inside resolves to nothing — the '
        + 'panel computes to a transparent background, which is invisible on dark and '
        + 'broken on light. Pair `.fx-scope` with it to cancel the shell\'s min-height.',
    ).toEqual([]);
  });
});
