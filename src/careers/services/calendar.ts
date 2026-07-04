/**
 * Calendar Integration (Phase 3, Module 15). One .ics file per export —
 * Google Calendar, Outlook and Apple Calendar all import the same iCalendar
 * format, so a single generator covers "export to any calendar app".
 */

import type { CalendarEvent } from '../types/phase3';

function icsEscape(text: string): string {
  return text.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

function icsDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildIcs(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FinatriX Careers//Application Intelligence//EN',
    'CALSCALE:GREGORIAN',
  ];
  const now = icsDate(new Date().toISOString());
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@finatrix`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(e.at)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(e.description)}`,
      ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
      ...(e.url ? [`URL:${icsEscape(e.url)}`] : []),
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Downloads a .ics file — importable into Google Calendar, Outlook and Apple Calendar. */
export function downloadIcs(events: CalendarEvent[], filename = 'finatrix-careers.ics'): void {
  const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
