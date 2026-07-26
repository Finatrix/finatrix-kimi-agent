/**
 * Landmark + skip-link regression guard (WCAG 1.3.1 A, 2.4.1 A).
 *
 * The app shipped with no `<main>` landmark anywhere: the skip link pointed at
 * a plain `<div id="main">`, which screen readers do not expose as a landmark
 * and which cannot receive focus — so "Skip to content" moved the caret
 * nowhere. These tests pin both halves of the fix.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

// Lazy route chunks are slow under parallel workers; match the timeout the
// other routing suites use.
const LAZY = { timeout: 8000 };

describe('main landmark', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('exposes exactly one main landmark', async () => {
    const { container } = renderAt('/');
    expect(await screen.findByRole('main', undefined, LAZY)).toBeTruthy();
    expect(container.querySelectorAll('main')).toHaveLength(1);
  }, 15000);

  it('the skip-link target is the main landmark and is focusable', async () => {
    const { container } = renderAt('/');
    await screen.findByRole('main', undefined, LAZY);

    const skip = container.querySelector('a[href="#main"]');
    expect(skip, 'skip link must exist').toBeTruthy();

    const target = container.querySelector('#main');
    expect(target).toBeTruthy();
    expect(target!.tagName).toBe('MAIN');
    // Without a tabindex the browser will not move focus to a non-interactive
    // element, which is what made the skip link inert.
    expect(target!.getAttribute('tabindex')).toBe('-1');
  }, 15000);

  it('legal pages do not introduce a second main landmark', async () => {
    const { container } = renderAt('/privacy');
    await screen.findByRole('main', undefined, LAZY);
    expect(container.querySelectorAll('main')).toHaveLength(1);
  }, 15000);
});

/**
 * Chart canvases must carry a text alternative (WCAG 1.1.1 A).
 *
 * Chart.js renders into a `<canvas>`, which is an empty element to assistive
 * technology — it exposes no name, no role and none of the data drawn inside
 * it. All three charts in the app shipped bare, so the spending trend and the
 * whole LifeMap projection were simply absent for a screen-reader user. Each
 * now declares `role="img"` and an `aria-label` built from the same series the
 * chart plots.
 *
 * The assertion is deliberately structural rather than string-matching: it
 * fails for ANY future canvas that ships without a name, which is the mistake
 * worth catching, and stays silent when the wording changes.
 */
describe('chart accessibility', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  /**
   * A source-level guard rather than a render assertion, deliberately.
   *
   * None of the three charts mounts on first paint: the Expense Tracker's trend
   * needs logged spending and LifeMap's projection needs a completed profile.
   * A render test therefore reaches an empty NodeList and passes while asserting
   * nothing — which is exactly what the first version of this test did. Seeding
   * enough fixture state to force a chart would end up testing the forms.
   *
   * Scanning the source catches every canvas regardless of the state needed to
   * display it, including ones only reachable behind interaction, and it fails
   * at the point the mistake is actually made: writing a new chart without a
   * text alternative.
   */
  it('no chart ships a bare canvas anywhere in the source', () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        // Skip this directory: the test files legitimately contain the literal
        // "<canvas" in comments and matchers.
        if (entry.isDirectory()) { if (full !== __dirname) walk(full); continue; }
        if (!entry.name.endsWith('.tsx')) continue;

        // Strip block comments and comment-only lines so prose describing the
        // rule is not mistaken for a violation of it.
        const code = readFileSync(full, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .filter((l) => !/^\s*(\/\/|\*)/.test(l))
          .join('\n');

        for (const tag of code.match(/<canvas\b[^>]*>/g) ?? []) {
          if (!tag.includes('role="img"') || !tag.includes('aria-label')) {
            offenders.push(`${full}: ${tag.trim()}`);
          }
        }
      }
    };
    walk(join(__dirname, '..'));

    expect(offenders, 'every <canvas> needs role="img" + aria-label').toEqual([]);
  });
});
