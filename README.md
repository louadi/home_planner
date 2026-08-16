# Home Planner

A weekly home planner for two people. It splits household tasks fairly by percentage,
knows which week it is on its own, works offline, and is built for a tablet.

Everything is plain HTML, CSS and JavaScript modules. **There is no build step** — no
npm, no bundler, no framework. You can open it, host it, or edit it directly.

---

## What it does

- **Accurate splitting.** You set a target percentage per category (cooking, laundry,
  bathroom…). Every week lands within one effort point of the closest possible split, and
  leftover fractions are carried forward so the long-run average matches your target
  almost exactly. Over a year the drift is under one point.
- **Knows the week.** Uses real ISO-8601 weeks. Open it on Sunday night or Monday morning
  and it shows the same week. It rolls over on its own and survives daylight saving.
- **Saves reliably.** Every change is written to `localStorage` *and* mirrored to
  IndexedDB, with one previous snapshot kept. If a tablet browser evicts one store, the
  app recovers from the other and repairs itself.
- **Move things freely.** Drag any task to a different day or to the other person, or use
  the task menu. One-off tasks can be added to a single week without changing the routine.
- **Calendar export.** Download a standard `.ics` for this week, the next 4, or the next
  12 and open it in Apple Calendar, Google Calendar or Outlook.
- **Installable and offline.** Add it to a Home Screen and it opens like a real app with
  no address bar, and works with no internet.
- **Tablet-first.** Every control is at least 44px. Two columns side by side in landscape,
  stacked in portrait, with a side rail on larger screens and dark mode support.

---

## Putting it online (recommended)

Hosting it means your data persists properly and it installs like a real app. Both
options below are free and take a few minutes.

### Option A — Netlify Drop (easiest, no account needed to try)

1. Go to <https://app.netlify.com/drop>.
2. Drag this whole project folder onto the page.
3. You get a URL like `https://your-name.netlify.app`. Open it on the tablet.

To update later, drag the folder again (or connect the GitHub repo for automatic deploys).

### Option B — GitHub Pages

```bash
git remote add origin https://github.com/YOUR-USERNAME/home-planner.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Source: deploy from branch `main`, folder
`/ (root)`**. Your app appears at `https://YOUR-USERNAME.github.io/home-planner/` within a
minute or two.

> A service worker requires HTTPS (or `localhost`). Netlify and GitHub Pages both give you
> HTTPS automatically, so offline mode works out of the box.

---

## Installing it on the tablet

Do this once, then always open it from the icon.

**iPad / iPhone (Safari)**
1. Open your URL in **Safari** (this does not work in Chrome on iOS).
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the new icon from then on.

**Android tablet (Chrome)**
1. Open your URL in Chrome.
2. Tap the three-dot menu, then **Install app** or **Add to Home screen**.
3. Open it from the new icon from then on.

Once installed it runs full screen, works offline, and keeps your data between sessions.

---

## Running it locally

Because it uses JavaScript modules, it needs to be served over HTTP — opening
`index.html` straight from Finder will not work.

```bash
python3 tools/serve.py
# then open http://127.0.0.1:4173/
```

Any static server works equally well (`npx serve`, `php -S localhost:4173`, etc.).

---

## Using it

| Tab | What it's for |
| --- | --- |
| **Today** | What each of you has to do right now, plus what's coming up |
| **Week** | All seven days at once; drag tasks between days and people |
| **Balance** | Set the percentage split per category and see what actually happened |
| **Shopping** | Grocery list and notes for the week |
| **Setup** | Names, the repeating task list, weekly rhythm, preferences, backups |

**Moving a task:** drag its handle (`⠿`), or tap the `⋯` button and choose an action.

**Changing the split:** Balance tab. Drag a slider or use `−` / `+`. Start from a
*heavy* preset (most of the load on one person) or *Balanced*, then adjust anything.

**Browsing weeks:** the arrows and the pill in the top bar. Tap **Jump to now** to return.

**Backups:** Setup → *Save a backup* writes a `.json` file. *Restore a backup* reads it
back, which is also how you move everything to a new device.

---

## How the splitting actually works

Each task carries an effort weight in points, so "cook dinner" (3) counts for more than
"take the bins out" (1).

1. Anything you set by hand always wins — a manual reassignment, or a task pinned to one
   person in Setup.
2. Kitchen reset always goes to whoever did **not** cook that evening.
3. For each remaining category the app solves a subset-sum problem: out of all the tasks
   it may assign, it finds the combination whose points land closest to your target. This
   is exact, not a guess.
4. Days are then evened out by swapping tasks of the *same category and same points*, so
   nobody has a brutal Tuesday — and because the swaps are like-for-like, they cannot
   disturb the category percentages.
5. Anything still off by a fraction of a point becomes a debt carried into next week.

Some targets cannot be met in a single week, and the app says so instead of pretending.
"Together" tasks are always 50/50, and one 1-point task cannot be divided 70/30 — so it
alternates across weeks until the average is right.

The plan is stable all week (same input, same result) but genuinely different next week.
Use **Shuffle who does what** in the `⋯` menu to re-deal the current week.

---

## Tests

Open <http://127.0.0.1:4173/tests/self-test.html> while the local server is running.

34 assertions cover the week engine (ISO weeks, year boundaries, DST), split accuracy,
long-run convergence over 52 weeks, the dishes rule, manual overrides, and calendar
export. They run automatically and report in the page.

---

## Project layout

```
index.html              app shell
manifest.webmanifest    PWA metadata
sw.js                   service worker (offline support)
css/
  app.css               imports the three files below
  base.css              tokens, reset, frame, tab bar, sheets, dark mode
  components.css        cards, task rows, day blocks
  forms.css             stats, sliders, inputs, buttons, print
js/
  app.js                controller: routing, week selector, backup, calendar
  state.js              schema, validation, migrations, saving
  storage.js            localStorage + IndexedDB with recovery
  week.js               ISO-8601 week engine
  data.js               default people, categories, tasks, rhythm
  allocate.js           the splitting algorithm
  ics.js                calendar export
  dom.js                element helpers, toast, bottom sheet, icons
  dragdrop.js           pointer-based drag and drop
  tasks-ui.js           task rows and task menus
  view-*.js             the five screens
tools/
  serve.py              threaded local dev server
  make_icons.py         regenerates the PNG icons
tests/
  self-test.html        the test suite
```

## Making changes

- **New repeating task:** Setup → Repeating tasks → `+`. No code needed.
- **New category:** add an entry to `CATEGORY_DEFS` in `js/data.js`.
- **Different colours or spacing:** the variables at the top of `css/base.css`.
- **After changing any file list:** bump `CACHE_VERSION` in `sw.js` so installed copies
  pick up the update.
