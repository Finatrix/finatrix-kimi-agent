/**
 * Validators for Phase 3 AI responses (email generator, offer analysis).
 * Same contract as validate-jobs.ts: nothing from the model is trusted.
 */

import type { GeneratedEmailContent, OfferAnalysis } from '../types/phase3';
import { clampScore, sanitizeField, sanitizeProse, sanitizeStringArray } from '../utils/sanitize';
import { CareersError } from '../utils/errors';

type Dict = Record<string, unknown>;

function asDict(v: unknown): Dict {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {};
}

export function validateGeneratedEmail(raw: Dict): GeneratedEmailContent {
  const email: GeneratedEmailContent = {
    subject: sanitizeField(raw.subject, 200),
    body: sanitizeProse(raw.body, 4_000),
  };
  if (!email.body) {
    throw new CareersError('ai-response', 'The AI returned an empty email. Please retry.');
  }
  return email;
}

export function validateOfferAnalysis(raw: Dict): OfferAnalysis {
  const d = asDict(raw);
  const analysis: OfferAnalysis = {
    marketSalaryComparison: sanitizeProse(d.marketSalaryComparison, 800),
    pros: sanitizeStringArray(d.pros, 6, 300),
    cons: sanitizeStringArray(d.cons, 6, 300),
    negotiationSuggestions: sanitizeStringArray(d.negotiationSuggestions, 6, 300),
    riskAssessment: sanitizeProse(d.riskAssessment, 600),
    longTermCareerValue: sanitizeProse(d.longTermCareerValue, 600),
    recommendation: sanitizeProse(d.recommendation, 500),
    score: clampScore(d.score),
  };
  if (!analysis.recommendation && !analysis.pros.length && !analysis.cons.length) {
    throw new CareersError('ai-response', 'The AI returned an empty offer analysis. Please retry.');
  }
  return analysis;
}
