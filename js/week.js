// ISO-8601 week utilities.
// All arithmetic is done in UTC so daylight-saving transitions can never shift
// which week a date belongs to.

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}

/** Strip a local Date down to a UTC midnight date carrying the same calendar day. */
function toUtcDay(date) {
  return utcDate(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday index: Monday = 0 ... Sunday = 6. */
export function dayIndex(date = new Date()) {
  return (date.getDay() + 6) % 7;
}

export function dayName(date = new Date()) {
  return DAY_NAMES[dayIndex(date)];
}

/** Monday (UTC midnight) of the ISO week containing `date`. */
export function isoWeekStart(date = new Date()) {
  const d = toUtcDay(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/** ISO week number and ISO week-numbering year. */
export function isoWeekParts(date = new Date()) {
  const monday = isoWeekStart(date);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = utcDate(year, 0, 4);
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 86400000));
  return { year, week, monday };
}

/** Stable, sortable, human-readable week key, e.g. "2026-W34". */
export function weekKey(date = new Date()) {
  const { year, week } = isoWeekParts(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function parseWeekKey(key) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = utcDate(year, 0, 4);
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return { year, week, monday };
}

/** Move a week key forward or backward by `delta` weeks. */
export function shiftWeekKey(key, delta) {
  const parsed = parseWeekKey(key);
  if (!parsed) return weekKey();
  const d = new Date(parsed.monday);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return weekKey(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function compareWeekKeys(a, b) {
  return String(a).localeCompare(String(b));
}

/** Date (UTC midnight) of a named weekday inside a given week key. */
export function dateOfDayInWeek(key, day) {
  const parsed = parseWeekKey(key);
  if (!parsed) return null;
  const idx = Math.max(0, DAY_NAMES.indexOf(day));
  const d = new Date(parsed.monday);
  d.setUTCDate(d.getUTCDate() + idx);
  return d;
}

const fmtDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtFull = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "Mon 17 Aug – Sun 23 Aug" style range for the week header. */
export function weekRangeLabel(key) {
  const parsed = parseWeekKey(key);
  if (!parsed) return '';
  const end = new Date(parsed.monday);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${fmtDay.format(parsed.monday)} – ${fmtDay.format(end)}`;
}

export function weekStartLabel(key) {
  const parsed = parseWeekKey(key);
  return parsed ? fmtFull.format(parsed.monday) : '';
}

export function shortDayDateLabel(key, day) {
  const d = dateOfDayInWeek(key, day);
  return d ? fmtDay.format(d) : '';
}

/** How the given week key relates to the real current week. */
export function weekOffsetFromNow(key) {
  const a = parseWeekKey(key);
  const b = parseWeekKey(weekKey());
  if (!a || !b) return 0;
  return Math.round((a.monday - b.monday) / (7 * 86400000));
}

export function describeWeekOffset(offset) {
  if (offset === 0) return 'This week';
  if (offset === -1) return 'Last week';
  if (offset === 1) return 'Next week';
  if (offset < 0) return `${Math.abs(offset)} weeks ago`;
  return `In ${offset} weeks`;
}

/** Deterministic 32-bit seed derived from a week key, so a week always shuffles the same way. */
export function seedFromWeekKey(key) {
  let h = 0x811c9dc5;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
