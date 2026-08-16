// Today view: the default screen. Answers "what do I have to do right now" in one glance,
// with each person's jobs side by side, then the rest of the week below.

import { el, icon, mount, toast } from './dom.js';
import { DAY_NAMES, dayName, shortDayDateLabel, weekOffsetFromNow, DAY_NAMES as DAYS } from './week.js';
import { state } from './state.js';
import { allocateWeek, BOTH } from './allocate.js';
import { taskRow, avatarFor, openAddTask } from './tasks-ui.js';
import { enableDragAndDrop } from './dragdrop.js';

/**
 * @param {object} ctx { weekKey, refresh, applyDrop, focusDay }
 */
export function renderToday(host, ctx) {
  const { weekKey: wk, refresh } = ctx;
  const alloc = allocateWeek(state, wk);
  const week = state.weeks[wk] || {};
  const done = week.done || {};
  const offset = weekOffsetFromNow(wk);
  // When browsing another week there is no "today", so show its Monday instead.
  const focusDay = ctx.focusDay || (offset === 0 ? dayName() : DAY_NAMES[0]);
  const program = state.program.find((p) => p.day === focusDay);
  const dayAlloc = alloc.days[focusDay];
  const [a, b] = state.people;

  const nodes = [];

  nodes.push(
    el('section', { class: 'hero' }, [
      el('div', { class: 'hero-day', text: offset === 0 ? `Today — ${focusDay}` : focusDay }),
      el('div', {
        class: 'hero-meta',
        text: `${shortDayDateLabel(wk, focusDay)}${offset !== 0 ? ' · you are viewing another week' : ''}`,
      }),
      program?.focus ? el('div', { class: 'hero-focus', text: program.focus }) : null,
    ])
  );

  // The stat cards are updated in place after each tick, so the numbers a person is
  // looking at while tapping stay correct without re-rendering the whole screen.
  const statLeft = el('div', { class: 'stat-value' });
  const statLeftSub = el('div', { class: 'stat-sub' });
  const statPct = el('div', { class: 'stat-value' });
  const statPctSub = el('div', { class: 'stat-sub' });
  const statBar = el('div', { class: 'bar-fill' });

  const syncStats = () => {
    const nowDone = state.weeks[wk]?.done || {};
    const remaining = dayAlloc.items.filter((t) => !nowDone[t.id]).length;
    const totalToday = dayAlloc.items.length;
    const weekDone = alloc.instances.filter((t) => nowDone[t.id]).length;
    const weekTotal = alloc.instances.length;
    const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;

    statLeft.textContent = remaining === 0 ? 'All done' : String(remaining);
    statLeft.style.fontSize = remaining === 0 ? '20px' : '';
    statLeftSub.textContent = totalToday === 0 ? 'nothing scheduled' : `of ${totalToday} task${totalToday === 1 ? '' : 's'}`;
    statPct.textContent = `${pct}%`;
    statPctSub.textContent = `${weekDone} of ${weekTotal} done`;
    statBar.style.width = `${pct}%`;
    statBar.classList.toggle('good', pct === 100);
  };
  syncStats();

  nodes.push(
    el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label', text: offset === 0 ? 'Left today' : `Left ${focusDay}` }),
        statLeft,
        statLeftSub,
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'stat-label', text: 'This week' }),
        statPct,
        statPctSub,
        el('div', { class: 'bar' }, [statBar]),
      ]),
    ])
  );

  // Each person's jobs for the focused day, side by side.
  const laterCounters = new Map();

  const onTick = () => {
    syncStats();
    ctx.updateBadges?.();
    // Keep the "Coming up" counts honest too, in case a task was moved there.
    const nowDone = state.weeks[wk]?.done || {};
    laterCounters.forEach((node, day) => {
      const items = alloc.days[day].items;
      node.textContent = `${items.filter((t) => nowDone[t.id]).length}/${items.length}`;
    });
  };

  const columnFor = (person) => {
    const items = dayAlloc.items.filter((t) => t.owner === person.id || t.owner === BOTH);
    const load = items.reduce((s, t) => s + (t.owner === BOTH ? t.pts / 2 : t.pts), 0);
    const list = el('ul', { class: 'task-list' });
    if (!items.length) {
      list.appendChild(el('li', { class: 'empty', text: 'Nothing today — drag a task here' }));
    } else {
      items.forEach((item) => list.appendChild(taskRow({ weekKey: wk, item, onRefresh: refresh, onToggle: onTick })));
    }
    return el(
      'div',
      { class: 'person-col', dataset: { dropZone: '1', day: focusDay, person: person.id } },
      [
        el('div', { class: 'person-head' }, [
          avatarFor(person),
          el('span', { class: 'person-name', text: person.name }),
          state.settings.showPoints ? el('span', { class: 'person-load', text: `${load} pts` }) : null,
        ]),
        list,
      ]
    );
  };

  nodes.push(el('div', { class: 'grid-2' }, [columnFor(a), columnFor(b)]));

  nodes.push(
    el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn dashed wide', type: 'button', onclick: () => openAddTask({ weekKey: wk, day: focusDay, onRefresh: refresh }) }, [
        icon('plus', 18),
        'Add a task for today',
      ]),
    ])
  );

  // Rest of the week, as a compact tappable summary.
  const laterDays = DAYS.slice(DAYS.indexOf(focusDay) + 1);
  if (laterDays.length) {
    nodes.push(
      el('div', { class: 'card', style: { marginTop: '18px' } }, [
        el('div', { class: 'card-head' }, [el('div', {}, [el('div', { class: 'card-title', text: 'Coming up' })])]),
        el(
          'div',
          { class: 'card-body tight' },
          laterDays.map((day) => {
            const d = alloc.days[day];
            const total = d.items.length;
            const doneN = d.items.filter((t) => done[t.id]).length;
            const prog = state.program.find((p) => p.day === day);
            const counter = el('span', { class: 'chip', text: `${doneN}/${total}` });
            laterCounters.set(day, counter);
            return el(
              'button',
              {
                class: 'list-row',
                type: 'button',
                style: { width: '100%', textAlign: 'left' },
                onclick: () => ctx.goToDay?.(day),
              },
              [
                el('div', { style: { flex: '1', minWidth: '0' } }, [
                  el('div', { style: { fontWeight: '600', fontSize: '14.5px' } }, [
                    day,
                    el('span', { class: 'muted', style: { marginLeft: '8px', fontWeight: '400' }, text: shortDayDateLabel(wk, day) }),
                  ]),
                  prog?.focus ? el('div', { class: 'muted', style: { marginTop: '2px' }, text: prog.focus }) : null,
                ]),
                counter,
                icon('chevronRight', 18),
              ]
            );
          })
        ),
      ])
    );
  }

  mount(host, nodes);
  enableDragAndDrop(host, ctx.applyDrop);
}
