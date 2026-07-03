import { describe, it, expect } from 'vitest';
import {
  analyticsTable,
  applicationsTable,
  contactsTable,
  coverLetterMarkdown,
  csvOf,
} from '../careers/services/exports';
import { computeApplicationStats } from '../careers/services/applications';
import type { ApplicationRow, CompanyContactRow, CoverLetterRow } from '../careers/types/jobs';

function app(over: Partial<ApplicationRow>): ApplicationRow {
  return {
    id: 'a1', user_id: 'u', job_id: null, company_id: null, contact_id: null,
    resume_version_id: null, cover_letter_id: null,
    company_name: 'Acme, Inc.', job_title: 'Analyst "Risk"', department: '', salary_text: '',
    employment_type: '', location: 'Pune', work_mode: '', visa_sponsorship: '',
    source: 'manual', job_url: '', stage: 'applied', priority: 'high', tags: ['fintech'],
    notes: 'line1\nline2', match_score: 82, ats_score: 74,
    applied_at: '2026-06-02T00:00:00Z', closes_at: null, interview_at: null,
    offer_expires_at: null, next_action_at: null, archived: false,
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('export tables', () => {
  it('CSV escapes commas, quotes and newlines', () => {
    const csv = csvOf(applicationsTable([app({})]));
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Company,Job Title,Stage');
    expect(csv).toContain('"Acme, Inc."');
    expect(csv).toContain('"Analyst ""Risk"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it('applications table keeps score and stage columns aligned', () => {
    const table = applicationsTable([app({})]);
    const row = table.rows[0];
    expect(row[table.columns.indexOf('Stage')]).toBe('Applied');
    expect(row[table.columns.indexOf('Match %')]).toBe(82);
    expect(row[table.columns.indexOf('Tags')]).toBe('fintech');
  });

  it('contacts table renders follow-up dates and empty fields', () => {
    const contact: CompanyContactRow = {
      id: 'c1', user_id: 'u', company_id: null, name: 'Priya', email: '',
      linkedin_url: '', position: 'Recruiter', notes: '', follow_up_at: null,
      created_at: '', updated_at: '',
    };
    const table = contactsTable([contact]);
    expect(table.rows[0][0]).toBe('Priya');
    expect(table.rows[0][4]).toBe('');
  });

  it('analytics table mirrors computed stats', () => {
    const stats = computeApplicationStats([app({}), app({ id: 'a2', stage: 'offer_received' })]);
    const table = analyticsTable(stats);
    const metric = (name: string) => table.rows.find((r) => r[0] === name)?.[1];
    expect(metric('Total tracked')).toBe(2);
    expect(metric('Offers received')).toBe(1);
  });

  it('cover letter markdown embeds title and body', () => {
    const letter = {
      name: 'Risk Analyst — HDFC', job_title: 'Risk Analyst', company: 'HDFC',
      content_text: 'Dear team,\n\nBody.',
    } as CoverLetterRow;
    const md = coverLetterMarkdown(letter);
    expect(md.startsWith('# Risk Analyst — HDFC')).toBe(true);
    expect(md).toContain('Dear team,');
  });
});
