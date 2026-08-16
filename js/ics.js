// Calendar export (RFC 5545). Produces an .ics file that imports into Apple Calendar,
// Google Calendar or Outlook — no account and no server needed.
//
// Each task becomes an all-day event on its day, titled with its owner. Heavier jobs
// get a reminder the evening before. Tasks already ticked off are left out.

import { DAY_NAMES, dateOfDayInWeek, shiftWeekKey } from './week.js';
import { CATEGORY_DEFS } from './data.js';
import { allocateWeek, BOTH } from './allocate.js';

const CRLF = '\r\n';

/** RFC 5545 requires lines longer than 75 octets to be folded onto continuation lines. */
function fold(line) {
  if (line.length <= 74) return line;
  const parts = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length) {
    parts.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join(CRLF);
}

function esc(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function ymd(date) {
  return (
    date.getUTCFullYear() +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0')
  );
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function ownerName(item, alloc) {
  if (item.owner === BOTH) return `${alloc.people.a.name} + ${alloc.people.b.name}`;
  return item.owner === alloc.people.a.id ? alloc.people.a.name : alloc.people.b.name;
}

function eventLines(key, day, item, label, withAlarm) {
  const date = dateOfDayInWeek(key, day);
  if (!date) return [];
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  const cat = CATEGORY_DEFS[item.cat];
  const lines = [
    'BEGIN:VEVENT',
    `UID:${key}-${item.id}@home-planner`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    fold(`SUMMARY:${esc(`${cat?.icon || '•'} ${item.text} — ${label}`)}`),
    fold(
      `DESCRIPTION:${esc(
        `${cat?.label || item.cat} · ${item.pts} pt${item.pts === 1 ? '' : 's'}${item.shared ? ' · together' : ''}`
      )}`
    ),
    fold(`CATEGORIES:${esc(cat?.label || item.cat)}`),
    'TRANSP:TRANSPARENT',
  ];
  if (withAlarm && item.pts >= 3) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT14H', fold(`DESCRIPTION:${esc(item.text)}`), 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

function wrapCalendar(bodyLines) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Home Planner//Weekly plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Home plan',
    ...bodyLines,
    'END:VCALENDAR',
  ].join(CRLF) + CRLF;
}

export function buildIcs(state, keys, opts = {}) {
  const body = [];
  keys.forEach((key) => {
    const alloc = allocateWeek(state, key);
    const done = (state.weeks[key] || {}).done || {};
    DAY_NAMES.forEach((day) => {
      alloc.days[day].items.forEach((item) => {
        if (!opts.includeDone && done[item.id]) return;
        body.push(...eventLines(key, day, item, ownerName(item, alloc), opts.alarms !== false));
      });
    });
  });
  return wrapCalendar(body);
}

export function weekKeysFrom(key, count) {
  return Array.from({ length: count }, (_, i) => shiftWeekKey(key, i));
}

function saveFile(text, filename) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}

/** Download the plan for the given weeks as one calendar file. */
export function downloadIcs(state, keys) {
  const suffix = keys.length > 1 ? `-${keys.length}weeks` : '';
  return saveFile(buildIcs(state, keys, { alarms: true }), `home-plan-${keys[0]}${suffix}.ics`);
}

/** Download a single task as one calendar event. */
export function downloadTaskIcs(key, day, item, label) {
  const name = `${String(item.text).replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40) || 'task'}.ics`;
  return saveFile(wrapCalendar(eventLines(key, day, item, label, false)), name);
}
