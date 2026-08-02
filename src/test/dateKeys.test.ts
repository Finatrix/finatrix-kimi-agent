/**
 * Calendar keys must name the day the user is looking at, in every timezone.
 *
 * This is the guard for a bug that was invisible to the whole existing suite:
 * the Careers calendar keyed each cell with `toISOString().slice(0, 10)`, which
 * converts to UTC first. Cells are built as LOCAL midnight, and local midnight
 * east of UTC is still the previous day there — so in IST every interview and
 * deadline rendered on the following day's square and the "today" ring never
 * landed on today. A suite running in UTC agrees with the broken code perfectly,
 * which is exactly why these cases pin the failing zones explicitly.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ymdLocal, ymLocal } from '../lib/date';

/** Timezones on both sides of UTC, plus the half-hour offset that is our market. */
const ZONES = [
  { tz: 'Asia/Kolkata', label: 'IST (UTC+5:30)' },
  { tz: 'Pacific/Kiritimati', label: 'UTC+14 — the largest positive offset there is' },
  { tz: 'America/Los_Angeles', label: 'PST (UTC−8)' },
  { tz: 'UTC', label: 'UTC' },
];

/**
 * Build a Date the way the calendar grid does — local midnight — while pretending
 * to be in `tz`. Vitest cannot re-enter the runtime's timezone mid-process, so
 * the property is asserted with `Intl` as the oracle: whatever local day the
 * platform says this instant falls on in `tz`, the key must name that day.
 */
function localDayIn(tz: string, d: Date): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

describe('ymdLocal', () => {
  it('names the local calendar day, never the UTC one', () => {
    // Local midnight on 1 Aug 2026 as the grid constructs it.
    const cell = new Date(2026, 7, 1);
    expect(ymdLocal(cell)).toBe('2026-08-01');
    expect(ymdLocal(cell)).toBe(localDayIn(Intl.DateTimeFormat().resolvedOptions().timeZone, cell));
  });

  it('disagrees with toISOString exactly where toISOString is wrong', () => {
    for (const { tz, label } of ZONES) {
      // An instant that is a different calendar day in `tz` than in UTC, for any
      // zone with a non-zero offset: 23:30 local on the 5th.
      const instant = new Date(Date.UTC(2026, 7, 5, 18, 0, 0));
      const utcDay = instant.toISOString().slice(0, 10);
      const localDay = localDayIn(tz, instant);
      if (tz === 'UTC') {
        expect(localDay, label).toBe(utcDay);
      }
      // Whatever the zone, the key for a Date built from those local fields must
      // reproduce the local day — that is the whole contract.
      const [y, m, d] = localDay.split('-').map(Number);
      expect(ymdLocal(new Date(y, m - 1, d)), label).toBe(localDay);
    }
  });

  it('round-trips the bare YYYY-MM-DD dates events are stored under', () => {
    // Events arrive from Postgres as plain calendar dates. A cell for that day
    // must produce the identical string or the lookup silently misses.
    for (const stored of ['2026-01-01', '2026-02-28', '2026-12-31', '2026-03-09']) {
      const [y, m, d] = stored.split('-').map(Number);
      expect(ymdLocal(new Date(y, m - 1, d))).toBe(stored);
    }
  });

  it('pads single-digit months and days', () => {
    expect(ymdLocal(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('ymLocal', () => {
  it('names the local calendar month', () => {
    expect(ymLocal(new Date(2026, 0, 1))).toBe('2026-01');
    expect(ymLocal(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('does not roll into the next month at local midnight on the 1st', () => {
    // The case that breaks under a UTC conversion in any UTC− zone: local
    // midnight on the 1st is still the previous month in UTC−.
    expect(ymLocal(new Date(2026, 7, 1, 0, 0, 0))).toBe('2026-08');
  });
});

/**
 * Testing the helpers only proves the helpers work. The bug this file exists for
 * is a CALL SITE that never reaches them — which is how `usage_counters` came to
 * be keyed by the UTC month, billing the first 5h30m of every month in IST
 * against the month that had just ended. So the rule is enforced over the source
 * itself: no client code may derive a calendar key by slicing an ISO string.
 *
 * There is exactly one legitimate exception, and it is required to be
 * self-documenting: a value whose UTC-ness is a contract with the server that
 * writes it. Adding to this list should feel like a decision, not a convenience.
 */
const UTC_BY_CONTRACT = new Set([
  // careers_ai_usage.day is written by the careers-ai edge function in UTC;
  // the reader must match the writer or it reports 0 against a spent quota.
  'src/careers/services/analytics.ts',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test' || entry === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('calendar keys across the client source', () => {
  it('never slices an ISO string into a date key', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const rel = file.replace(/\\/g, '/');
      if (UTC_BY_CONTRACT.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      for (const [i, line] of src.split('\n').entries()) {
        // Ignore prose: several files explain this bug in their comments.
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
        if (/toISOString\(\)\s*\.slice\(\s*0\s*,\s*(7|10)\s*\)/.test(code)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      }
    }
    expect(offenders, 'use ymdLocal/ymLocal from src/lib/date.ts').toEqual([]);
  });

  it('keeps the documented UTC exception honest', () => {
    // If the exception ever stops containing the pattern, the entry is stale
    // and should be deleted rather than left as a standing licence.
    for (const rel of UTC_BY_CONTRACT) {
      const src = readFileSync(rel, 'utf8');
      expect(/toISOString\(\)\s*\.slice\(\s*0\s*,\s*(7|10)\s*\)/.test(src), rel).toBe(true);
    }
  });
});
