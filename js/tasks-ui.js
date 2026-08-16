// Shared task rendering plus the per-task action menu.
// Used by both the Today and Week views so behaviour stays identical between them.

import { el, icon, openSheet, closeSheet, toast, initials, field } from './dom.js';
import { DAY_NAMES } from './week.js';
import { CATEGORY_DEFS } from './data.js';
import { BOTH } from './allocate.js';
import { state, update, ensureWeek, uid } from './state.js';
import { downloadTaskIcs } from './ics.js';

export function avatarFor(person, size = 30) {
  return el('span', {
    class: 'avatar',
    style: { background: person.color, width: `${size}px`, height: `${size}px` },
    text: initials(person.name),
    'aria-hidden': 'true',
  });
}

export function ownerName(item) {
  const [a, b] = state.people;
  if (item.owner === BOTH) return `${a.name} + ${b.name}`;
  return item.owner === a.id ? a.name : b.name;
}

/** Toggle done, updating just this row so a tap never re-renders the whole screen. */
function toggleDone(weekKeyStr, item, onChanged) {
  const week = ensureWeek(weekKeyStr);
  const next = !week.done[item.id];
  update((d) => {
    const w = d.weeks[weekKeyStr];
    if (next) w.done[item.id] = true;
    else delete w.done[item.id];
  }, { silent: true });

  // A "together" task appears in both columns, so update every copy — including each
  // copy's button state, or a screen reader would announce the stale value.
  document.querySelectorAll(`[data-task-id="${item.id}"]`).forEach((node) => {
    node.classList.toggle('done', next);
    const btn = node.querySelector('.task-check');
    if (btn) {
      btn.setAttribute('aria-pressed', String(next));
      btn.setAttribute('aria-label', `Mark "${item.text}" ${next ? 'not done' : 'done'}`);
    }
  });
  onChanged?.(next);
  return next;
}

/**
 * Build one task row.
 * @param {object} opts
 * @param {string} opts.weekKey
 * @param {object} opts.item allocation entry
 * @param {boolean} [opts.showDay] show which day it falls on (used by Today's "later" list)
 * @param {boolean} [opts.showOwner] show the owner avatar (used in single-column layouts)
 * @param {() => void} opts.onRefresh called when a change needs a full re-render
 * @param {(done:boolean) => void} [opts.onToggle] called after a tick, for cheap counter updates
 */
export function taskRow({ weekKey: wk, item, showDay = false, showOwner = false, onRefresh, onToggle }) {
  const week = state.weeks[wk] || {};
  const done = !!week.done?.[item.id];
  const cat = CATEGORY_DEFS[item.cat];
  const [a, b] = state.people;
  const owner = item.owner === BOTH ? null : item.owner === a.id ? a : b;

  const row = el(
    'li',
    {
      class: `task${done ? ' done' : ''}${item.shared ? ' shared' : ''}`,
      dataset: { taskId: item.id },
    },
    [
      el('span', { class: 'drag-handle', 'aria-hidden': 'true' }, [icon('move', 16)]),
      el(
        'button',
        {
          class: 'task-check',
          type: 'button',
          'aria-pressed': String(done),
          'aria-label': `Mark "${item.text}" ${done ? 'not done' : 'done'}`,
          onclick: (e) => {
            e.stopPropagation();
            toggleDone(wk, item, onToggle);
          },
        },
        [icon('check', 19)]
      ),
      el('div', { class: 'task-main' }, [
        el('div', { class: 'task-text', text: item.text }),
        el('div', { class: 'task-meta' }, [
          showOwner && owner ? avatarFor(owner, 20) : null,
          item.shared ? el('span', { class: 'chip together', text: 'together' }) : null,
          el('span', { class: 'chip', text: `${cat?.icon || ''} ${cat?.label || item.cat}`.trim() }),
          state.settings.showPoints ? el('span', { class: 'chip', text: `${item.pts} pt` }) : null,
          showDay ? el('span', { class: 'chip', text: item.day }) : null,
          item.moved ? el('span', { class: 'chip moved', text: `moved from ${item.homeDay}` }) : null,
          item.manual ? el('span', { class: 'chip pinned', text: 'set by you' }) : null,
        ]),
      ]),
      el(
        'button',
        {
          class: 'task-more',
          type: 'button',
          'aria-label': `Options for ${item.text}`,
          onclick: (e) => {
            e.stopPropagation();
            openTaskMenu({ weekKey: wk, item, onRefresh });
          },
        },
        [icon('dots', 20)]
      ),
    ]
  );

  return row;
}

/** Action sheet for a single task. */
export function openTaskMenu({ weekKey: wk, item, onRefresh }) {
  const [a, b] = state.people;
  const week = state.weeks[wk] || {};
  const done = !!week.done?.[item.id];

  const setOwner = (who) => {
    update((d) => {
      const w = d.weeks[wk] || (d.weeks[wk] = { done: {}, owner: {}, dayOf: {}, skipped: {}, extras: [], notes: '', roll: 0 });
      if (who === null) delete w.owner[item.id];
      else w.owner[item.id] = who;
    });
    onRefresh?.();
    toast(who === null ? 'Back to automatic' : `Given to ${who === BOTH ? 'both of you' : who === a.id ? a.name : b.name}`);
  };

  openSheet({
    title: item.text,
    subtitle: `${item.day} · ${CATEGORY_DEFS[item.cat]?.label || item.cat} · ${ownerName(item)}`,
    options: [
      {
        label: done ? 'Mark as not done' : 'Mark as done',
        icon: done ? 'undo' : 'check',
        onClick: () => {
          update((d) => {
            const w = d.weeks[wk] || (d.weeks[wk] = { done: {}, owner: {}, dayOf: {}, skipped: {}, extras: [], notes: '', roll: 0 });
            if (done) delete w.done[item.id];
            else w.done[item.id] = true;
          });
          onRefresh?.();
        },
      },
      { label: 'Move to another day', icon: 'calendar', onClick: () => openMoveDay({ weekKey: wk, item, onRefresh }) },
      !item.shared && item.owner !== a.id ? { label: `Give to ${a.name}`, icon: 'users', onClick: () => setOwner(a.id) } : null,
      !item.shared && item.owner !== b.id ? { label: `Give to ${b.name}`, icon: 'users', onClick: () => setOwner(b.id) } : null,
      item.owner !== BOTH ? { label: 'Do it together', icon: 'users', onClick: () => setOwner(BOTH) } : null,
      item.manual ? { label: 'Let the app decide again', icon: 'undo', onClick: () => setOwner(null) } : null,
      {
        label: 'Add to my calendar',
        icon: 'download',
        hint: 'Downloads a .ics you can open in Calendar',
        onClick: () => {
          downloadTaskIcs(wk, item.day, item, ownerName(item));
          toast('Calendar file downloaded');
        },
      },
      {
        label: 'Skip just this week',
        icon: 'skip',
        onClick: () => {
          update((d) => {
            const w = d.weeks[wk] || (d.weeks[wk] = { done: {}, owner: {}, dayOf: {}, skipped: {}, extras: [], notes: '', roll: 0 });
            w.skipped[item.id] = true;
          });
          onRefresh?.();
          toast('Skipped for this week', {
            label: 'Undo',
            onClick: () => {
              update((d) => {
                delete d.weeks[wk].skipped[item.id];
              });
              onRefresh?.();
            },
          });
        },
      },
      item.extra
        ? {
            label: 'Delete this one-off task',
            icon: 'trash',
            danger: true,
            onClick: () => {
              update((d) => {
                const w = d.weeks[wk];
                w.extras = (w.extras || []).filter((t) => t.id !== item.id);
                delete w.done[item.id];
              });
              onRefresh?.();
              toast('Task deleted');
            },
          }
        : null,
    ],
  });
}

function openMoveDay({ weekKey: wk, item, onRefresh }) {
  openSheet({
    title: 'Move to another day',
    subtitle: item.text,
    options: [
      ...DAY_NAMES.map((day) => ({
        label: day,
        active: day === item.day,
        hint: day === item.homeDay ? 'its usual day' : undefined,
        onClick: () => {
          update((d) => {
            const w = d.weeks[wk] || (d.weeks[wk] = { done: {}, owner: {}, dayOf: {}, skipped: {}, extras: [], notes: '', roll: 0 });
            if (day === item.homeDay) delete w.dayOf[item.id];
            else w.dayOf[item.id] = day;
          });
          onRefresh?.();
          toast(`Moved to ${day}`);
        },
      })),
    ],
  });
}

/** "Add a task just for this week" sheet. */
export function openAddTask({ weekKey: wk, day, onRefresh }) {
  const textInput = el('input', { type: 'text', placeholder: 'e.g. water the plants', enterkeyhint: 'done' });
  const daySelect = el('select', {}, DAY_NAMES.map((d) => el('option', { value: d, text: d, selected: d === day })));
  const catSelect = el(
    'select',
    {},
    Object.entries(CATEGORY_DEFS).map(([key, meta]) => el('option', { value: key, text: `${meta.icon} ${meta.label}` }))
  );
  const ptsSelect = el(
    'select',
    {},
    [1, 2, 3, 4, 5].map((n) => el('option', { value: String(n), text: `${n} point${n === 1 ? '' : 's'}`, selected: n === 2 }))
  );
  const [a, b] = state.people;
  const whoSelect = el('select', {}, [
    el('option', { value: '', text: 'Let the app decide' }),
    el('option', { value: a.id, text: a.name }),
    el('option', { value: b.id, text: b.name }),
    el('option', { value: BOTH, text: 'Both together' }),
  ]);

  const submit = () => {
    const text = textInput.value.trim();
    if (!text) {
      textInput.focus();
      return;
    }
    const who = whoSelect.value;
    update((d) => {
      const w = d.weeks[wk] || (d.weeks[wk] = { done: {}, owner: {}, dayOf: {}, skipped: {}, extras: [], notes: '', roll: 0 });
      w.extras.push({
        id: uid('extra'),
        text,
        cat: catSelect.value,
        pts: Number(ptsSelect.value),
        day: daySelect.value,
        person: who === BOTH ? null : who || null,
        shared: who === BOTH,
        extra: true,
      });
    });
    closeSheet();
    onRefresh?.();
    toast('Task added for this week');
  };

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });

  openSheet({
    title: 'Add a task',
    subtitle: 'Just for this week — it will not repeat.',
    content: [
      field('What needs doing', textInput),
      field('Day', daySelect),
      field('Type', catSelect),
      field('Effort', ptsSelect, 'Used to keep the workload fair'),
      field('Who', whoSelect),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent wide', type: 'button', text: 'Add task', onclick: submit }),
      ]),
    ],
  });

  setTimeout(() => textInput.focus(), 260);
}
