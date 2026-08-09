/**
 * Exports for the Careers module. Tabular data (applications, companies,
 * recruiter contacts, timelines, analytics) exports to CSV / JSON / Excel /
 * PDF; cover letters export to TXT / Markdown / PDF / DOCX / clipboard.
 * jspdf, xlsx and docx are lazy-imported so they never weigh on page load.
 */

import type {
  ApplicationHistoryRow,
  ApplicationRow,
  CompanyContactRow,
  CompanyRow,
  CoverLetterRow,
} from '../types/jobs';
import { csvBlob, toCsv } from '../../lib/csv';
import { STAGE_LABELS } from '../types/jobs';
import type { ApplicationStats } from './applications';
import { formatDate } from '../utils/format';

// ─────────────────────────── generic table model ───────────────────────────

export interface ExportTable {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export function applicationsTable(apps: ApplicationRow[]): ExportTable {
  return {
    title: 'Applications',
    columns: [
      'Company', 'Job Title', 'Stage', 'Priority', 'Location', 'Work Mode',
      'Salary', 'Source', 'Match %', 'ATS %', 'Applied', 'Deadline', 'Interview',
      'Tags', 'Job URL', 'Notes',
    ],
    rows: apps.map((a) => [
      a.company_name, a.job_title, STAGE_LABELS[a.stage] ?? a.stage, a.priority,
      a.location, a.work_mode, a.salary_text, a.source,
      a.match_score, a.ats_score,
      a.applied_at ? formatDate(a.applied_at) : '',
      a.closes_at ? formatDate(a.closes_at) : '',
      a.interview_at ? formatDate(a.interview_at) : '',
      a.tags.join('; '), a.job_url, a.notes,
    ]),
  };
}

export function companiesTable(companies: CompanyRow[]): ExportTable {
  return {
    title: 'Companies',
    columns: [
      'Name', 'Industry', 'Headquarters', 'Size', 'Founded', 'Website',
      'Glassdoor', 'AmbitionBox', 'Funding', 'Notes',
    ],
    rows: companies.map((c) => [
      c.name, c.industry, c.headquarters, c.company_size, c.founded_year,
      c.website, c.glassdoor_rating, c.ambitionbox_rating, c.funding_stage, c.notes,
    ]),
  };
}

export function contactsTable(contacts: CompanyContactRow[]): ExportTable {
  return {
    title: 'Recruiter contacts',
    columns: ['Name', 'Position', 'Email', 'LinkedIn', 'Follow-up', 'Notes'],
    rows: contacts.map((c) => [
      c.name, c.position, c.email, c.linkedin_url,
      c.follow_up_at ? formatDate(c.follow_up_at) : '', c.notes,
    ]),
  };
}

export function timelineTable(app: ApplicationRow, history: ApplicationHistoryRow[]): ExportTable {
  return {
    title: `Timeline — ${app.job_title} at ${app.company_name}`,
    columns: ['When', 'Event', 'From', 'To', 'Details'],
    rows: history.map((h) => [
      new Date(h.created_at).toLocaleString(), h.event,
      h.from_stage && STAGE_LABELS[h.from_stage as keyof typeof STAGE_LABELS] || h.from_stage,
      h.to_stage && STAGE_LABELS[h.to_stage as keyof typeof STAGE_LABELS] || h.to_stage,
      h.body,
    ]),
  };
}

export function analyticsTable(stats: ApplicationStats): ExportTable {
  return {
    title: 'Application analytics',
    columns: ['Metric', 'Value'],
    rows: [
      ['Total tracked', stats.total],
      ['Applied', stats.applied],
      ['Interviews', stats.interviews],
      ['Assessments pending', stats.assessments],
      ['Offers received', stats.offers],
      ['Offers accepted', stats.accepted],
      ['Rejections', stats.rejections],
      ['Withdrawn', stats.withdrawn],
      ['Average match score', stats.avgMatchScore],
      ['Average ATS score', stats.avgAtsScore],
      ['Interview rate %', stats.interviewRate],
      ['Success rate %', stats.successRate],
      ['Offer rate %', stats.offerRate],
    ],
  };
}

// ─────────────────────────── format writers ───────────────────────────

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(title: string): string {
  return title.replace(/[^\w-]+/g, '_').slice(0, 60) || 'export';
}

export function csvOf(table: ExportTable): string {
  return toCsv([table.columns, ...table.rows]);
}

export function exportCsv(table: ExportTable): void {
  // UTF-8 BOM so Excel opens the UTF-8 CSV with correct encoding.
  download(csvBlob([table.columns, ...table.rows]), `${safeName(table.title)}.csv`);
}

export function exportJson(table: ExportTable): void {
  const objects = table.rows.map((row) =>
    Object.fromEntries(table.columns.map((col, i) => [col, row[i]]))
  );
  download(
    new Blob([JSON.stringify({ title: table.title, exportedAt: new Date().toISOString(), rows: objects }, null, 2)],
      { type: 'application/json' }),
    `${safeName(table.title)}.json`
  );
}

export async function exportExcel(table: ExportTable): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([table.columns, ...table.rows.map((r) => r.map((v) => v ?? ''))]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, table.title.slice(0, 31));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeName(table.title)}.xlsx`);
}

export async function exportTablePdf(table: ExportTable): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: table.columns.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(table.title, 14, 16);
  doc.setFontSize(9);
  doc.text(`FinatriX Careers — exported ${new Date().toLocaleDateString()}`, 14, 22);
  autoTable(doc, {
    startY: 26,
    head: [table.columns],
    body: table.rows.map((r) => r.map((v) => (v == null ? '' : String(v)))),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [212, 175, 55], textColor: [26, 20, 0] },
  });
  doc.save(`${safeName(table.title)}.pdf`);
}

// ─────────────────────────── cover letters ───────────────────────────

export function coverLetterMarkdown(letter: CoverLetterRow): string {
  return `# ${letter.name}\n\n*${letter.job_title} — ${letter.company}*\n\n${letter.content_text}`;
}

export function exportLetterTxt(letter: CoverLetterRow): void {
  download(new Blob([letter.content_text], { type: 'text/plain;charset=utf-8' }), `${safeName(letter.name)}.txt`);
}

export function exportLetterMarkdown(letter: CoverLetterRow): void {
  download(new Blob([coverLetterMarkdown(letter)], { type: 'text/markdown;charset=utf-8' }), `${safeName(letter.name)}.md`);
}

export async function copyLetterToClipboard(letter: CoverLetterRow): Promise<void> {
  await navigator.clipboard.writeText(letter.content_text);
}

export async function exportLetterPdf(letter: CoverLetterRow): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const margin = 20;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(letter.content_text, width) as string[];
  let y = margin;
  for (const line of lines) {
    if (y > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 6;
  }
  doc.save(`${safeName(letter.name)}.pdf`);
}

export async function exportLetterDocx(letter: CoverLetterRow): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import('docx');
  const paragraphs = letter.content_text.split(/\n\n+/).map(
    (para) =>
      new Paragraph({
        children: para.split('\n').flatMap((line, i) =>
          i === 0 ? [new TextRun(line)] : [new TextRun({ text: line, break: 1 })]
        ),
        spacing: { after: 240 },
      })
  );
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  download(blob, `${safeName(letter.name)}.docx`);
}

/** mailto: link with the letter pre-filled ("email ready"). */
export function letterMailto(letter: CoverLetterRow): string {
  const subject = encodeURIComponent(`Application — ${letter.job_title} at ${letter.company}`);
  const body = encodeURIComponent(letter.content_text.slice(0, 1_800));
  return `mailto:?subject=${subject}&body=${body}`;
}
