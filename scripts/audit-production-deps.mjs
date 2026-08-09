#!/usr/bin/env node
/**
 * Production dependency audit with an EXPLICIT, machine-checked allowlist.
 *
 * WHY THIS EXISTS
 * ---------------
 * The CI gate used to be:
 *
 *     npm audit --omit=dev --audit-level=critical
 *
 * with the accepted advisories written out in a YAML comment beside it. That
 * has one failure mode, and it is silent: `--audit-level=critical` cannot tell
 * "assessed and accepted" apart from "nobody has ever seen this". Every HIGH
 * advisory passes — the reviewed ones and the brand-new ones alike.
 *
 * It did not stay theoretical. `pdfjs-dist` picked up GHSA-hq66-cqwq-w95j —
 * arbitrary JavaScript execution when opening a malicious PDF, in the library
 * that parses user-uploaded résumés — and the gate went green on every run,
 * because "high" is below "critical". The comment listed xlsx and react-router;
 * it never mentioned pdfjs, because nothing ever told anyone to look.
 *
 * So the bar is now HIGH, and acceptance is data rather than prose: an advisory
 * is tolerated only if its package is listed in ACCEPTED below, with a reason
 * and the condition that would end the acceptance. Anything else fails.
 *
 * Deliberately two-directional — a stale allowlist is also an error:
 *   • a NEW high/critical advisory fails the build (nothing to hide behind), and
 *   • an allowlist entry whose advisory is GONE also fails, so entries are
 *     deleted when they stop being true instead of accumulating as folklore.
 *
 * Usage:  node scripts/audit-production-deps.mjs
 */

import { execFileSync } from 'node:child_process';

/** Severities that fail the build unless explicitly accepted. */
const BLOCKING = new Set(['high', 'critical']);

/**
 * Advisories reviewed and knowingly accepted, keyed by package name.
 *
 * Add an entry only with a real reachability argument — "no fix available" on
 * its own is not one. `until` states what must change for the entry to go.
 */
const ACCEPTED = {
  xlsx: {
    why:
      'Both advisories (GHSA-4r6h-8v6p-xvw6 prototype pollution, '
      + 'GHSA-5pgg-2g8v-p4x9 ReDoS) are in the workbook PARSER. FinatriX never '
      + 'parses a workbook — all three call sites only build a sheet from data '
      + 'the app already holds (aoa_to_sheet) and serialise it (write), so the '
      + 'vulnerable code is unreachable. Enforced by '
      + 'src/test/xlsx-write-only.test.ts, which fails the build if a reader '
      + 'is ever introduced. The registry has no fixed version; the patched '
      + 'build ships only from SheetJS\'s own CDN, and taking a non-registry '
      + 'tarball as a production dependency is the larger supply-chain risk.',
    until: 'a SheetJS reader is needed, or a fixed version reaches the npm registry',
  },
};

function runAudit() {
  try {
    // Exits non-zero whenever it finds anything, so a throw is the normal path.
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.trim()) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(runAudit());
const advisories = Object.values(report.vulnerabilities ?? {});

const blocking = advisories.filter((v) => BLOCKING.has(v.severity));
const unexpected = blocking.filter((v) => !ACCEPTED[v.name]);
const staleEntries = Object.keys(ACCEPTED).filter(
  (name) => !blocking.some((v) => v.name === name),
);

/** `via` holds either advisory objects or bare package-name strings. */
function titlesFor(vuln) {
  return (vuln.via ?? [])
    .filter((v) => typeof v === 'object' && v.title)
    .map((v) => `${v.title}${v.url ? ` (${v.url})` : ''}`);
}

for (const vuln of unexpected) {
  console.error(`\n✖ ${vuln.name} — ${vuln.severity.toUpperCase()}`);
  for (const title of titlesFor(vuln)) console.error(`    ${title}`);
  console.error(
    vuln.fixAvailable
      ? '    A fix is available: run `npm audit fix` (or bump the dependency).'
      : '    No registry fix. Assess reachability, then add an ACCEPTED entry '
        + 'in scripts/audit-production-deps.mjs with the argument and a test '
        + 'that pins it.',
  );
}

for (const name of staleEntries) {
  console.error(
    `\n✖ ACCEPTED entry "${name}" no longer matches any high/critical advisory.`
    + '\n    The exemption is stale — delete it from '
    + 'scripts/audit-production-deps.mjs.',
  );
}

if (unexpected.length || staleEntries.length) {
  console.error('\nProduction dependency audit failed.\n');
  process.exit(1);
}

const accepted = blocking.map((v) => v.name).join(', ');
console.log(
  `✓ No unreviewed high/critical advisories in production dependencies.`
  + (accepted ? `\n  Knowingly accepted: ${accepted}` : ''),
);
