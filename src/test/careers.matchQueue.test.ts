import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDeck,
  gapsOf,
  isTerminal,
  progressOf,
  strengthsOf,
  type QueueVerdict,
} from '../careers/queue/deck';
import { clearDecisions, loadDecisions, recordDecision } from '../careers/queue/decisions';
import type { ScoredJob } from '../careers/search/pipeline';
import { fitLabel } from '../careers/utils/format';

/**
 * Minimal ScoredJob stand-in. The deck only ever reads `match`, so the rest of
 * the (large) EnrichedJob shape is deliberately not constructed here — a
 * fixture that mirrors every field would break on unrelated schema changes
 * while testing nothing extra.
 */
function job(overall: number | null, extra: { matched?: string[]; missing?: string[] } = {}): ScoredJob {
  return {
    job: {} as ScoredJob['job'],
    match: overall == null ? null : {
      overall,
      scores: {} as never,
      matchedSkills: extra.matched ?? [],
      missingTerms: extra.missing ?? [],
    },
    relevance: 50,
    locationVerdict: {} as ScoredJob['locationVerdict'],
    why: [],
  };
}

/** Key map keyed by identity, mirroring how the page builds it. */
function keyed(jobs: ScoredJob[]): Map<ScoredJob, string> {
  return new Map(jobs.map((j, i) => [j, `sha-${i}`]));
}

describe('deck verdict semantics', () => {
  it('treats declines and applications as terminal, skips as not', () => {
    expect(isTerminal('declined')).toBe(true);
    expect(isTerminal('applied')).toBe(true);
    expect(isTerminal('skipped')).toBe(false);
  });
});

describe('buildDeck', () => {
  it('keeps pipeline order for undecided jobs', () => {
    const jobs = [job(90), job(80), job(75)];
    const deck = buildDeck(jobs, keyed(jobs), new Map(), 70);
    expect(deck.cards).toEqual(jobs);
    expect(deck.decided).toBe(0);
  });

  it('removes declined and applied jobs permanently', () => {
    const jobs = [job(90), job(85), job(80)];
    const keys = keyed(jobs);
    const decisions = new Map<string, QueueVerdict>([['sha-0', 'declined'], ['sha-1', 'applied']]);
    const deck = buildDeck(jobs, keys, decisions, 70);
    expect(deck.cards).toEqual([jobs[2]]);
    expect(deck.decided).toBe(2);
  });

  it('moves skipped jobs to the end rather than dropping them', () => {
    const jobs = [job(95), job(90), job(85)];
    const keys = keyed(jobs);
    const decisions = new Map<string, QueueVerdict>([['sha-0', 'skipped']]);
    const deck = buildDeck(jobs, keys, decisions, 70);
    // The skipped top-ranked job comes back last — never lost, never first.
    expect(deck.cards).toEqual([jobs[1], jobs[2], jobs[0]]);
    expect(deck.deferred).toBe(1);
    expect(deck.decided).toBe(0);
  });

  it('hides jobs below the threshold and counts them', () => {
    const jobs = [job(90), job(50), job(20)];
    const deck = buildDeck(jobs, keyed(jobs), new Map(), 70);
    expect(deck.cards).toEqual([jobs[0]]);
    expect(deck.belowThreshold).toBe(2);
  });

  it('never applies the threshold to unscored jobs', () => {
    // No resume selected → every job is null-scored and must stay reviewable,
    // otherwise the queue silently empties itself and blames the user.
    const jobs = [job(null), job(null)];
    const deck = buildDeck(jobs, keyed(jobs), new Map(), 70);
    expect(deck.cards).toHaveLength(2);
    expect(deck.belowThreshold).toBe(0);
  });

  it('treats a job whose key has not resolved yet as undecided', () => {
    const jobs = [job(90), job(85)];
    const partial = new Map([[jobs[1], 'sha-1']]); // first hash still in flight
    const decisions = new Map<string, QueueVerdict>([['sha-1', 'declined']]);
    const deck = buildDeck(jobs, partial, decisions, 70);
    expect(deck.cards).toEqual([jobs[0]]);
  });
});

describe('progressOf', () => {
  it('counts only terminal verdicts as progress', () => {
    const jobs = [job(90), job(85), job(80), job(75)];
    const keys = keyed(jobs);
    const decisions = new Map<string, QueueVerdict>([['sha-0', 'applied'], ['sha-1', 'skipped']]);
    const deck = buildDeck(jobs, keys, decisions, 70);
    const p = progressOf(deck);
    expect(p.reviewed).toBe(1);      // the skip is not progress
    expect(p.total).toBe(4);
    expect(p.pct).toBe(25);
  });

  it('reports 0% rather than NaN for an empty deck', () => {
    const deck = buildDeck([], new Map(), new Map(), 70);
    expect(progressOf(deck)).toEqual({ reviewed: 0, total: 0, pct: 0 });
  });
});

describe('card evidence', () => {
  it('caps both strengths and gaps so a card cannot become a wall of chips', () => {
    const many = Array.from({ length: 20 }, (_, i) => `term-${i}`);
    const j = job(80, { matched: many, missing: many });
    expect(strengthsOf(j)).toHaveLength(6);
    expect(gapsOf(j)).toHaveLength(6);
    expect(gapsOf(j, 3)).toHaveLength(3);
  });

  it('returns empty evidence for an unscored job instead of throwing', () => {
    const j = job(null);
    expect(strengthsOf(j)).toEqual([]);
    expect(gapsOf(j)).toEqual([]);
  });
});

describe('fitLabel', () => {
  it('shares scoreColor thresholds so word and colour never disagree', () => {
    expect(fitLabel(80)).toBe('Excellent fit');
    expect(fitLabel(75)).toBe('Strong fit');   // gold in scoreColor, "Strong" here
    expect(fitLabel(60)).toBe('Strong fit');
    expect(fitLabel(40)).toBe('Moderate fit');
    expect(fitLabel(39)).toBe('Weak fit');
    expect(fitLabel(null)).toBe('Not scored');
  });
});

describe('decision persistence', () => {
  beforeEach(() => localStorage.clear());

  it('remembers declines and applications across loads', () => {
    recordDecision('user-1', 'sha-a', 'declined');
    recordDecision('user-1', 'sha-b', 'applied');
    const loaded = loadDecisions('user-1');
    expect(loaded.get('sha-a')).toBe('declined');
    expect(loaded.get('sha-b')).toBe('applied');
  });

  it('never persists a skip — "not now" must not become "never"', () => {
    recordDecision('user-1', 'sha-a', 'skipped');
    expect(loadDecisions('user-1').size).toBe(0);
  });

  it('keeps one account\'s decisions out of another\'s queue', () => {
    recordDecision('user-1', 'sha-a', 'declined');
    expect(loadDecisions('user-2').size).toBe(0);
  });

  it('upgrades an existing key rather than duplicating it', () => {
    recordDecision('user-1', 'sha-a', 'declined');
    recordDecision('user-1', 'sha-a', 'applied');
    const loaded = loadDecisions('user-1');
    expect(loaded.size).toBe(1);
    expect(loaded.get('sha-a')).toBe('applied');
  });

  it('evicts oldest first past the cap', () => {
    for (let i = 0; i < 520; i++) recordDecision('user-1', `sha-${i}`, 'declined');
    const loaded = loadDecisions('user-1');
    expect(loaded.size).toBe(500);
    expect(loaded.has('sha-0')).toBe(false);    // oldest gone
    expect(loaded.has('sha-519')).toBe(true);   // newest kept
  });

  it('survives corrupt storage instead of breaking the queue', () => {
    localStorage.setItem('fx.careers.queue.decisions.user-1', '{not json');
    expect(loadDecisions('user-1').size).toBe(0);
  });

  it('drops entries that are not terminal verdicts', () => {
    localStorage.setItem(
      'fx.careers.queue.decisions.user-1',
      JSON.stringify([{ k: 'sha-a', v: 'skipped', t: 1 }, { k: 'sha-b', v: 'declined', t: 2 }]),
    );
    const loaded = loadDecisions('user-1');
    expect(loaded.size).toBe(1);
    expect(loaded.get('sha-b')).toBe('declined');
  });

  it('clears decisions for one account only', () => {
    recordDecision('user-1', 'sha-a', 'declined');
    recordDecision('user-2', 'sha-b', 'declined');
    clearDecisions('user-1');
    expect(loadDecisions('user-1').size).toBe(0);
    expect(loadDecisions('user-2').size).toBe(1);
  });
});
