/**
 * Supply-chain guard: SheetJS must stay on the write path only.
 *
 * `xlsx@0.18.5` carries two high-severity advisories with NO fix on the npm
 * registry — GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9
 * (ReDoS). SheetJS publishes patched builds only from its own CDN, so the
 * options are: take a non-registry tarball as a production dependency, or keep
 * the vulnerable code unreachable.
 *
 * Both advisories are in the PARSER. They are triggered by reading a hostile
 * workbook — `XLSX.read`, `readFile`, `sheet_to_json`. FinatriX never reads a
 * workbook: all three call sites build a sheet from data the app already holds
 * (`aoa_to_sheet`) and serialise it (`write`). Nothing untrusted is ever handed
 * to SheetJS, so neither advisory is reachable, and adding a CDN dependency
 * would trade a real supply-chain risk for a theoretical one.
 *
 * That reasoning is only valid while it stays true. A future `XLSX.read` — an
 * "import your bank statement" feature is the obvious one — would silently make
 * both advisories live, and `npm audit` would not change by a single line
 * because it already reports them. This test is the tripwire: it fails the
 * build the moment SheetJS gains a reader, forcing the migration decision to be
 * made deliberately rather than discovered after an incident.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcRoot = join(__dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test') continue; // this file names the APIs it forbids
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Workbook-PARSING entry points. Any of these makes the advisories reachable. */
const READER_APIS = /\bXLSX\s*\.\s*(read|readFile)\b|\bsheet_to_json\b/;

describe('SheetJS stays write-only', () => {
  it('no source file calls a workbook-reading API', () => {
    const offenders = sourceFiles(srcRoot)
      .filter((f) => READER_APIS.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(srcRoot.length + 1));

    expect(
      offenders,
      'A SheetJS reader was introduced. xlsx@0.18.5 has unpatched prototype-pollution '
        + 'and ReDoS advisories in exactly that code path, and no registry fix exists. '
        + 'Migrate to the patched SheetJS CDN build (>=0.20.2) before parsing workbooks.',
    ).toEqual([]);
  });
});
