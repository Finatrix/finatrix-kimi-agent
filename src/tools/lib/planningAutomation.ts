import { computeGoalPlanner, type GoalInput, type GoalPath } from './goals';
import { calcWealth, type Decision, type LifeProfile } from './lifemap';
import type { FinEvent } from './calendar';

/** Search every permitted whole-year deadline; inflation means monotonicity is not assumed. */
export function findGoalDeadlines(input: GoalInput, inflation: number, paths: readonly GoalPath[], monthlyLimit: number) {
  if (!Number.isFinite(monthlyLimit) || monthlyLimit < 0 || monthlyLimit > 1e12) return [];
  const answers = paths.map((path) => ({ name: path.n, years: null as number | null, monthly: null as number | null }));
  for (let years = 1; years <= 40 && answers.some((answer) => answer.years === null); years++) {
    const result = computeGoalPlanner({ ...input, years }, inflation, paths);
    result.results.forEach((path, i) => {
      if (answers[i].years === null && path.monthly <= monthlyLimit) {
        answers[i] = { name: path.n, years, monthly: path.monthly };
      }
    });
  }
  return answers;
}

export function lifeMapReadiness(form: Record<string, string>): string[] {
  const issues: string[] = [];
  const age = Number(form['lm-age']);
  if (!Number.isInteger(age) || age < 16 || age > 45) issues.push('Enter a whole age from 16 to 45.');
  const keys = ['lm-income', 'lm-expenses', 'lm-savings', 'lm-emergency', 'lm-invest',
    ...(form['lm-sip-yn'] === 'yes' ? ['lm-sip'] : []),
    ...(form['lm-debt-yn'] === 'yes' ? ['lm-debt-total', 'lm-debt-emi'] : [])];
  if (keys.some((key) => !form[key]?.trim() || !Number.isFinite(Number(form[key])) || Number(form[key]) < 0 || Number(form[key]) > 1e12)) {
    issues.push('Complete the visible money fields with amounts from 0 to 1 trillion.');
  }
  if (form['lm-income']?.trim() && Number(form['lm-income']) === 0 || form['lm-expenses']?.trim() && Number(form['lm-expenses']) === 0) {
    issues.push('This model requires income and expenses greater than zero. Zero would otherwise be replaced by example amounts.');
  }
  if (Number(form['lm-emergency']) > Number(form['lm-savings'])) issues.push('Your emergency fund is part of savings and cannot exceed total savings.');
  if (form['lm-debt-yn'] === 'yes' && Number(form['lm-debt-emi']) > Number(form['lm-expenses'])) issues.push('Include your debt repayments in monthly expenses before continuing.');
  return issues;
}

export function firstLifeMapAge(profile: LifeProfile, decisions: Decision[], applied: Set<string>, target: number): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  for (let age = profile.age; age <= 60; age++) {
    if (calcWealth(profile, decisions, applied, age, true) >= target) return age;
  }
  return null;
}

/** Goal targets are milestones, never cash outflows. */
export function calendarOutflows(events: readonly FinEvent[]): number {
  return events.reduce((total, event) => total + (event.type !== 'goal' && Number.isFinite(event.amount) ? event.amount ?? 0 : 0), 0);
}

export function calendarWithContributionDay(events: readonly FinEvent[], day: number): FinEvent[] {
  const safeDay = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
  return events.map((event) => {
    if (event.type !== 'invest') return event;
    const [year, month] = event.date.split('-').map(Number);
    const actualDay = Math.min(safeDay, new Date(year, month, 0).getDate());
    return { ...event, date: `${event.date.slice(0, 7)}-${String(actualDay).padStart(2, '0')}`, detail: `${event.detail} · planning day ${safeDay}` };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

const icsEscape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
// RFC 5545 lines are folded by UTF-8 octets, including continuation whitespace.
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  let current = '', bytes = 0;
  const lines: string[] = [];
  for (const char of line) {
    const width = encoder.encode(char).length;
    if (bytes + width > 75) { lines.push(current); current = ' '; bytes = 1; }
    current += char; bytes += width;
  }
  lines.push(current);
  return lines.join('\r\n');
}

export function calendarIcs(events: readonly FinEvent[], now = new Date(), currency = ''): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinatriX//Planning Calendar//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((event) => {
    lines.push('BEGIN:VEVENT', `UID:${icsEscape(event.id)}@finatrix`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`, `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(`${event.detail}. Planning estimate only; confirm dates with your provider. Amount: ${event.amount === null ? 'not specified' : `${currency} ${event.amount}`.trim()}. Review in FinatriX: https://finatrix.co${event.href}`)}`,
      'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
