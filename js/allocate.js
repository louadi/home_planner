// Task allocation.
//
// The old version walked tasks one at a time and gave each to whoever looked cheapest
// at that moment. Greedy passes like that routinely miss a target split by 15-25%.
//
// This version is exact: for each category it solves a subset-sum problem to find the
// combination of tasks whose points land as close to the target percentage as the
// points themselves allow, then fixes day fairness with swaps that cannot change the
// category totals. Any residual rounding error is carried into next week's target, so
// the split is accurate per week and converges to exact over time.

import { DAY_NAMES, seedFromWeekKey, shiftWeekKey, compareWeekKeys, parseWeekKey } from './week.js';
import { CATEGORY_DEFS } from './data.js';

export const BOTH = 'both';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick the subset of `items` whose total points is closest to `target`.
 * Exact dynamic programming over reachable sums; `items` order is pre-shuffled per
 * week so that among equally accurate answers, different weeks pick different people.
 * @returns {Set<number>} indices of the chosen items
 */
function closestSubset(items, target) {
  const total = items.reduce((s, it) => s + it.pts, 0);
  if (total === 0) return new Set();
  const want = Math.max(0, Math.min(total, target));
  // reach[sum] = index of the item that completed this sum, plus the previous sum
  const reach = new Array(total + 1).fill(null);
  reach[0] = { item: -1, prev: -1 };
  for (let i = 0; i < items.length; i++) {
    const p = items[i].pts;
    for (let s = total - p; s >= 0; s--) {
      if (reach[s] && !reach[s + p]) reach[s + p] = { item: i, prev: s };
    }
  }
  let best = 0;
  let bestDist = Infinity;
  for (let s = 0; s <= total; s++) {
    if (!reach[s]) continue;
    const d = Math.abs(s - want);
    if (d < bestDist - 1e-9) {
      bestDist = d;
      best = s;
    }
  }
  const chosen = new Set();
  let cur = best;
  while (cur > 0 && reach[cur] && reach[cur].item >= 0) {
    chosen.add(reach[cur].item);
    cur = reach[cur].prev;
  }
  return chosen;
}

/** Every task instance that applies to a week, with effective day and owner intent. */
export function weekTaskInstances(state, key) {
  const week = state.weeks[key] || {};
  const skipped = week.skipped || {};
  const dayOf = week.dayOf || {};
  const ownerOverride = week.owner || {};
  const out = [];

  const push = (t, isExtra) => {
    if (skipped[t.id]) return;
    const shared = !!t.shared;
    const override = ownerOverride[t.id];
    out.push({
      id: t.id,
      text: t.text,
      cat: t.cat,
      pts: t.pts,
      shared,
      extra: !!isExtra,
      homeDay: t.day,
      day: dayOf[t.id] || t.day,
      moved: !!dayOf[t.id] && dayOf[t.id] !== t.day,
      intent: override || (shared ? BOTH : t.person || null),
      manual: !!override,
    });
  };

  (state.tasks || []).forEach((t) => {
    if (t.active !== false) push(t, false);
  });
  (week.extras || []).forEach((t) => push(t, true));
  return out;
}

export function allocate(state, key, opts = {}) {
  const people = state.people;
  const A = people[0].id;
  const B = people[1].id;
  const week = state.weeks[key] || {};
  const rand = mulberry32((seedFromWeekKey(key) ^ ((week.roll || 0) * 0x9e3779b9)) >>> 0);
  const carry = opts.carry || {}; // per-category point debt owed to A from earlier weeks

  const instances = weekTaskInstances(state, key);
  const days = {};
  DAY_NAMES.forEach((d) => {
    days[d] = { day: d, items: [], ptsA: 0, ptsB: 0, cook: null };
  });

  const perCat = {};
  Object.keys(CATEGORY_DEFS).forEach((c) => {
    perCat[c] = {
      total: 0, // all points in the category this week
      a: 0,
      b: 0,
      fixedA: 0, // points A holds from shared / pinned / manually moved tasks
      autoA: 0, // points A holds from tasks the algorithm was free to place
      assignable: 0, // points the algorithm was free to place at all
      target: state.shares[c] ?? 50,
      auto: !!CATEGORY_DEFS[c].auto,
    };
  });
  instances.forEach((t) => {
    if (perCat[t.cat]) perCat[t.cat].total += t.pts;
  });

  const totals = { a: 0, b: 0 };
  const assigned = [];

  const place = (item, owner, auto) => {
    const entry = { ...item, owner, auto: !!auto };
    const ds = days[item.day];
    ds.items.push(entry);
    assigned.push(entry);
    const half = item.pts / 2;
    const c = perCat[item.cat];
    if (owner === BOTH) {
      totals.a += half;
      totals.b += half;
      ds.ptsA += half;
      ds.ptsB += half;
      if (c) {
        c.a += half;
        c.b += half;
        c.fixedA += half;
      }
    } else if (owner === A) {
      totals.a += item.pts;
      ds.ptsA += item.pts;
      if (c) {
        c.a += item.pts;
        if (auto) c.autoA += item.pts;
        else c.fixedA += item.pts;
      }
    } else {
      totals.b += item.pts;
      ds.ptsB += item.pts;
      if (c) c.b += item.pts;
    }
    if (auto && owner !== BOTH && c) c.assignable += item.pts;
    if (item.cat === 'cooking' && owner !== BOTH) ds.cook = owner;
    return entry;
  };

  // ── Step 1: explicit owners first (manual override for this week, pin, or shared),
  // and count them toward the category targets so the rest compensates.
  const auto = [];
  instances.forEach((item) => {
    if (item.intent === BOTH) place(item, BOTH, false);
    else if (item.intent === A || item.intent === B) place(item, item.intent, false);
    else auto.push(item);
  });

  /**
   * Points A should receive from the tasks we are free to assign in this category.
   *
   * The share is expressed over the whole category, but shared and manually-pinned
   * tasks are already fixed, so their contribution is subtracted. Aiming the target at
   * the assignable pool is what makes the result accurate — otherwise a category whose
   * points are mostly "together" tasks can never approach a lopsided target.
   *
   * `carry` is the running point debt from earlier weeks, clamped so that catching up
   * can never push a single week further than fully one-sided.
   */
  const targetForA = (cat, autoItems) => {
    const c = perCat[cat];
    const pool = autoItems.reduce((s, it) => s + it.pts, 0);
    const idealA = (c.total * (c.target ?? 50)) / 100;
    const want = idealA - c.fixedA;
    const debt = Math.max(-pool, Math.min(pool, carry[cat] || 0));
    return Math.max(0, Math.min(pool, want + debt));
  };

  const assignCategoryExactly = (cat, autoItems) => {
    if (!autoItems.length) return;
    const ordered = shuffle(autoItems, rand);
    const chosen = closestSubset(ordered, targetForA(cat, autoItems));
    ordered.forEach((item, i) => place(item, chosen.has(i) ? A : B, true));
  };

  // ── Step 2: cooking is solved first because the kitchen reset depends on it.
  const cookAuto = auto.filter((t) => t.cat === 'cooking');
  assignCategoryExactly('cooking', cookAuto);

  // ── Step 3: kitchen reset always goes to whoever did not cook that day.
  auto
    .filter((t) => t.cat === 'kitchen')
    .forEach((item) => {
      const cook = days[item.day].cook;
      if (cook === A) place(item, B, true);
      else if (cook === B) place(item, A, true);
      else place(item, days[item.day].ptsA <= days[item.day].ptsB ? A : B, true);
    });

  // ── Step 4: every other category, each solved to its own target.
  const others = auto.filter((t) => t.cat !== 'cooking' && t.cat !== 'kitchen');
  const byCat = new Map();
  others.forEach((t) => {
    if (!byCat.has(t.cat)) byCat.set(t.cat, []);
    byCat.get(t.cat).push(t);
  });
  for (const [cat, items] of byCat) assignCategoryExactly(cat, items);

  balanceDays(days, assigned, A, B, rand);

  const catOrder = Object.keys(CATEGORY_DEFS);
  DAY_NAMES.forEach((d) => {
    days[d].items.sort((x, y) => {
      if (x.shared !== y.shared) return x.shared ? 1 : -1;
      const c = catOrder.indexOf(x.cat) - catOrder.indexOf(y.cat);
      return c !== 0 ? c : y.pts - x.pts;
    });
  });

  const done = week.done || {};
  const doneCount = instances.filter((t) => done[t.id]).length;
  const totalPts = totals.a + totals.b;

  // Report what was actually achievable, so the Balance screen can explain itself
  // instead of showing a target that the task mix makes impossible.
  Object.values(perCat).forEach((c) => {
    c.actual = c.total ? Math.round((c.a / c.total) * 100) : 50;
    const lo = c.fixedA;
    const hi = c.fixedA + c.assignable;
    const ideal = (c.total * (c.target ?? 50)) / 100;
    c.reachable = c.total ? Math.round((Math.max(lo, Math.min(hi, ideal)) / c.total) * 100) : 50;
    c.locked = c.total > 0 && c.assignable === 0;
    c.offBy = Math.abs(c.a - ideal);
    c.step = c.total ? 100 / c.total : 0;
  });

  return {
    key,
    days,
    perCat,
    totals,
    people: { a: people[0], b: people[1] },
    pctA: totalPts ? Math.round((totals.a / totalPts) * 100) : 50,
    counts: { done: doneCount, total: instances.length },
    instances,
  };
}

/**
 * Even out individual days by swapping pairs of auto-assigned tasks that have the same
 * category and the same points. Such a swap leaves every category split untouched, so
 * accuracy is preserved while nobody gets a brutal day next to an empty one.
 */
function balanceDays(days, assigned, A, B, rand) {
  const swappable = assigned.filter((it) => it.auto && it.owner !== BOTH && it.cat !== 'kitchen');
  const dayImbalance = (d) => days[d].ptsA - days[d].ptsB;

  const applySwap = (x, y) => {
    const dx = days[x.day];
    const dy = days[y.day];
    const px = x.owner;
    const py = y.owner;
    if (px === A) {
      dx.ptsA -= x.pts;
      dx.ptsB += x.pts;
    } else {
      dx.ptsB -= x.pts;
      dx.ptsA += x.pts;
    }
    if (py === A) {
      dy.ptsA -= y.pts;
      dy.ptsB += y.pts;
    } else {
      dy.ptsB -= y.pts;
      dy.ptsA += y.pts;
    }
    x.owner = py;
    y.owner = px;
    if (x.cat === 'cooking') dx.cook = x.owner;
    if (y.cat === 'cooking') dy.cook = y.owner;
  };

  const cost = () => DAY_NAMES.reduce((s, d) => s + Math.abs(dayImbalance(d)), 0);

  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    const pool = shuffle(swappable, rand);
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const x = pool[i];
        const y = pool[j];
        if (x.owner === y.owner) continue;
        if (x.cat !== y.cat || x.pts !== y.pts) continue;
        if (x.day === y.day) continue;
        const before = cost();
        applySwap(x, y);
        if (cost() < before) improved = true;
        else applySwap(x, y);
      }
    }
    if (!improved) break;
  }

  // Kitchen follows cooking, so re-point it after any cooking swaps.
  assigned
    .filter((it) => it.auto && it.cat === 'kitchen')
    .forEach((item) => {
      const ds = days[item.day];
      const want = ds.cook === A ? B : ds.cook === B ? A : item.owner;
      if (want !== item.owner) {
        if (item.owner === A) {
          ds.ptsA -= item.pts;
          ds.ptsB += item.pts;
        } else {
          ds.ptsB -= item.pts;
          ds.ptsA += item.pts;
        }
        item.owner = want;
      }
    });
}

/**
 * Fairness ledger.
 *
 * Small categories cannot be split accurately in a single week — one 1-point admin job
 * cannot be 70/30. So we track the running shortfall in points and feed it into the next
 * week's target: if A was owed 0.7 points this week, next week aims 0.7 points higher.
 *
 * The debt is deliberately NOT decayed. That fraction of a point *is* the information
 * needed to converge: a 70% target on a single 1-point task settles into a 7-weeks-in-10
 * rhythm only if the remainder is carried in full. Decaying it throws the remainder away
 * and the average collapses back toward 50%.
 *
 * The chain is built strictly forward from the earliest recorded week, because week N's
 * debt depends on how week N-1 actually resolved. An earlier version replayed only a
 * sliding 12-week window starting from a zero ledger, which silently discarded older
 * history and made the long-run average drift instead of converge.
 */
const LEDGER_CAP = 4; // points; keeps a target change from haunting the plan forever

/**
 * Cheap change signature. The ledger replays all recorded weeks, so results are cached —
 * but the cache must notice new weeks, edited targets and per-week overrides, not just
 * the updatedAt timestamp (tests and some code paths mutate state directly).
 */
function stateStamp(state) {
  let overrides = 0;
  for (const w of Object.values(state.weeks || {})) {
    overrides += Object.keys(w.owner || {}).length + Object.keys(w.dayOf || {}).length + Object.keys(w.skipped || {}).length + (w.extras?.length || 0) + (w.roll || 0);
  }
  return [
    state.updatedAt || 0,
    Object.keys(state.weeks || {}).length,
    overrides,
    (state.tasks || []).length,
    state.settings?.fairnessCarryOver ? 1 : 0,
    Object.values(state.shares || {}).join(','),
    state.people?.map((p) => p.id).join(','),
  ].join('|');
}

let ledgerCache = { stamp: null, chain: null };

/** ledgerBefore[weekKey] = accumulated point debt owed to person A entering that week. */
function buildLedgerChain(state) {
  const keys = Object.keys(state.weeks).filter(parseWeekKey).sort(compareWeekKeys);
  const before = new Map();
  const ledger = {};
  for (const k of keys) {
    before.set(k, { ...ledger });
    const alloc = allocate(state, k, { carry: ledger });
    for (const [cat, c] of Object.entries(alloc.perCat)) {
      if (!c.total || c.auto) continue;
      const ideal = (c.total * (c.target ?? 50)) / 100;
      // Only chase debt that was actually achievable; ignore what shared tasks locked away.
      const achievable = Math.max(c.fixedA, Math.min(c.fixedA + c.assignable, ideal));
      const next = (ledger[cat] || 0) + (achievable - c.a);
      ledger[cat] = Math.max(-LEDGER_CAP, Math.min(LEDGER_CAP, next));
    }
  }
  return { before, after: ledger, lastKey: keys[keys.length - 1] || null };
}

function carryFor(state, key) {
  const stamp = stateStamp(state);
  if (ledgerCache.stamp !== stamp || !ledgerCache.chain) {
    ledgerCache = { stamp, chain: buildLedgerChain(state) };
  }
  const chain = ledgerCache.chain;
  if (chain.before.has(key)) return chain.before.get(key);
  // A week we have not stored yet (e.g. previewing next week) sits after all recorded
  // history, so it inherits the final debt.
  if (chain.lastKey && compareWeekKeys(key, chain.lastKey) > 0) return chain.after;
  return {};
}

/** Cache: the ledger replays recorded history, and views re-render on every tap. */
let allocCache = { stamp: null, map: new Map() };

export function allocateWeek(state, key) {
  const stamp = stateStamp(state);
  if (allocCache.stamp !== stamp) allocCache = { stamp, map: new Map() };
  const hit = allocCache.map.get(key);
  if (hit) return hit;
  const result = state.settings?.fairnessCarryOver
    ? allocate(state, key, { carry: carryFor(state, key) })
    : allocate(state, key);
  allocCache.map.set(key, result);
  return result;
}

/** Points actually completed per person, for the fairness readout. */
export function completedPoints(state, key) {
  const alloc = allocateWeek(state, key);
  const done = (state.weeks[key] || {}).done || {};
  const out = { a: 0, b: 0, doneA: 0, doneB: 0 };
  DAY_NAMES.forEach((d) => {
    alloc.days[d].items.forEach((item) => {
      if (!done[item.id]) return;
      if (item.owner === BOTH) {
        out.a += item.pts / 2;
        out.b += item.pts / 2;
        out.doneA += 1;
        out.doneB += 1;
      } else if (item.owner === alloc.people.a.id) {
        out.a += item.pts;
        out.doneA += 1;
      } else {
        out.b += item.pts;
        out.doneB += 1;
      }
    });
  });
  return out;
}
