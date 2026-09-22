// lib/calendar/ics.ts — dependency-free minimal RFC5545 generator.

import type { CalendarEvent } from './types';

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join('\r\n');
}

function escapeText(text: string): string {
  return text.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

function toIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

function nextDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcsFeed(events: CalendarEvent[], calendarName = 'Loop'): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const veventBlocks = events.map((e) => {
    const uid = `${e.id}@loop.app`;
    const summary = escapeText(titleFor(e));
    return [
      'BEGIN:VEVENT',
      foldLine(`UID:${uid}`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${toIcsDate(e.event_date)}`,
      `DTEND;VALUE=DATE:${toIcsDate(nextDay(e.event_date))}`,
      foldLine(`SUMMARY:${summary}`),
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Loop//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
    'X-PUBLISHED-TTL:PT4H',
    ...veventBlocks,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function titleFor(e: CalendarEvent): string {
  if (e.event_type === 'payment_due' && e.amount != null) return `${e.title} — £${e.amount.toFixed(2)} due`;
  if (e.event_type === 'income_expected' && e.amount != null) return `${e.title} — £${e.amount.toFixed(2)} expected`;
  if (e.event_type === 'calorie_progress') {
    const pct = (e.metadata as { pct?: number })?.pct;
    return pct != null ? `${e.title} (${pct}%)` : e.title;
  }
  return e.title;
}
