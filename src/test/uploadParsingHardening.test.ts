/**
 * Guards on the upload pipeline — the only place FinatriX parses hostile input.
 *
 * pdf.js reads a résumé or a bank statement, and Tesseract reads the scans
 * pdf.js could not: files chosen by whoever is at the keyboard, or forwarded to
 * them by someone else. Three properties keep that survivable, none of them a
 * default, and this pins all three.
 *
 * 1. A PAGE CEILING, which is not a default. `numPages` is read from the file's
 *    own page tree, so it is attacker-chosen: a few kilobytes of PDF can
 *    declare tens of thousands of pages, and both readers allocate per page.
 *    Unbounded, that is a frozen tab from a file the user was invited to
 *    upload. It is one forgotten check away from being absent again — a third
 *    reader, or a refactor of a `getDocument` call — and `npm audit` will never
 *    notice, because this is about how the library is CALLED, not which
 *    version is installed.
 *
 * 2. NO EVAL IN THE SHIPPED LIBRARY. pdf.js used to JIT-compile
 *    file-controlled PostScript functions and font charstrings through
 *    `new Function`; CVE-2024-4367 / GHSA-hq66-cqwq-w95j is that path becoming
 *    arbitrary script execution from a crafted font. v5 deleted the compiler
 *    and the `isEvalSupported` flag that used to switch it off, so on
 *    pdfjs-dist 6 there is nothing to disable — the mitigation is that the code
 *    is gone.
 *
 *    That is worth asserting rather than assuming, because the CSP is not the
 *    backstop it appears to be: `script-src` names no `'unsafe-eval'`, but
 *    pdf.js parses inside a dedicated Worker served from `/assets/*`, and
 *    `public/_headers` deliberately attaches no policy to that prefix (a
 *    blanket one would block WASM in the Tesseract worker). So the one place
 *    the app parses hostile bytes is the one place the CSP does not reach. If a
 *    future pdfjs reintroduces an eval path, nothing in the deployment stops
 *    it — this test is what makes that arrive as a build failure with
 *    instructions instead of as a silent regression.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(__dirname, '..');
const pdfjsBuild = join(srcRoot, '..', 'node_modules', 'pdfjs-dist', 'build');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test') continue; // this file names the APIs it guards
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Files that open a pdf.js document at all. */
function pdfReaders(): string[] {
  return sourceFiles(srcRoot).filter((f) => /getDocument\s*\(/.test(readFileSync(f, 'utf8')));
}

describe('pdf.js call sites', () => {
  it('has readers to check (the guard is not vacuously passing)', () => {
    expect(pdfReaders().length).toBeGreaterThan(0);
  });

  it('bounds the page count before looping over pages', () => {
    const offenders = pdfReaders()
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        // The per-page loops are `p <= doc.numPages`, so the ceiling has to be
        // an explicit `>` comparison against a named limit, not the loop bound.
        return !/numPages\s*>\s*[A-Z_a-z]/.test(src);
      })
      .map((f) => f.slice(srcRoot.length + 1));

    expect(
      offenders,
      'A pdf.js reader loops over pages with no ceiling. `numPages` comes from the '
        + 'uploaded file, so a small crafted PDF can declare tens of thousands of pages '
        + 'and hang the tab. Reject above the limit rather than truncating — silently '
        + 'reading the first N pages of a bank statement drops transactions.',
    ).toEqual([]);
  });
});

describe('the shipped pdfjs-dist build', () => {
  /** Both halves: the worker does the parsing, the main thread the display. */
  const BUNDLES = ['pdf.mjs', 'pdf.worker.mjs'];

  it.each(BUNDLES)('%s contains no eval path', (bundle) => {
    const file = join(pdfjsBuild, bundle);
    // A renamed or relocated bundle must fail loudly rather than skip: a guard
    // that quietly checks nothing is worse than no guard.
    expect(existsSync(file), `${bundle} not found — has pdfjs-dist restructured?`).toBe(true);

    const src = readFileSync(file, 'utf8');
    const hits = [...src.matchAll(/\bnew Function\b|\beval\s*\(/g)].map((m) => m[0]);

    expect(
      hits,
      `${bundle} reintroduced a dynamic-code path. This is the CVE-2024-4367 class of `
        + 'bug, and the CSP does NOT cover it: pdf.js parses in a Worker served from '
        + '/assets/*, which public/_headers leaves without a policy on purpose (a blanket '
        + 'one breaks WASM in the Tesseract worker). Pass `isEvalSupported: false` to every '
        + 'getDocument call if this pdfjs major has restored the flag; if it has not, the '
        + 'app needs its own answer before shipping this version.',
    ).toEqual([]);
  });
});

/**
 * The OCR worker must load from a URL the CSP can match.
 *
 * tesseract.js defaults `workerBlobURL` to true, which wraps `workerPath` in
 * `new Worker(URL.createObjectURL(blob))`. A blob: URL is not matched by
 * `'self'`, so the CSP blocks it — and blocks it silently, because
 * `new Worker()` does not throw for a policy-blocked blob URL. It returns a
 * worker that never runs, OCR never answers, and the caller's catch tells the
 * user their scan was too unclear to read.
 *
 * That is invisible to every other kind of test: the unit suite never spawns a
 * worker, the build succeeds, and the only trace at runtime is a
 * `securitypolicyviolation` event in a console nobody is watching. Self-hosting
 * the worker script does not help on its own — the blob wrapper is applied to
 * whatever path it is given. So the option is pinned here.
 */
describe('the self-hosted OCR worker', () => {
  it('is spawned from its own URL, not a blob the CSP cannot match', () => {
    const src = readFileSync(join(srcRoot, 'careers', 'parser', 'ocr.ts'), 'utf8');
    expect(
      /workerBlobURL\s*:\s*false/.test(src),
      'tesseract.js must be created with `workerBlobURL: false`. Its default wraps the '
        + 'worker in a blob: URL, which `worker-src \'self\'` does not match — and '
        + '`new Worker()` does not throw when that is blocked, so OCR fails silently and '
        + 'the user is told their scan was unreadable.',
    ).toBe(true);
  });
});
