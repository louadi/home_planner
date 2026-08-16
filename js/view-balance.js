// Balance view: set the target split per category and see what the plan actually achieved.
// Being honest here matters — if a target is unreachable because of the task mix, say so
// rather than showing a number that never moves.

import { el, icon, mount, toast, segmented } from './dom.js';
import { state, update, defaultShares } from './state.js';
import { CATEGORY_DEFS } from './data.js';
import { allocateWeek, completedPoints } from './allocate.js';
import { shiftWeekKey, weekKey as currentWeekKey, weekOffsetFromNow, describeWeekOffset, weekRangeLabel } from './week.js';
import { avatarFor } from './tasks-ui.js';

export function renderBalance(host, ctx) {
  const { weekKey: wk, refresh } = ctx;
  const alloc = allocateWeek(state, wk);
  const [a, b] = state.people;
  const nodes = [el('h2', { class: 'section-title', text: 'Balance' })];

  // Label the week honestly: the user may be looking at next week or a past week.
  const offset = weekOffsetFromNow(wk);
  const whenLabel = describeWeekOffset(offset);
  const whenShort = offset === 0 ? 'this week' : whenLabel.toLowerCase();
  const pts = (n) => `${n} point${n === 1 ? '' : 's'}`;

  // Headline: planned split, and what has actually been completed so far.
  const totalPts = alloc.totals.a + alloc.totals.b;
  const pctA = alloc.pctA;
  const doneP = completedPoints(state, wk);
  const doneTotal = doneP.a + doneP.b;
  const donePct = doneTotal ? Math.round((doneP.a / doneTotal) * 100) : 50;

  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: whenLabel }),
          el('div', { class: 'card-sub', text: `${weekRangeLabel(wk)} · ${totalPts} effort points planned` }),
        ]),
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'stat-label', text: 'Planned split' }),
        el('div', { class: 'split-bar' }, [
          el('div', { class: 'split-seg', style: { background: a.color, flexBasis: `${pctA}%` }, text: `${a.name} ${pctA}%` }),
          el('div', { class: 'split-seg', style: { background: b.color, flexBasis: `${100 - pctA}%` }, text: `${b.name} ${100 - pctA}%` }),
        ]),
        el('div', { class: 'stat-label', style: { marginTop: '16px' }, text: 'Of the work done so far' }),
        doneTotal
          ? el('div', {}, [
              el('div', { class: 'split-bar' }, [
                // Always name both people: an unlabelled full bar reads as "100% complete".
                donePct > 0
                  ? el('div', {
                      class: 'split-seg',
                      style: { background: a.color, flexBasis: `${donePct}%` },
                      text: donePct >= 25 ? `${a.name} ${donePct}%` : `${donePct}%`,
                    })
                  : null,
                donePct < 100
                  ? el('div', {
                      class: 'split-seg',
                      style: { background: b.color, flexBasis: `${100 - donePct}%` },
                      text: 100 - donePct >= 25 ? `${b.name} ${100 - donePct}%` : `${100 - donePct}%`,
                    })
                  : null,
              ]),
              el('div', {
                class: 'muted',
                style: { marginTop: '6px' },
                text: `${a.name} has done ${pts(doneP.a)}, ${b.name} ${pts(doneP.b)}. This is the share of completed work, not how much of the week is finished.`,
              }),
            ])
          : el('div', { class: 'muted', style: { marginTop: '6px' }, text: `Nothing ticked off ${whenShort} yet.` }),
      ]),
    ])
  );

  // Presets
  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: 'Preset' }),
          el('div', { class: 'card-sub', text: 'A starting point you can then fine-tune' }),
        ]),
      ]),
      el('div', { class: 'card-body' }, [
        segmented(
          [
            { value: 'aHeavy', label: `${a.name} heavy` },
            { value: 'bHeavy', label: `${b.name} heavy` },
            { value: 'balanced', label: 'Balanced' },
            { value: 'custom', label: 'Custom' },
          ],
          state.mode,
          (mode) => {
            if (mode === 'custom') {
              update((d) => {
                d.mode = 'custom';
              });
              refresh();
              return;
            }
            update((d) => {
              d.mode = mode;
              d.shares = defaultShares(mode);
            });
            refresh();
            const applied =
              mode === 'balanced' ? 'Balanced preset applied' : `${mode === 'aHeavy' ? a.name : b.name}-heavy preset applied`;
            toast(applied);
          }
        ),
        el('p', {
          class: 'muted',
          style: { marginTop: '10px' },
          text: `${a.name} heavy puts most of the load on ${a.name}, ${b.name} heavy does the reverse, and Balanced evens it out. Any preset is just a starting point you can fine-tune below.`,
        }),
      ]),
    ])
  );

  // Per-category sliders with honest feedback about what was achieved.
  const sliderCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('div', { class: 'card-title', text: `How much goes to ${a.name}` }),
        el('div', { class: 'card-sub', text: 'Drag, or use the − and + buttons for fine control' }),
      ]),
    ]),
  ]);
  const sliderBody = el('div', { class: 'card-body' });

  Object.entries(CATEGORY_DEFS).forEach(([key, meta]) => {
    const cat = alloc.perCat[key] || { total: 0 };
    const value = state.shares[key] ?? 50;

    if (meta.auto) {
      sliderBody.appendChild(
        el('div', { class: 'slider-row' }, [
          el('div', { class: 'slider-top' }, [
            el('span', { class: 'slider-icon', text: meta.icon }),
            el('div', { class: 'slider-label' }, [
              el('div', { class: 'slider-name', text: meta.label }),
              el('div', { class: 'slider-desc', text: 'Automatic: always whoever did not cook that day' }),
            ]),
            el('span', { class: 'chip', text: 'auto' }),
          ]),
        ])
      );
      return;
    }

    const pctEl = el('span', { class: 'slider-pct', text: `${value}%` });
    const noteEl = el('div', { class: 'slider-note' });
    const range = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      value: String(value),
      'aria-label': `${meta.label}: percentage for ${a.name}`,
    });

    const commit = (next) => {
      const v = Math.max(0, Math.min(100, next));
      range.value = String(v);
      pctEl.textContent = `${v}%`;
      update((d) => {
        d.shares[key] = v;
        d.mode = 'custom';
      }, { silent: true });
      ctx.scheduleRefresh?.();
    };

    range.addEventListener('input', () => commit(Number(range.value)));

    // Explain when the task mix cannot deliver the requested target.
    if (cat.total === 0) {
      noteEl.appendChild(el('span', { text: `No tasks of this type ${whenShort}.` }));
    } else if (cat.locked) {
      noteEl.append(icon('users', 14), el('span', { text: 'All of these are "together" tasks, so they are always shared 50/50.' }));
    } else if (Math.abs(cat.actual - value) > 12) {
      noteEl.append(
        icon('scale', 14),
        el('span', {
          text: `Landed at ${cat.actual}% — with only ${pts(cat.total)} to divide, one point is worth ${Math.round(cat.step)}%. It evens out across weeks.`,
        })
      );
    }

    sliderBody.appendChild(
      el('div', { class: 'slider-row' }, [
        el('div', { class: 'slider-top' }, [
          el('span', { class: 'slider-icon', text: meta.icon }),
          el('div', { class: 'slider-label' }, [
            el('div', { class: 'slider-name', text: meta.label }),
            el('div', { class: 'slider-desc', text: meta.desc }),
          ]),
          el('div', { class: 'slider-values' }, [pctEl]),
        ]),
        el('div', { class: 'slider-controls' }, [
          el('button', { class: 'step-btn', type: 'button', 'aria-label': `Less for ${a.name}`, text: '−', onclick: () => commit(Number(range.value) - 5) }),
          range,
          el('button', { class: 'step-btn', type: 'button', 'aria-label': `More for ${a.name}`, text: '+', onclick: () => commit(Number(range.value) + 5) }),
        ]),
        cat.total
          ? el('div', { class: 'muted', style: { marginTop: '6px' }, text: `${whenLabel}: ${a.name} ${cat.actual}% · ${cat.a} of ${pts(cat.total)}` })
          : null,
        noteEl.childNodes.length ? noteEl : null,
      ])
    );
  });

  sliderCard.appendChild(sliderBody);
  nodes.push(sliderCard);

  // Fairness over recent weeks
  const history = [];
  for (let i = 7; i >= 0; i--) {
    const k = shiftWeekKey(wk, -i);
    if (!state.weeks[k] && k !== wk) continue;
    const al = allocateWeek(state, k);
    history.push({ key: k, pctA: al.pctA, isCurrent: k === wk });
  }

  if (history.length > 1) {
    nodes.push(
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('div', {}, [
            el('div', { class: 'card-title', text: 'Recent weeks' }),
            el('div', { class: 'card-sub', text: `Share of the load carried by ${a.name}` }),
          ]),
        ]),
        el('div', { class: 'card-body' }, [
          el(
            'div',
            { class: 'history' },
            history.map((h) =>
              el('div', { class: 'history-col' }, [
                el('div', { class: 'history-label', text: `${h.pctA}%` }),
                el('div', {
                  class: `history-bar${h.isCurrent ? '' : ' dim'}`,
                  style: { height: `${Math.max(4, h.pctA * 0.6)}px` },
                  title: `${h.key}: ${h.pctA}%`,
                }),
                el('div', { class: 'history-label', text: h.key.slice(-3) }),
              ])
            )
          ),
        ]),
      ])
    );
  }

  nodes.push(
    el('div', { class: 'btn-row' }, [
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => {
            update((d) => {
              d.shares = defaultShares(d.mode === 'custom' ? 'balanced' : d.mode);
            });
            refresh();
            toast('Targets reset');
          },
        },
        [icon('undo', 18), 'Reset targets']
      ),
    ])
  );

  mount(host, nodes);
}
