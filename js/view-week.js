// Week view: all seven days, both people, drag-and-drop between any day or person.

import { el, icon, mount } from './dom.js';
import { DAY_NAMES, dayName, shortDayDateLabel, weekOffsetFromNow } from './week.js';
import { state } from './state.js';
import { allocateWeek, BOTH } from './allocate.js';
import { taskRow, avatarFor, openAddTask } from './tasks-ui.js';
import { enableDragAndDrop } from './dragdrop.js';

export function renderWeek(host, ctx) {
  const { weekKey: wk, refresh } = ctx;
  const alloc = allocateWeek(state, wk);
  const week = state.weeks[wk] || {};
  const done = week.done || {};
  const today = weekOffsetFromNow(wk) === 0 ? dayName() : null;
  const [a, b] = state.people;

  const nodes = [el('h2', { class: 'section-title', text: 'The whole week' })];

  DAY_NAMES.forEach((day) => {
    const dayAlloc = alloc.days[day];
    const program = state.program.find((p) => p.day === day);
    const total = dayAlloc.items.length;
    const dayCounter = el('span', { class: 'chip', text: `${dayAlloc.items.filter((t) => done[t.id]).length}/${total}` });

    // Ticking a box updates this day's counter in place instead of redrawing the week.
    const onTick = () => {
      const nowDone = state.weeks[wk]?.done || {};
      dayCounter.textContent = `${dayAlloc.items.filter((t) => nowDone[t.id]).length}/${total}`;
      ctx.updateBadges?.();
    };

    const colFor = (person) => {
      const items = dayAlloc.items.filter((t) => t.owner === person.id || t.owner === BOTH);
      const load = items.reduce((s, t) => s + (t.owner === BOTH ? t.pts / 2 : t.pts), 0);
      const list = el('ul', { class: 'task-list' });
      if (!items.length) {
        list.appendChild(el('li', { class: 'empty', text: 'Free — drag here' }));
      } else {
        items.forEach((item) => list.appendChild(taskRow({ weekKey: wk, item, onRefresh: refresh, onToggle: onTick })));
      }
      return el('div', { class: 'day-col', dataset: { dropZone: '1', day, person: person.id } }, [
        el('div', { class: 'day-col-head' }, [
          avatarFor(person, 22),
          el('span', { text: person.name }),
          state.settings.showPoints ? el('span', { style: { marginLeft: 'auto', fontWeight: '600' }, text: `${load}` }) : null,
        ]),
        list,
      ]);
    };

    nodes.push(
      el('section', { class: `day-block${day === today ? ' is-today' : ''}` }, [
        el('div', { class: 'day-head' }, [
          el('div', {}, [
            el('span', { class: 'day-name', text: day }),
            el('span', { class: 'day-date', style: { marginLeft: '8px' }, text: shortDayDateLabel(wk, day) }),
          ]),
          day === today ? el('span', { class: 'today-flag', text: 'today' }) : null,
          el('span', { class: 'day-focus', text: program?.focus || '' }),
          dayCounter,
          el(
            'button',
            {
              class: 'row-btn',
              type: 'button',
              'aria-label': `Add a task on ${day}`,
              onclick: () => openAddTask({ weekKey: wk, day, onRefresh: refresh }),
            },
            [icon('plus', 18)]
          ),
        ]),
        el('div', { class: 'day-cols' }, [colFor(a), colFor(b)]),
      ])
    );
  });

  nodes.push(
    el('div', { class: 'btn-row no-print' }, [
      el('button', { class: 'btn', type: 'button', onclick: () => window.print() }, [icon('note', 18), 'Print this week']),
      el('button', { class: 'btn', type: 'button', onclick: () => ctx.exportCalendar?.() }, [icon('calendar', 18), 'Add week to calendar']),
    ])
  );

  mount(host, nodes);
  enableDragAndDrop(host, ctx.applyDrop);
}
