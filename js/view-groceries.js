// Groceries + this week's notes. The list is deliberately dumb and fast: type, tick, done.

import { el, icon, mount, toast, confirmSheet } from './dom.js';
import { state, update, ensureWeek, uid } from './state.js';

export function renderGroceries(host, ctx) {
  const { weekKey: wk, refresh } = ctx;
  const nodes = [el('h2', { class: 'section-title', text: 'Shopping & notes' })];

  const newItem = el('input', { type: 'text', placeholder: 'Add an item…', enterkeyhint: 'done', 'aria-label': 'New grocery item' });
  const addItem = () => {
    const text = newItem.value.trim();
    if (!text) return;
    update((d) => {
      d.groceries.push({ id: uid('g'), text, checked: false });
    });
    newItem.value = '';
    refresh();
    // Keep the keyboard up so several items can be added in a row.
    setTimeout(() => document.querySelector('[data-new-grocery]')?.focus(), 40);
  };
  newItem.dataset.newGrocery = '1';
  newItem.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addItem();
  });

  const list = el('ul', { class: 'list' });
  const checkedCount = state.groceries.filter((g) => g.checked).length;

  if (!state.groceries.length) {
    list.appendChild(el('li', { class: 'empty', text: 'Nothing on the list yet.' }));
  }

  state.groceries.forEach((item) => {
    const input = el('input', {
      class: 'list-input',
      type: 'text',
      value: item.text,
      placeholder: 'Item…',
      'aria-label': 'Grocery item',
    });
    // Save on blur/change rather than every keystroke, so typing is never interrupted.
    const persist = () => {
      const text = input.value;
      update((d) => {
        const g = d.groceries.find((x) => x.id === item.id);
        if (g) g.text = text;
      }, { silent: true });
    };
    input.addEventListener('change', persist);
    input.addEventListener('blur', persist);

    const row = el('li', { class: `list-row${item.checked ? ' checked' : ''}` }, [
      el(
        'button',
        {
          class: 'task-check',
          type: 'button',
          'aria-pressed': String(!!item.checked),
          'aria-label': `Mark ${item.text || 'item'} as bought`,
          onclick: () => {
            update((d) => {
              const g = d.groceries.find((x) => x.id === item.id);
              if (g) g.checked = !g.checked;
            });
            refresh();
          },
        },
        [icon('check', 19)]
      ),
      input,
      el(
        'button',
        {
          class: 'row-btn danger',
          type: 'button',
          'aria-label': `Remove ${item.text || 'item'}`,
          onclick: () => {
            update((d) => {
              d.groceries = d.groceries.filter((x) => x.id !== item.id);
            });
            refresh();
          },
        },
        [icon('close', 18)]
      ),
    ]);
    if (item.checked) row.classList.add('checked');
    list.appendChild(row);
  });

  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: 'Grocery list' }),
          el('div', { class: 'card-sub', text: `${state.groceries.length} items · ${checkedCount} in the basket` }),
        ]),
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'add-row' }, [
          newItem,
          el('button', { class: 'btn accent', type: 'button', onclick: addItem, 'aria-label': 'Add item' }, [icon('plus', 18)]),
        ]),
        list,
        checkedCount
          ? el('div', { class: 'btn-row' }, [
              el(
                'button',
                {
                  class: 'btn',
                  type: 'button',
                  onclick: () => {
                    const removed = state.groceries.filter((g) => g.checked);
                    update((d) => {
                      d.groceries = d.groceries.filter((g) => !g.checked);
                    });
                    refresh();
                    toast(`${removed.length} item${removed.length === 1 ? '' : 's'} cleared`, {
                      label: 'Undo',
                      onClick: () => {
                        update((d) => {
                          d.groceries.push(...removed);
                        });
                        refresh();
                      },
                    });
                  },
                },
                [icon('trash', 18), 'Clear bought items']
              ),
            ])
          : null,
      ]),
    ])
  );

  // Week notes
  const week = state.weeks[wk] || {};
  const notes = el('textarea', {
    placeholder: 'Anything to remember this week — appointments, swaps, reminders…',
    value: week.notes || '',
    'aria-label': "This week's notes",
  });
  const saveNotes = () => {
    const text = notes.value;
    ensureWeek(wk);
    update((d) => {
      d.weeks[wk].notes = text;
    }, { silent: true });
  };
  notes.addEventListener('change', saveNotes);
  notes.addEventListener('blur', saveNotes);

  nodes.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('div', { class: 'card-title', text: "This week's notes" }),
          el('div', { class: 'card-sub', text: 'Saved automatically, kept separately for each week' }),
        ]),
      ]),
      el('div', { class: 'card-body' }, [notes]),
    ])
  );

  mount(host, nodes);
}
