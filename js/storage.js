// Persistence layer.
//
// Why two stores: on tablets (especially iPadOS Safari) localStorage can be evicted
// after long periods of inactivity, and a bad write can leave a truncated value.
// So every save goes to localStorage *and* is mirrored into IndexedDB, plus we keep
// one previous good snapshot. On load we take whichever copy is newest and parseable.

const LS_KEY = 'homePlanner.state.v3';
const LS_BACKUP_KEY = 'homePlanner.state.v3.previous';
const LEGACY_KEYS = ['home_planner_v2', 'home_planner_v1'];

const IDB_NAME = 'home-planner';
const IDB_STORE = 'state';
const IDB_KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no-idb'));
    let req;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch (err) {
      return reject(err);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
  });
}

async function idbRead() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbWrite(value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

function lsRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Ask the browser not to evict our data. Harmless if unsupported. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function estimateStorage() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch {
    /* ignore */
  }
  return null;
}

/** Anything the old single-file version left behind, so nothing is lost on upgrade. */
export function readLegacyState() {
  for (const key of LEGACY_KEYS) {
    const found = lsRead(key);
    if (found) return { key, data: found };
  }
  return null;
}

/**
 * Load the newest usable snapshot across all stores.
 * Returns { state, source } or null when there is nothing saved yet.
 */
export async function loadState() {
  const candidates = [];
  const primary = lsRead(LS_KEY);
  if (primary) candidates.push({ state: primary, source: 'local' });
  const backup = lsRead(LS_BACKUP_KEY);
  if (backup) candidates.push({ state: backup, source: 'local-backup' });
  const mirrored = await idbRead();
  if (mirrored && typeof mirrored === 'object') candidates.push({ state: mirrored, source: 'indexeddb' });

  if (!candidates.length) return null;
  candidates.sort((a, b) => (Number(b.state.updatedAt) || 0) - (Number(a.state.updatedAt) || 0));
  return candidates[0];
}

let lastGoodSerialized = null;

/**
 * Persist state everywhere. Synchronous part (localStorage) happens first so it
 * survives an immediate tab kill; the IndexedDB mirror follows asynchronously.
 */
export function saveState(state) {
  const serialized = JSON.stringify(state);
  let ok = false;
  try {
    if (lastGoodSerialized) localStorage.setItem(LS_BACKUP_KEY, lastGoodSerialized);
    localStorage.setItem(LS_KEY, serialized);
    lastGoodSerialized = serialized;
    ok = true;
  } catch {
    ok = false;
  }
  idbWrite(state);
  return ok;
}

export function clearAllStorage() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_BACKUP_KEY);
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  lastGoodSerialized = null;
  idbWrite(null);
}

export const STORAGE_KEYS = { LS_KEY, LS_BACKUP_KEY, LEGACY_KEYS };
