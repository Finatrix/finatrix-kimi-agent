import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every form control in the app must carry an accessible name.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A RENDER TEST
 * -----------------------------------------------
 * The Finance tools already get the real thing: `e2e/a11y-finance.spec.ts`
 * drives every `/tools/*` route through axe in a browser. Careers cannot be
 * reached that way — it sits behind sign-in and a paywall — and that is exactly
 * where the gap was. Fourteen `<select>` elements and four `datetime-local`
 * inputs across the Careers workspace had no accessible name of any kind: a
 * screen reader announced "combo box, low priority" with nothing to say what it
 * controlled. A further forty carried only a `placeholder`, which is a name
 * that disappears the moment the user types into the field (WCAG 3.3.2).
 *
 * So this reads the source. It is a coarse instrument — it cannot see a
 * `<label htmlFor>` pairing, so any control with an `id` is trusted — but it is
 * exact about the case it does catch, runs everywhere, and covers the gated
 * routes nothing else reaches.
 */

const SRC = join(__dirname, '..');
const CONTROLS = ['input', 'select', 'textarea'] as const;

/** Anything that gives a control a name without a separate `<label>` element. */
const NAMING_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'title='];

function tsxFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'test') continue;
      out.push(...tsxFilesUnder(full));
    } else if (name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Index of the `>` that closes the JSX open tag starting at `from`.
 *
 * Brace- and quote-aware, because a naive scan to the next `>` stops inside the
 * first arrow function in an `onChange` handler — which is how a scan like this
 * quietly reports nothing.
 */
function endOfOpenTag(src: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    } else if (c === '>' && depth === 0) {
      return i;
    }
  }
  return src.length;
}

interface Unnamed {
  where: string;
  tag: string;
  /** A placeholder is a name that vanishes on input — reported, not accepted. */
  placeholderOnly: string | null;
}

function unnamedControlsIn(file: string): Unnamed[] {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(SRC.length + 1);
  const found: Unnamed[] = [];

  for (const m of src.matchAll(new RegExp(`<(${CONTROLS.join('|')})(?=[\\s/>])`, 'g'))) {
    const start = m.index!;
    const attrs = src.slice(start + m[0].length, endOfOpenTag(src, start + m[0].length));

    if (NAMING_ATTRIBUTES.some((a) => attrs.includes(a))) continue;
    // An `id` may be paired with a `<label htmlFor>` this scan cannot see.
    if (attrs.includes('id=')) continue;
    // Not in the accessibility tree at all: `type="hidden"`, and the visually
    // hidden `<input type="file">` behind a labelled `role="button"` dropzone.
    if (/type=(["'])hidden\1/.test(attrs) || /\bhidden\b/.test(attrs)) continue;
    // Implicit labelling: the control is nested inside a `<label>` element.
    const before = src.slice(0, start);
    const opens = (before.match(/<label\b/g) ?? []).length;
    const closes = (before.match(/<\/label>/g) ?? []).length;
    if (opens > closes) continue;

    const placeholder = /placeholder=(["'])(.*?)\1/.exec(attrs);
    found.push({
      where: `${rel}:${before.split('\n').length}`,
      tag: m[1],
      placeholderOnly: placeholder?.[2] ?? null,
    });
  }
  return found;
}

describe('form controls carry an accessible name', () => {
  const files = tsxFilesUnder(SRC);

  it('finds the components it is meant to be guarding', () => {
    // Without this the whole suite is vacuous: a broken glob returns no files,
    // every assertion below passes, and the guard reads as green forever.
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.includes('careers'))).toBe(true);
  });

  it('leaves no control without any accessible name (WCAG 4.1.2)', () => {
    const nameless = files
      .flatMap(unnamedControlsIn)
      .filter((c) => c.placeholderOnly === null)
      .map((c) => `${c.where} <${c.tag}>`);

    expect(
      nameless,
      `add an aria-label (or wrap in a <label>) to:\n${nameless.join('\n')}`,
    ).toEqual([]);
  });

  it('never relies on a placeholder alone for a control name (WCAG 3.3.2)', () => {
    const placeholderOnly = files
      .flatMap(unnamedControlsIn)
      .filter((c) => c.placeholderOnly !== null)
      .map((c) => `${c.where} <${c.tag}> placeholder="${c.placeholderOnly}"`);

    expect(
      placeholderOnly,
      `a placeholder disappears as soon as the field has content — add a matching aria-label to:\n${placeholderOnly.join('\n')}`,
    ).toEqual([]);
  });
});
