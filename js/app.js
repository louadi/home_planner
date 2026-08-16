// App controller: routing between views, the week selector, saving indicator,
// backup/restore, calendar export and service worker registration.

import { el, icon, mount, toast, openSheet, closeSheet, confirmSheet, $ } from './dom.js';
import { state, initState, update, subscribe, ensureWeek, normalise, flushNow, replaceState } from './state.js';
import {
  weekKey as currentWeekKey,
  shiftWeekKey,
  weekRangeLabel,
  weekOffsetFromNow,
  describeWeekOffset,
  dayName,
  DAY_NAMES,
} from './week.js';
import { requestPersistentStorage } from './storage.js';
import { allocateWeek, BOTH } from './allocate.js';
import { downloadIcs, weekKeysFrom } from './ics.js';
import { openShareList } from './share.js';
import { renderToday } from './view-today.js';
import { renderWeek } from './view-week.js';
import { renderBalance } from './view-balance.js';
import { renderGroceries } from './view-groceries.js';
import { renderSetup } from './view-setup.js';

const TABS = [
  { id: 'today', label: 'Today', icon: 'today', render: renderToday },
  { id: 'week', label: 'Week', icon: 'calendar', render: renderWeek },
  { id: 'balance', label: 'Balance', icon: 'scale', render: renderBalance },
  { id: 'list', label: 'Shopping', icon: 'cart', render: renderGroceries },
  { id: 'setup', label: 'Setup', icon: 'gear', render: renderSetup },
];

const ui = {
  tab: 'today',
  weekKey: currentWeekKey(),
  focusDay: null,
};

let refreshTimer = null;

/** Re-render the current view. `soft` only refreshes counters that live outside the view. */
function refresh(opts = {}) {
  const tab = TABS.find((t) => t.id === ui.tab) || TABS[0];
  ensureWeek(ui.weekKey);
  renderChrome();
  if (opts.soft) {
    // A tick already updated its own row; just recompute the header and badges.
    updateBadges();
    return;
  }
  const host = $('#view');
  const scroll = window.scrollY;
  tab.render(host, {
    weekKey: ui.weekKey,
    refresh,
    scheduleRefresh,
    focusDay: ui.focusDay,
    applyDrop,
    goToDay,
    updateBadges,
    exportCalendar: () => openCalendarSheet(),
  });
  if (opts.keepScroll !== false) window.scrollTo({ top: scroll });
}

/** Debounced refresh, for continuous inputs like sliders. */
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refresh({ keepScroll: true }), 220);
}

function goToDay(day) {
  ui.focusDay = day;
  ui.tab = 'today';
  refresh();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Handle a drag-and-drop: move to a day and/or hand to a person. */
function applyDrop({ taskId, day, person }) {
  const alloc = allocateWeek(state, ui.weekKey);
  let item = null;
  for (const d of DAY_NAMES) {
    const found = alloc.days[d].items.find((t) => t.id === taskId);
    if (found) {
      item = found;
      break;
    }
  }
  if (!item) return;
  if (item.day === day && item.owner === person) return;

  const previous = {
    day: state.weeks[ui.weekKey]?.dayOf?.[taskId],
    owner: state.weeks[ui.weekKey]?.owner?.[taskId],
  };

  update((d) => {
    const w = d.weeks[ui.weekKey];
    if (day) {
      if (day === item.homeDay) delete w.dayOf[taskId];
      else w.dayOf[taskId] = day;
    }
    // A shared task dropped into one person's column becomes that person's job.
    if (person) w.owner[taskId] = person;
  });

  refresh();
  const who = state.people.find((p) => p.id === person);
  toast(`Moved to ${day}${who ? ` · ${who.name}` : ''}`, {
    label: 'Undo',
    onClick: () => {
      update((d) => {
        const w = d.weeks[ui.weekKey];
        if (previous.day) w.dayOf[taskId] = previous.day;
        else delete w.dayOf[taskId];
        if (previous.owner) w.owner[taskId] = previous.owner;
        else delete w.owner[taskId];
      });
      refresh();
    },
  });
}

// ── Chrome (top bar + tabs) ──────────────────────────────────
function renderChrome() {
  const offset = weekOffsetFromNow(ui.weekKey);
  $('#week-pill-main').textContent = describeWeekOffset(offset);
  $('#week-pill-sub').textContent = weekRangeLabel(ui.weekKey);
  $('#btn-jump-today').hidden = offset === 0;
  updateBadges();
}

function updateBadges() {
  const alloc = allocateWeek(state, ui.weekKey);
  const done = state.weeks[ui.weekKey]?.done || {};
  const today = weekOffsetFromNow(ui.weekKey) === 0 ? dayName() : DAY_NAMES[0];
  const focus = ui.focusDay || today;
  const left = alloc.days[focus].items.filter((t) => !done[t.id]).length;
  const shopping = state.groceries.filter((g) => !g.checked).length;

  const counts = { today: left, list: shopping };
  TABS.forEach((tab) => {
    const btn = document.getElementById(`tab-${tab.id}`);
    if (!btn) return;
    btn.querySelector('.tab-badge')?.remove();
    const n = counts[tab.id];
    if (n > 0) btn.appendChild(el('span', { class: 'tab-badge', text: n > 99 ? '99+' : String(n) }));
  });
}

function buildTabs() {
  const bar = $('#tabbar');
  mount(
    bar,
    TABS.map((tab) =>
      el(
        'button',
        {
          class: `tab${tab.id === ui.tab ? ' active' : ''}`,
          id: `tab-${tab.id}`,
          type: 'button',
          role: 'tab',
          'aria-selected': String(tab.id === ui.tab),
          onclick: () => {
            ui.tab = tab.id;
            if (tab.id !== 'today') ui.focusDay = null;
            update((d) => {
              d.settings.lastTab = tab.id;
            }, { silent: true });
            document.querySelectorAll('.tab').forEach((b) => {
              const on = b.id === `tab-${tab.id}`;
              b.classList.toggle('active', on);
              b.setAttribute('aria-selected', String(on));
            });
            refresh({ keepScroll: false });
            window.scrollTo({ top: 0 });
          },
        },
        [icon(tab.icon, 22), el('span', { text: tab.label })]
      )
    )
  );
}

function setWeek(key) {
  ui.weekKey = key;
  ui.focusDay = null;
  ensureWeek(key);
  refresh({ keepScroll: false });
}

// ── Backup / restore ─────────────────────────────────────────
function exportBackup() {
  flushNow();
  const payload = { ...state };
  delete payload.loaded;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = el('a', { href: url, download: `home-planner-backup-${stamp}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  update((d2) => {
    d2.meta.lastBackupAt = Date.now();
  }, { silent: true });
  toast('Backup saved');
}

function importBackup() {
  const input = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object' || (!parsed.tasks && !parsed.shares)) throw new Error('unrecognised');
        confirmSheet({
          title: 'Restore this backup?',
          message: 'Your current plan on this device will be replaced.',
          confirmLabel: 'Restore',
          danger: false,
          onConfirm: () => {
            replaceState(parsed, 'import');
            ui.weekKey = currentWeekKey();
            refresh({ keepScroll: false });
            toast('Backup restored');
          },
        });
      } catch {
        toast('That file could not be read');
      }
      input.remove();
    };
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
}

// ── Calendar ─────────────────────────────────────────────────
function openCalendarSheet() {
  openSheet({
    title: 'Add to your calendar',
    subtitle: 'Downloads a calendar file. Open it and your calendar app will offer to add the events.',
    options: [
      {
        label: 'This week only',
        icon: 'calendar',
        onClick: () => {
          downloadIcs(state, [ui.weekKey]);
          toast('Calendar file downloaded');
        },
      },
      {
        label: 'Next 4 weeks',
        icon: 'calendar',
        hint: 'Handy for planning ahead',
        onClick: () => {
          downloadIcs(state, weekKeysFrom(ui.weekKey, 4));
          toast('Calendar file downloaded');
        },
      },
      {
        label: 'Next 12 weeks',
        icon: 'calendar',
        onClick: () => {
          downloadIcs(state, weekKeysFrom(ui.weekKey, 12));
          toast('Calendar file downloaded');
        },
      },
    ],
  });
}

// ── Overflow menu ────────────────────────────────────────────
function openMenu() {
  const offset = weekOffsetFromNow(ui.weekKey);
  openSheet({
    title: 'More',
    subtitle: `${describeWeekOffset(offset)} · ${weekRangeLabel(ui.weekKey)}`,
    options: [
      { label: 'Add to calendar', icon: 'calendar', onClick: openCalendarSheet },
      {
        label: 'Send shopping list',
        icon: 'cart',
        hint: 'Email it, or share it to another app',
        onClick: () => openShareList(state),
      },
      { label: 'Print this week', icon: 'note', onClick: () => setTimeout(() => window.print(), 260) },
      {
        label: 'Shuffle who does what',
        icon: 'swap',
        hint: 'Keeps your ticks, just redraws the rota',
        onClick: () =>
          confirmSheet({
            title: 'Shuffle this week?',
            message: 'Tasks will be re-dealt between you both, still respecting your percentages. Anything you set by hand stays.',
            confirmLabel: 'Shuffle',
            danger: false,
            onConfirm: () => {
              update((d) => {
                d.weeks[ui.weekKey].roll = (d.weeks[ui.weekKey].roll || 0) + 1;
              });
              refresh();
              toast('Week shuffled');
            },
          }),
      },
      {
        label: 'Clear all ticks this week',
        icon: 'undo',
        onClick: () => {
          const previous = { ...(state.weeks[ui.weekKey].done || {}) };
          update((d) => {
            d.weeks[ui.weekKey].done = {};
          });
          refresh();
          toast('Ticks cleared', {
            label: 'Undo',
            onClick: () => {
              update((d) => {
                d.weeks[ui.weekKey].done = previous;
              });
              refresh();
            },
          });
        },
      },
      {
        label: 'Undo my manual changes',
        icon: 'undo',
        hint: 'Moved days and hand-picked owners',
        onClick: () => {
          update((d) => {
            d.weeks[ui.weekKey].dayOf = {};
            d.weeks[ui.weekKey].owner = {};
            d.weeks[ui.weekKey].skipped = {};
          });
          refresh();
          toast('Back to the automatic plan');
        },
      },
      { label: 'Save a backup', icon: 'download', onClick: exportBackup },
      { label: 'Restore a backup', icon: 'upload', onClick: importBackup },
    ],
  });
}

function openWeekPicker() {
  const options = [];
  for (let i = -3; i <= 4; i++) {
    const key = shiftWeekKey(currentWeekKey(), i);
    options.push({
      label: describeWeekOffset(i),
      hint: weekRangeLabel(key),
      active: key === ui.weekKey,
      onClick: () => setWeek(key),
    });
  }
  openSheet({ title: 'Which week?', options });
}

// ── Save indicator ───────────────────────────────────────────
function wireSaveIndicator() {
  const dot = $('#save-dot');
  subscribe((detail) => {
    if (detail.type === 'change') {
      dot.classList.add('saving');
      dot.title = 'Saving…';
    } else if (detail.type === 'saved') {
      dot.classList.remove('saving');
      dot.title = 'All changes saved';
    }
  });
}

// ── Week rollover ────────────────────────────────────────────
// If the tablet has been asleep since last week, move to the current week on wake so
// nobody is ever looking at a stale plan without realising it.
function checkRollover() {
  const real = currentWeekKey();
  if (ui.weekKey === real) return;
  const wasViewingLive = weekOffsetFromNow(ui.weekKey) < 0;
  if (!wasViewingLive) return;
  ui.weekKey = real;
  ensureWeek(real);
  refresh({ keepScroll: false });
  toast('A new week has started');
}

// ── Boot ─────────────────────────────────────────────────────
async function boot() {
  await initState();
  requestPersistentStorage();

  if (['light', 'dark'].includes(state.settings.theme)) {
    document.documentElement.dataset.theme = state.settings.theme;
  }

  ui.tab = TABS.some((t) => t.id === state.settings.lastTab) ? state.settings.lastTab : 'today';
  ui.weekKey = currentWeekKey();
  ensureWeek(ui.weekKey);

  buildTabs();
  wireSaveIndicator();

  $('#btn-prev-week').appendChild(icon('chevronLeft', 22));
  $('#btn-next-week').appendChild(icon('chevronRight', 22));
  $('#btn-menu').appendChild(icon('dots', 22));

  $('#btn-prev-week').addEventListener('click', () => setWeek(shiftWeekKey(ui.weekKey, -1)));
  $('#btn-next-week').addEventListener('click', () => setWeek(shiftWeekKey(ui.weekKey, 1)));
  $('#week-pill').addEventListener('click', openWeekPicker);
  $('#btn-jump-today').addEventListener('click', () => setWeek(currentWeekKey()));
  $('#btn-menu').addEventListener('click', openMenu);

  // Expose the handful of actions the Setup view needs.
  Object.assign(window, {});
  const setupCtx = { exportBackup, importBackup };
  const originalSetup = TABS.find((t) => t.id === 'setup');
  originalSetup.render = (host, ctx) => renderSetup(host, { ...ctx, ...setupCtx });

  refresh({ keepScroll: false });

  $('#app').hidden = false;
  const bootEl = $('#boot');
  bootEl.classList.add('hide');
  setTimeout(() => bootEl.remove(), 320);

  // Never lose work when the tab is backgrounded or closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else checkRollover();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('beforeunload', flushNow);
  // A tablet left open for days should still notice the week turning over.
  setInterval(checkRollover, 60 * 1000);

  if ('serviceWorker' in navigator) {
    // boot() awaits IndexedDB before reaching this point, and a module stops blocking the
    // load event at its first await. So load has usually already fired by now, and a plain
    // load listener would never run, leaving the app with no offline support at all.
    const registerServiceWorker = async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        // Offer a refresh when a new version has been deployed, rather than leaving the
        // tablet on an old copy until it happens to be closed.
        reg.addEventListener('updatefound', () => {
          const fresh = reg.installing;
          if (!fresh) return;
          fresh.addEventListener('statechange', () => {
            if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
              toast('An update is ready', { label: 'Reload', onClick: () => window.location.reload() });
            }
          });
        });
        // Check again when the app is brought back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      } catch {
        /* offline support is a bonus, not a requirement */
      }
    };

    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker, { once: true });
  }
}

boot().catch((err) => {
  console.error(err);
  const bootEl = $('#boot');
  if (bootEl) {
    mount(bootEl, [
      el('div', { class: 'boot-inner' }, [
        el('div', { class: 'boot-mark', text: '!' }),
        el('p', { text: 'Something went wrong loading your plan.' }),
        el('p', { style: { fontSize: '12px', marginTop: '8px', opacity: '0.7' }, text: String(err?.message || err) }),
      ]),
    ]);
  }
});
