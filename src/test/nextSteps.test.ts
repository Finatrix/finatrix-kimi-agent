/**
 * The result → next-step registry, checked against the routes it claims.
 *
 * `TOOL_OUTCOMES` is the thing that turns eight calculators into one system:
 * every result screen renders its entry, so a wrong `href` here is a dead end
 * on the most important moment in the product — the instant after a reader gets
 * an answer. `isKnownRoute` is the same function the edge Worker uses to decide
 * a URL's HTTP status, so a link that passes here is one the site really serves.
 */

import { describe, it, expect } from 'vitest';
import { TOOL_OUTCOMES, outcomeFor } from '../shared/nextSteps';
import { TOOL_IDS, isKnownRoute, type ToolId } from '../shared/routes';

const ENTRIES = Object.entries(TOOL_OUTCOMES) as [ToolId, (typeof TOOL_OUTCOMES)[ToolId]][];

describe('tool outcomes', () => {
  it('covers every public calculator, and nothing else', () => {
    expect(new Set(Object.keys(TOOL_OUTCOMES))).toEqual(new Set(TOOL_IDS));
  });

  it.each(ENTRIES)('%s points only at routes the site serves', (_id, outcome) => {
    expect(outcome.next.length).toBeGreaterThan(0);
    for (const step of outcome.next) {
      expect(isKnownRoute(step.href), `${step.href} is not a real route`).toBe(true);
    }
  });

  it.each(ENTRIES)('%s never sends the reader back to the tool they are on', (id, outcome) => {
    for (const step of outcome.next) {
      expect(step.href).not.toBe(`/tools/${id}`);
    }
  });

  it.each(ENTRIES)('%s lists each destination once', (_id, outcome) => {
    const hrefs = outcome.next.map((n) => n.href);
    expect(new Set(hrefs).size, `duplicate destination in ${hrefs.join(', ')}`).toBe(hrefs.length);
  });

  it.each(ENTRIES)('%s gives every link a reason, not just a label', (_id, outcome) => {
    for (const step of outcome.next) {
      expect(step.label.length).toBeGreaterThan(3);
      // A reason short enough to be a restatement of the label is not a reason.
      expect(step.reason.length).toBeGreaterThan(25);
      expect(step.reason.trim().endsWith('.')).toBe(true);
    }
  });

  it.each(ENTRIES)('%s keeps the next-step list short enough to be a choice', (_id, outcome) => {
    // Three is the point at which a set of suggestions stops reading as advice
    // and starts reading as a menu — the CTA-overload failure this avoids.
    expect(outcome.next.length).toBeLessThanOrEqual(3);
  });

  /**
   * The educational-not-advisory line, mechanically. These strings sit under
   * "What you could do next" on a financial result, which is exactly where a
   * personalised instruction would be mistaken for a recommendation.
   */
  it.each(ENTRIES)('%s phrases its actions as things to consider, not instructions', (_id, outcome) => {
    expect(outcome.actions.length).toBeGreaterThan(0);
    for (const action of outcome.actions) {
      expect(action).not.toMatch(/\byou should\b/i);
      expect(action).not.toMatch(/\bwe recommend\b/i);
      expect(action).not.toMatch(/\bbest (investment|fund|option|portfolio)\b/i);
      expect(action).not.toMatch(/\bguaranteed\b/i);
    }
  });

  it('every tool reaches the dashboard, which is where the picture accumulates', () => {
    for (const [, outcome] of ENTRIES) {
      expect(outcome.next.some((n) => n.href === '/tools/dashboard')).toBe(true);
    }
  });

  it('resolves a known tool and returns null for anything else', () => {
    expect(outcomeFor('budget')).toBe(TOOL_OUTCOMES.budget);
    expect(outcomeFor('not-a-tool')).toBeNull();
    expect(outcomeFor('')).toBeNull();
  });
});
