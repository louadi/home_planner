// Setup: names, the repeating task library, weekly rhythm, preferences, backup/restore.

import { el, icon, mount, toast, openSheet, closeSheet, confirmSheet, field } from './dom.js';
import { state, update, replaceState, resetEverything, uid } from './state.js';
import { CATEGORY_DEFS } from './data.js';
import { DAY_NAMES } from './week.js';
import { requestPersistentStorage, estimateStorage } from './storage.js';
import { avatarFor } from './tasks-ui.js';

function switchRow(title, desc, on, onToggle) {
  const sw = el('button', {
    class: `switch${on ? ' on' : ''}`,
    type: 'button',
    role: 'switch',
    'aria-checked': String(on),
    'aria-label': title,
    onclick: (e) => {
      const next = !e.currentTarget.classList.contains('on');
      e.currentTarget.classList.toggle('on', next);
      e.currentTarget.setAttribute('aria-checked', String(next));
      onToggle(next);
    },
  });
  return el('div', { class: 'switch-row' }, [
    el('div', { class: 'switch-text' }, [
      el('div', { class: 'switch-title', text: title }),
      el('div', { class: 'switch-desc', text: desc }),
    ]),
    sw,
  ]);
}

function openPersonEditor(index, refresh) {
  const person = state.people[index];
  const nameInput = el('input', { type: 'text', value: person.name, maxlength: '24' });
  const colorInput = el('input', { type: 'color', value: person.color, style: { height: '48px', padding: '4px' } });
  const save = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    update((d) => {
      d.people[index].name = name;
      d.people[index].color = colorInput.value;
    });
    closeSheet();
    refresh();
    toast('Saved');
  };
  openSheet({
    title: 'Edit person',
    content: [
      field('Name', nameInput),
      field('Colour', colorInput, 'Used for their avatar and the balance bars'),
      el('div', { class: 'btn-row' }, [el('button', { class: 'btn accent wide', type: 'button', text: 'Save', onclick: save })]),
    ],
  });
}

function openTaskEditor(task, refresh) {
  const isNew = !task;
  const t = task || { id: uid('task'), text: '', cat: 'cleaning', pts: 2, day: 'Monday', shared: false, person: null, active: true, custom: true };

  const textInput = el('input', { type: 'text', value: t.text, placeholder: 'e.g. Water the plants' });
  const daySelect = el('select', {}, DAY_NAMES.map((d) => el('option', { value: d, text: d, selected: d === t.day })));
  const catSelect = el(
    'select',
    {},
    Object.entries(CATEGORY_DEFS).map(([k, m]) => el('option', { value: k, text: `${m.icon} ${m.label}`, selected: k === t.cat }))
  );
  const ptsSelect = el(
    'select',
    {},
    [1, 2, 3, 4, 5].map((n) => el('option', { value: String(n), text: `${n} point${n === 1 ? '' : 's'}`, selected: n === t.pts }))
  );
  const [a, b] = state.people;
  const whoSelect = el('select', {}, [
    el('option', { value: '', text: 'Let the app decide (recommended)', selected: !t.shared && !t.person }),
    el('option', { value: a.id, text: `Always ${a.name}`, selected: t.person === a.id }),
    el('option', { value: b.id, text: `Always ${b.name}`, selected: t.person === b.id }),
    el('option', { value: 'both', text: 'Always together', selected: !!t.shared }),
  ]);

  const save = () => {
    const text = textInput.value.trim();
    if (!text) {
      textInput.focus();
      return;
    }
    const who = whoSelect.value;
    update((d) => {
      const next = {
        id: t.id,
        text,
        cat: catSelect.value,
        pts: Number(ptsSelect.value),
        day: daySelect.value,
        shared: who === 'both',
        person: who === 'both' || !who ? null : who,
        active: t.active !== false,
        custom: true,
      };
      const idx = d.tasks.findIndex((x) => x.id === t.id);
      if (idx >= 0) d.tasks[idx] = next;
      else d.tasks.push(next);
    });
    closeSheet();
    refresh();
    toast(isNew ? 'Task added to every week' : 'Task updated');
  };

  openSheet({
    title: isNew ? 'New repeating task' : 'Edit task',
    subtitle: 'This appears every week.',
    content: [
      field('What needs doing', textInput),
      field('Usual day', daySelect),
      field('Type', catSelect),
      field('Effort', ptsSelect, 'Higher effort counts for more when balancing'),
      field('Who does it', whoSelect, '"Always together" means you both do it and one tick completes it'),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn accent wide', type: 'button', text: isNew ? 'Add task' : 'Save changes', onclick: save }),
      ]),
      !isNew
        ? el('div', { class: 'btn-row' }, [
            el(
              'button',
              {
                class: 'btn danger wide',
                type: 'button',
                text: 'Delete this task',
                onclick: () => {
                  closeSheet();
                  confirmSheet({
                    title: 'Delete task?',
                    message: `"${t.text}" will be removed from every week.`,
                    confirmLabel: 'Delete',
                    onConfirm: () => {
                      update((d) => {
                        d.tasks = d.tasks.filter((x) => x.id !== t.id);
                      });
                      refresh();
                      toast('Task deleted');
                    },
                  });
                },
              }
            ),
          ])
        : null,
    ],
  });
}

export function renderSetup(host, ctx) {
  const { refresh } = ctx;
  const nodes = [el('h2', { class: 'section-title', text: 'Setup' })];

  // People
  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('div', {}, [el('div', { class: 'card-title', text: 'The two of you' })])]),
      el(
        'div',
        { class: 'card-body tight' },
        state.people.map((p, i) =>
          el('button', { class: 'list-row', type: 'button', style: { width: '100%', textAlign: 'left' }, onclick: () => openPersonEditor(i, refresh) }, [
            avatarFor(p, 34),
            el('span', { style: { flex: '1', fontWeight: '600', fontSize: '15px' }, text: p.name }),
            icon('edit', 18),
          ])
        )
      ),
    ])
  );

  // Task library, grouped by day
  const libraryBody = el('div', { class: 'card-body tight' });
  DAY_NAMES.forEach((day) => {
    const dayTasks = state.tasks.filter((t) => t.day === day);
    if (!dayTasks.length) return;
    libraryBody.appendChild(
      el('div', { class: 'day-col-head', style: { paddingTop: '12px' }, text: day })
    );
    dayTasks.forEach((t) => {
      libraryBody.appendChild(
        el('div', { class: 'list-row' }, [
          el(
            'button',
            {
              class: 'row-btn',
              type: 'button',
              'aria-label': t.active === false ? `Turn on ${t.text}` : `Turn off ${t.text}`,
              style: { color: t.active === false ? 'var(--ink-3)' : 'var(--good)' },
              onclick: () => {
                update((d) => {
                  const x = d.tasks.find((y) => y.id === t.id);
                  if (x) x.active = x.active === false;
                });
                refresh();
              },
            },
            [icon(t.active === false ? 'close' : 'check', 18)]
          ),
          el(
            'button',
            { class: 'list-input', type: 'button', style: { textAlign: 'left', opacity: t.active === false ? '0.5' : '1' }, onclick: () => openTaskEditor(t, refresh) },
            [
              el('span', { style: { fontWeight: '500' }, text: t.text }),
              el('span', { class: 'muted', style: { display: 'block', fontSize: '12px' } , text: `${CATEGORY_DEFS[t.cat]?.icon || ''} ${CATEGORY_DEFS[t.cat]?.label || t.cat} · ${t.pts} pt${t.shared ? ' · together' : ''}${t.person ? ' · fixed person' : ''}` }),
            ]
          ),
          el('button', { class: 'row-btn', type: 'button', 'aria-label': `Edit ${t.text}`, onclick: () => openTaskEditor(t, refresh) }, [icon('edit', 18)]),
        ])
      );
    });
  });

  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: 'Repeating tasks' }),
          el('div', { class: 'card-sub', text: `${state.tasks.filter((t) => t.active !== false).length} active · tap to edit` }),
        ]),
        el('button', { class: 'row-btn', type: 'button', 'aria-label': 'Add repeating task', onclick: () => openTaskEditor(null, refresh) }, [icon('plus', 20)]),
      ]),
      libraryBody,
    ])
  );

  // Weekly rhythm
  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: 'Weekly rhythm' }),
          el('div', { class: 'card-sub', text: 'The theme shown at the top of each day' }),
        ]),
      ]),
      el(
        'div',
        { class: 'card-body' },
        state.program.map((p) => {
          const input = el('input', { type: 'text', value: p.focus, 'aria-label': `${p.day} focus` });
          const persist = () => {
            const v = input.value;
            update((d) => {
              const row = d.program.find((x) => x.day === p.day);
              if (row) row.focus = v;
            }, { silent: true });
          };
          input.addEventListener('change', persist);
          input.addEventListener('blur', persist);
          return field(p.day, input);
        })
      ),
    ])
  );

  // Preferences
  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('div', {}, [el('div', { class: 'card-title', text: 'Preferences' })])]),
      el('div', { class: 'card-body' }, [
        switchRow('Even things out over time', 'If a week ends up lopsided, the next weeks correct it automatically.', state.settings.fairnessCarryOver, (on) => {
          update((d) => {
            d.settings.fairnessCarryOver = on;
          });
          refresh();
        }),
        switchRow('Show effort points', 'Displays the effort weighting on each task.', state.settings.showPoints, (on) => {
          update((d) => {
            d.settings.showPoints = on;
          });
          refresh();
        }),
        switchRow('Carry unfinished tasks forward', 'Unfinished tasks are highlighted when a new week starts.', state.settings.carryUnfinished, (on) => {
          update((d) => {
            d.settings.carryUnfinished = on;
          });
        }),
      ]),
    ])
  );

  // Data safety
  const storageInfo = el('div', { class: 'muted', style: { marginTop: '6px' }, text: 'Checking storage…' });
  estimateStorage().then((est) => {
    if (!est) {
      storageInfo.textContent = 'Your plan is saved in this browser.';
      return;
    }
    const used = Math.round((est.usage || 0) / 1024);
    storageInfo.textContent = `Saved in this browser (${used} KB used). Backups are the safest way to move devices.`;
  });

  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: 'Your data' }),
          el('div', { class: 'card-sub', text: 'Everything stays on this device' }),
        ]),
      ]),
      el('div', { class: 'card-body' }, [
        storageInfo,
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn', type: 'button', onclick: () => ctx.exportBackup() }, [icon('download', 18), 'Save a backup']),
          el('button', { class: 'btn', type: 'button', onclick: () => ctx.importBackup() }, [icon('upload', 18), 'Restore a backup']),
        ]),
        el('div', { class: 'btn-row' }, [
          el(
            'button',
            {
              class: 'btn danger wide',
              type: 'button',
              onclick: () =>
                confirmSheet({
                  title: 'Start completely over?',
                  message: 'Every task, tick, note and grocery item will be erased and the defaults restored. This cannot be undone.',
                  confirmLabel: 'Erase everything',
                  onConfirm: () => {
                    resetEverything();
                    refresh();
                    toast('Everything reset');
                  },
                }),
            },
            [icon('trash', 18), 'Reset everything']
          ),
        ]),
      ]),
    ])
  );

  mount(host, nodes);
}
