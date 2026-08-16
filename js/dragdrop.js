// Drag and drop for task rows, built on Pointer Events so one code path covers touch,
// pen and mouse. A drag only begins after the finger moves ~8px, which keeps taps and
// vertical page scrolling working normally on a tablet.

const LONG_PRESS_MS = 220;
const MOVE_THRESHOLD = 8;

let active = null;

function cleanup() {
  if (!active) return;
  const { source, ghost, timer } = active;
  clearTimeout(timer);
  ghost?.remove();
  source?.classList.remove('dragging');
  document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  document.body.style.removeProperty('user-select');
  active = null;
}

function makeGhost(source, x, y) {
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  ghost.classList.add('task-ghost');
  ghost.querySelectorAll('.drag-handle, .task-more').forEach((n) => n.remove());
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${x - rect.width / 2}px`;
  ghost.style.top = `${y - 24}px`;
  document.body.appendChild(ghost);
  return ghost;
}

function zoneUnder(x, y) {
  const ghost = active?.ghost;
  if (ghost) ghost.style.visibility = 'hidden';
  const node = document.elementFromPoint(x, y);
  if (ghost) ghost.style.visibility = '';
  return node?.closest('[data-drop-zone]') || null;
}

function begin(x, y) {
  if (!active || active.started) return;
  active.started = true;
  active.source.classList.add('dragging');
  active.ghost = makeGhost(active.source, x, y);
  document.body.style.userSelect = 'none';
  if (navigator.vibrate) {
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }
}

function onPointerMove(e) {
  if (!active) return;
  const dx = e.clientX - active.startX;
  const dy = e.clientY - active.startY;

  if (!active.started) {
    if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
    clearTimeout(active.timer);
    begin(e.clientX, e.clientY);
  }

  e.preventDefault();
  const { ghost } = active;
  if (ghost) {
    ghost.style.left = `${e.clientX - ghost.offsetWidth / 2}px`;
    ghost.style.top = `${e.clientY - 24}px`;
  }

  const zone = zoneUnder(e.clientX, e.clientY);
  if (zone !== active.zone) {
    active.zone?.classList.remove('drop-target');
    zone?.classList.add('drop-target');
    active.zone = zone;
  }

  // Auto-scroll when dragging near the top or bottom edge.
  const margin = 90;
  if (e.clientY < margin) window.scrollBy({ top: -14, behavior: 'instant' });
  else if (e.clientY > window.innerHeight - margin) window.scrollBy({ top: 14, behavior: 'instant' });
}

function onPointerUp() {
  if (!active) return;
  const { started, zone, taskId, onDrop } = active;
  cleanup();
  if (!started || !zone) return;
  const { day, person } = zone.dataset;
  onDrop?.({ taskId, day: day || null, person: person || null });
}

/**
 * Make task rows inside `root` draggable.
 * @param {HTMLElement} root container to scan
 * @param {(info:{taskId:string, day:string|null, person:string|null}) => void} onDrop
 */
export function enableDragAndDrop(root, onDrop) {
  root.querySelectorAll('[data-task-id]').forEach((row) => {
    const handle = row.querySelector('.drag-handle') || row;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.task-check, .task-more')) return;
      cleanup();
      active = {
        source: row,
        taskId: row.dataset.taskId,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        zone: null,
        ghost: null,
        onDrop,
        // Holding still also starts a drag, which feels natural with a finger.
        timer: setTimeout(() => begin(e.clientX, e.clientY), LONG_PRESS_MS),
      };
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal */
      }
    });
  });
}

document.addEventListener('pointermove', onPointerMove, { passive: false });
document.addEventListener('pointerup', onPointerUp);
document.addEventListener('pointercancel', cleanup);
window.addEventListener('blur', cleanup);
