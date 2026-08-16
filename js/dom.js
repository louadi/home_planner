// Tiny DOM helpers plus the shared UI primitives: toast, bottom sheet, confirm dialog.
// Nodes are built as real elements rather than HTML strings, so user-entered text can
// never break the markup and focus is preserved where it matters.

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== 'list' && typeof value !== 'object') {
      try {
        node[key] = value;
      } catch {
        node.setAttribute(key, value);
      }
    } else {
      node.setAttribute(key, value);
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, children) {
  clear(node);
  append(node, children);
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Inline SVG icon set (stroke-based so it inherits currentColor). */
const ICON_PATHS = {
  check: 'M4 12l5 5L20 6',
  plus: 'M12 5v14M5 12h14',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  today: 'M7 3v3m10-3v3M4 9h16M5 6h14v14H5z',
  calendar: 'M7 3v3m10-3v3M4 9h16M5 6h14v14H5z',
  scale: 'M12 4v16M6 8l-3 6h6zM18 8l-3 6h6zM6 8h12',
  cart: 'M4 5h2l2 10h10M9 19a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2zM8 9h12l-1.5 6H9.5',
  note: 'M6 3h9l4 4v14H6zM15 3v4h4',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM4 12l-1.5-1 1-3 1.8.3 1.6-1.6L6.6 4l3-1L11 4.5h2L14.4 3l3 1-.3 1.8 1.6 1.6 1.8-.3 1 3-1.5 1v2l1.5 1-1 3-1.8-.3-1.6 1.6.3 1.8-3 1L13 19.5h-2L9.6 21l-3-1 .3-1.8-1.6-1.6-1.8.3-1-3L4 12z',
  swap: 'M7 8h11l-3-3m3 11H7l3 3',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9L3 12l3 3M18 9l3 3-3 3',
  skip: 'M5 5l9 7-9 7zM19 5v14',
  undo: 'M9 10H4V5m1.5 4.5A8 8 0 1112 20',
  download: 'M12 4v10m0 0l-4-4m4 4l4-4M4 20h16',
  upload: 'M12 20V10m0 0l-4 4m4-4l4 4M4 4h16',
  dots: 'M12 6h.01M12 12h.01M12 18h.01',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zm7 0a3 3 0 100-6 3 3 0 000 6zM3 20c0-3 2.7-5 6-5s6 2 6 5m2-5c2.5.4 4 2.3 4 5',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.dots);
  svg.appendChild(path);
  return svg;
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastTimer = null;
export function toast(message, action) {
  const host = $('#toast-host');
  if (!host) return;
  clear(host);
  const node = el('div', { class: 'toast' }, [
    el('span', { text: message }),
    action &&
      el('button', {
        class: 'toast-action',
        type: 'button',
        text: action.label,
        onclick: () => {
          hideToast();
          action.onClick();
        },
      }),
  ]);
  host.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2600);
}

function hideToast() {
  const host = $('#toast-host');
  const node = host?.firstChild;
  if (!node) return;
  node.classList.remove('show');
  setTimeout(() => node.remove(), 260);
}

// ── Bottom sheet ─────────────────────────────────────────────────────────────
let openSheetEl = null;

export function closeSheet() {
  if (!openSheetEl) return;
  const overlay = openSheetEl;
  openSheetEl = null;
  overlay.classList.remove('open');
  setTimeout(() => overlay.remove(), 220);
  document.body.classList.remove('sheet-open');
}

/**
 * Bottom sheet. Pass either `options` (a list of big tap targets) or `content` nodes.
 * @returns {HTMLElement} the sheet body, so callers can focus fields inside it.
 */
export function openSheet({ title, subtitle, options = [], content = null, destructive = null }) {
  closeSheet();
  const body = el('div', { class: 'sheet-body' });

  const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, [
    el('div', { class: 'sheet-grip' }),
    el('header', { class: 'sheet-head' }, [
      el('div', {}, [
        el('div', { class: 'sheet-title', text: title || '' }),
        subtitle && el('div', { class: 'sheet-sub', text: subtitle }),
      ]),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: closeSheet }, [icon('close', 22)]),
    ]),
    body,
  ]);

  if (content) append(body, content);

  options
    .filter(Boolean)
    .forEach((opt) => {
      body.appendChild(
        el(
          'button',
          {
            class: `sheet-option${opt.danger ? ' danger' : ''}${opt.active ? ' active' : ''}`,
            type: 'button',
            onclick: () => {
              if (opt.keepOpen !== true) closeSheet();
              opt.onClick?.();
            },
          },
          [
            opt.icon ? el('span', { class: 'sheet-option-icon' }, [icon(opt.icon, 20)]) : null,
            el('span', { class: 'sheet-option-label' }, [
              el('span', { text: opt.label }),
              opt.hint ? el('small', { text: opt.hint }) : null,
            ]),
            opt.active ? icon('check', 18) : null,
          ]
        )
      );
    });

  if (destructive) {
    body.appendChild(
      el('button', {
        class: 'sheet-option danger',
        type: 'button',
        text: destructive.label,
        onclick: () => {
          closeSheet();
          destructive.onClick();
        },
      })
    );
  }

  const overlay = el('div', { class: 'sheet-overlay' }, [sheet]);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });
  document.body.appendChild(overlay);
  document.body.classList.add('sheet-open');
  openSheetEl = overlay;
  requestAnimationFrame(() => overlay.classList.add('open'));
  return body;
}

export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm }) {
  openSheet({
    title,
    subtitle: message,
    options: [
      { label: confirmLabel, icon: danger ? 'trash' : 'check', danger, onClick: onConfirm },
      { label: 'Cancel', onClick: () => {} },
    ],
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

/** Labelled field wrapper used by the editor sheets. */
export function field(label, control, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('small', { class: 'field-hint', text: hint }) : null,
  ]);
}

export function segmented(options, value, onChange) {
  const wrap = el('div', { class: 'segmented', role: 'group' });
  options.forEach((opt) => {
    wrap.appendChild(
      el('button', {
        class: `segment${opt.value === value ? ' active' : ''}`,
        type: 'button',
        text: opt.label,
        onclick: () => onChange(opt.value),
      })
    );
  });
  return wrap;
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
