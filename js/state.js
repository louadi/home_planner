// Single source of truth for app state: schema, normalisation, migrations and mutations.
//
// Design notes
// - Everything that belongs to a specific week lives under state.weeks[weekKey],
//   so completing tasks, moving them or reassigning them never leaks into another
//   week. That is what makes automatic week rollover safe.
// - normalise() is defensive on purpose: it is the single gate through which loaded,
//   imported and legacy data all pass, so the UI can assume every field exists.

import {
  SCHEMA_VERSION,
  CATEGORY_DEFS,
  CATEGORY_KEYS,
  DEFAULT_PROGRAM,
  DEFAULT_TASKS,
  DEFAULT_GROCERIES,
  DEFAULT_PEOPLE,
} from './data.js';
import { DAY_NAMES, weekKey, parseWeekKey, compareWeekKeys } from './week.js';
import { loadState, saveState, readLegacyState, clearAllStorage } from './storage.js';

const MAX_WEEKS_KEPT = 70;
const SAVE_DEBOUNCE_MS = 250;

export const state = { loaded: false };

const listeners = new Set();
let saveTimer = null;
let pendingSave = false;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(detail) {
  listeners.forEach((fn) => {
    try {
      fn(detail);
    } catch (err) {
      console.error('listener failed', err);
    }
  });
}

export function uid(prefix = 'x') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const clampPct = (n, fallback = 50) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, Math.round(v)));
};

const clampPts = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 1;
  return Math.min(9, Math.max(1, Math.round(v)));
};

const cleanDay = (day) => (DAY_NAMES.includes(day) ? day : DAY_NAMES[0]);
const cleanCat = (cat) => (CATEGORY_KEYS.includes(cat) ? cat : 'cleaning');
const cleanText = (text, fallback = '') => {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return s || fallback;
};

export const MODES = ['aHeavy', 'bHeavy', 'balanced', 'custom'];

/**
 * Target share (percentage going to the first person) for each category.
 * The stored defaults are person-A-heavy, so the B-heavy preset is the mirror image.
 */
export function defaultShares(mode) {
  const key = mode === 'balanced' ? 'balanced' : 'heavy';
  const flip = mode === 'bHeavy';
  const out = {};
  for (const [cat, meta] of Object.entries(CATEGORY_DEFS)) {
    const value = meta.defaults[key];
    out[cat] = flip ? 100 - value : value;
  }
  return out;
}

export function blankWeek() {
  return { done: {}, owner: {}, dayOf: {}, skipped: {}, extras: [], notes: '', roll: 0, seenAt: Date.now() };
}

function normaliseWeek(raw) {
  const w = blankWeek();
  if (!raw || typeof raw !== 'object') return w;
  if (raw.done && typeof raw.done === 'object') {
    for (const [id, v] of Object.entries(raw.done)) if (v) w.done[id] = true;
  }
  if (raw.owner && typeof raw.owner === 'object') {
    for (const [id, v] of Object.entries(raw.owner)) if (typeof v === 'string') w.owner[id] = v;
  }
  if (raw.dayOf && typeof raw.dayOf === 'object') {
    for (const [id, v] of Object.entries(raw.dayOf)) if (DAY_NAMES.includes(v)) w.dayOf[id] = v;
  }
  if (raw.skipped && typeof raw.skipped === 'object') {
    for (const [id, v] of Object.entries(raw.skipped)) if (v) w.skipped[id] = true;
  }
  if (Array.isArray(raw.extras)) {
    w.extras = raw.extras.map((t) => ({
      id: typeof t?.id === 'string' ? t.id : uid('extra'),
      text: cleanText(t?.text, 'Untitled task'),
      cat: cleanCat(t?.cat),
      pts: clampPts(t?.pts),
      day: cleanDay(t?.day),
      person: typeof t?.person === 'string' ? t.person : null,
      shared: !!t?.shared,
      extra: true,
    }));
  }
  w.notes = typeof raw.notes === 'string' ? raw.notes : '';
  w.roll = Number.isFinite(Number(raw.roll)) ? Math.max(0, Math.round(Number(raw.roll))) : 0;
  w.seenAt = Number(raw.seenAt) || Date.now();
  return w;
}

function normalisePeople(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const people = list.slice(0, 2).map((p, i) => ({
    id: typeof p?.id === 'string' && p.id ? p.id : DEFAULT_PEOPLE[i].id,
    name: cleanText(p?.name, DEFAULT_PEOPLE[i].name).slice(0, 24),
    color: /^#[0-9a-f]{6}$/i.test(p?.color || '') ? p.color : DEFAULT_PEOPLE[i].color,
  }));
  while (people.length < 2) people.push({ ...DEFAULT_PEOPLE[people.length] });
  if (people[0].id === people[1].id) people[1].id = DEFAULT_PEOPLE[1].id;
  return people;
}

function normaliseTasks(raw) {
  const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_TASKS;
  const seen = new Set();
  const tasks = [];
  for (const t of list) {
    let id = typeof t?.id === 'string' && t.id ? t.id : uid('task');
    while (seen.has(id)) id = uid('task');
    seen.add(id);
    tasks.push({
      id,
      text: cleanText(t?.text, 'Untitled task').slice(0, 120),
      cat: cleanCat(t?.cat),
      pts: clampPts(t?.pts),
      day: cleanDay(t?.day),
      shared: !!t?.shared,
      person: typeof t?.person === 'string' ? t.person : null, // null = auto-assign
      active: t?.active === undefined ? true : !!t.active,
      custom: !!t?.custom,
    });
  }
  return tasks;
}

function normaliseGroceries(raw) {
  const list = Array.isArray(raw) ? raw : DEFAULT_GROCERIES.map((text) => ({ text }));
  return list
    .map((g) => {
      if (typeof g === 'string') return { id: uid('g'), text: cleanText(g), checked: false };
      return {
        id: typeof g?.id === 'string' && g.id ? g.id : uid('g'),
        text: typeof g?.text === 'string' ? g.text.slice(0, 120) : '',
        checked: !!g?.checked,
      };
    })
    .slice(0, 200);
}

function normaliseProgram(raw) {
  const byDay = new Map();
  if (Array.isArray(raw)) {
    for (const p of raw) if (DAY_NAMES.includes(p?.day)) byDay.set(p.day, p);
  }
  return DEFAULT_PROGRAM.map((def) => {
    const found = byDay.get(def.day);
    return {
      day: def.day,
      focus: typeof found?.focus === 'string' ? found.focus.slice(0, 80) : def.focus,
      notes: typeof found?.notes === 'string' ? found.notes.slice(0, 300) : def.notes,
    };
  });
}

export function normalise(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  // 'recovery' was the old name for the person-A-heavy preset; map it forward so an
  // existing saved state keeps the same targets under the new name.
  const rawMode = src.mode === 'recovery' ? 'aHeavy' : src.mode;
  const mode = MODES.includes(rawMode) ? rawMode : 'balanced';

  const shares = defaultShares(mode === 'custom' ? 'balanced' : mode);
  if (src.shares && typeof src.shares === 'object') {
    for (const cat of CATEGORY_KEYS) {
      if (src.shares[cat] !== undefined) shares[cat] = clampPct(src.shares[cat], shares[cat]);
    }
  }

  const weeks = {};
  if (src.weeks && typeof src.weeks === 'object') {
    for (const [key, value] of Object.entries(src.weeks)) {
      if (parseWeekKey(key)) weeks[key] = normaliseWeek(value);
    }
  }

  const s = src.settings && typeof src.settings === 'object' ? src.settings : {};

  return {
    version: SCHEMA_VERSION,
    updatedAt: Number(src.updatedAt) || Date.now(),
    people: normalisePeople(src.people),
    mode,
    shares,
    program: normaliseProgram(src.program),
    tasks: normaliseTasks(src.tasks),
    weeks,
    groceries: normaliseGroceries(src.groceries),
    settings: {
      carryUnfinished: s.carryUnfinished === undefined ? true : !!s.carryUnfinished,
      showPoints: s.showPoints === undefined ? true : !!s.showPoints,
      fairnessCarryOver: s.fairnessCarryOver === undefined ? true : !!s.fairnessCarryOver,
      theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
      lastTab: typeof s.lastTab === 'string' ? s.lastTab : 'today',
    },
    meta: {
      createdAt: Number(src.meta?.createdAt) || Date.now(),
      lastBackupAt: Number(src.meta?.lastBackupAt) || 0,
      migratedFrom: typeof src.meta?.migratedFrom === 'string' ? src.meta.migratedFrom : null,
    },
  };
}

/** Convert a v1/v2 single-file save (flat `done`/`overrides`/`notes`) into the new shape. */
export function migrateLegacy(legacy, sourceKey) {
  const current = weekKey();
  const draft = normalise({
    mode: legacy.mode,
    shares: legacy.shares,
    groceries: legacy.groceries,
    meta: { migratedFrom: sourceKey || 'legacy' },
  });
  const week = blankWeek();
  if (legacy.done && typeof legacy.done === 'object') {
    for (const [id, v] of Object.entries(legacy.done)) if (v) week.done[id] = true;
  }
  if (legacy.overrides && typeof legacy.overrides === 'object') {
    for (const [id, v] of Object.entries(legacy.overrides)) if (DAY_NAMES.includes(v)) week.dayOf[id] = v;
  }
  if (typeof legacy.notes === 'string') week.notes = legacy.notes;
  draft.weeks[current] = week;
  return draft;
}

function pruneWeeks(next) {
  const keys = Object.keys(next.weeks).sort(compareWeekKeys);
  if (keys.length <= MAX_WEEKS_KEPT) return;
  const drop = keys.slice(0, keys.length - MAX_WEEKS_KEPT);
  for (const k of drop) delete next.weeks[k];
}

function flushSave() {
  saveTimer = null;
  pendingSave = false;
  saveState(stripRuntime(state));
  emit({ type: 'saved' });
}

function stripRuntime(s) {
  const { loaded, ...rest } = s;
  return rest;
}

/** Force any debounced write to disk immediately (used on tab hide / unload). */
export function flushNow() {
  if (saveTimer) clearTimeout(saveTimer);
  if (pendingSave || saveTimer) flushSave();
}

/**
 * Apply a mutation.
 * @param {(draft: object) => void} fn  mutates state in place
 * @param {{silent?: boolean, reason?: string}} opts  silent = save but do not re-render
 */
export function update(fn, opts = {}) {
  fn(state);
  state.updatedAt = Date.now();
  pruneWeeks(state);
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  if (!opts.silent) emit({ type: 'change', reason: opts.reason || null });
  return state;
}

export function replaceState(rawState, reason = 'replace') {
  const next = normalise(rawState);
  Object.keys(state).forEach((k) => {
    if (k !== 'loaded') delete state[k];
  });
  Object.assign(state, next);
  state.loaded = true;
  flushNow();
  update(() => {}, { reason });
  return state;
}

/** Get (creating if needed) the bucket for a week key. */
export function ensureWeek(key) {
  if (!state.weeks[key]) {
    update((d) => {
      d.weeks[key] = blankWeek();
    }, { silent: true });
  }
  return state.weeks[key];
}

export function getWeek(key) {
  return state.weeks[key] || blankWeek();
}

export function personById(id) {
  return state.people.find((p) => p.id === id) || null;
}

/**
 * Boot: load newest snapshot, migrate a legacy single-file save if that is all we have,
 * otherwise start from defaults.
 */
export async function initState() {
  const loaded = await loadState();
  if (loaded) {
    Object.assign(state, normalise(loaded.state), { loaded: true });
    state.meta.loadedFrom = loaded.source;
    // Recovering from a fallback store means the other stores are missing or stale.
    // Write the recovered data straight back to every layer, otherwise a second
    // eviction before the next edit would lose the week entirely.
    if (loaded.source !== 'local') saveState(stripRuntime(state));
  } else {
    const legacy = readLegacyState();
    if (legacy) {
      Object.assign(state, migrateLegacy(legacy.data, legacy.key), { loaded: true });
    } else {
      Object.assign(state, normalise({}), { loaded: true });
    }
    saveState(stripRuntime(state));
  }
  return state;
}

export function resetEverything() {
  clearAllStorage();
  return replaceState({}, 'reset');
}

export { CATEGORY_DEFS, CATEGORY_KEYS };
