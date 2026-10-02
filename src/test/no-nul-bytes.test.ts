/**
 * Source files must never contain a raw NUL byte (0x00).
 *
 * `supabase/functions/careers-ai/index.ts` once joined its cache-key fields
 * with two literal NULs typed straight into a template string. The runtime was
 * unaffected, but git's binary heuristic is "contains a NUL byte", so the file
 * silently became binary to every tool that reads it: `git diff` and
 * `git log -p` printed "Binary files differ", review saw nothing of a change to
 * an edge function that spends paid-API tokens, and plain `grep` skipped the
 * file. Nothing in the suite noticed.
 *
 * A NUL the code needs is written as an escape (`\u0000`), which produces the
 * identical runtime string. This test fails on the raw byte and names the file,
 * line and column, so the fix is a one-character edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../..');

/** Every hand-written text tree: the app, edge functions and SQL, the Worker, tooling. */
const ROOTS = ['src', 'supabase', 'worker', 'scripts'];

/** Text formats found in those trees. Binary assets (images, fonts) are skipped by construction. */
const TEXT_FILE = /\.(?:[cm]?[jt]sx?|css|html|json|md|sql|sh|py|toml|ya?ml|svg|txt)$/;

function textFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) textFiles(full, out);
    else if (TEXT_FILE.test(entry)) out.push(full);
  }
  return out;
}

/** `path:line:col (n NUL bytes)` for a file containing NUL, otherwise null. */
function nulLocation(file: string): string | null {
  const bytes = readFileSync(file);
  const at = bytes.indexOf(0);
  if (at === -1) return null;
  // latin1 maps one byte to one char, so the column is a byte column.
  const lines = bytes.subarray(0, at).toString('latin1').split('\n');
  const count = bytes.filter((b) => b === 0).length;
  return `${relative(ROOT, file)}:${lines.length}:${lines[lines.length - 1].length + 1} (${count} NUL bytes)`;
}

describe('source files contain no raw NUL bytes', () => {
  const files = ROOTS.flatMap((root) => textFiles(join(ROOT, root)));

  it('scans the trees it claims to', () => {
    // Guards against a renamed root or a too-narrow pattern passing vacuously.
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(join(ROOT, 'supabase/functions/careers-ai/index.ts'));
    expect(files).toContain(join(ROOT, 'src/main.tsx'));
  });

  it('finds none — write U+0000 as the `\\u0000` escape, never the raw byte', () => {
    const offenders = files.map(nulLocation).filter((hit): hit is string => hit !== null);
    expect(offenders).toEqual([]);
  });
});
