# FinTrack — design notes

What was built, the decisions behind it, and where the spec was interpreted. The original brief: an offline-first, privacy-first
personal finance PWA in ₹ with React, Tailwind, a chart library and Lucide icons, covering dashboard, transactions, accounts,
budgets, goals, categories, cash flow, loans/EMI, reports, rule-based insights, dark mode and CSV export.

## Architecture

```
pages/  ──uses──▶  components/  ──uses──▶  lib/ (pure functions, unit tested)
   │                                          ▲
   └──── store/ (Zustand) ────────────────────┘
            │
            └── persist ──▶ IndexedDB (idb-keyval), localStorage fallback
```

- **`src/lib`** holds every calculation as pure functions with Vitest tests: formatting (`₹12,34,567`, `₹1.5L`), dates, balances,
  breakdowns, budgets, loans/EMI, CSV, backup validation, chart scales, sample data and the insights engine. Screens never do
  money maths inline beyond simple sums.
- **`src/store/finance.ts`** is a single Zustand store with the six collections and their actions (add/update/delete, budget copy,
  EMI payment, goal contributions, undo, start fresh). It is persisted as one JSON document.
- **Pages** are lazy-loaded routes; the Dashboard is in the main chunk because it's the first screen.

## Data model

As specified, with three small, deliberate extensions:

| Entity      | Fields                                                             | Notes                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transaction | `id, type, amount, date, category, account, note` + `toAccount?`   | `type` also allows **`transfer`** (with `toAccount`) so ATM withdrawals and UPI top-ups keep account balances correct without counting as income/expense. `amount` is always positive. `date` is a local `YYYY-MM-DD`. |
| Account     | `id, name, type, balance`                                          | `type` is `cash` / `bank` / `upi`. `balance` is the **opening** balance; the current balance is derived from transactions.                                                                                             |
| Category    | `id, name, icon, color, type`                                      | `icon` is a key into a curated Lucide set; `color` is a **palette key** (`blue`, `orange` …), resolved to a CSS variable so it adapts to dark mode.                                                                    |
| Budget      | `id, category, month, limit`                                       | One per category per month (`YYYY-MM`).                                                                                                                                                                                |
| Goal        | `id, name, target, current, deadline`                              |                                                                                                                                                                                                                        |
| Loan        | `id, name, principal, emi, interestRate, remainingTenure, nextDue` | Outstanding principal = present value of the remaining EMIs, so progress needs no extra fields. "Mark EMI paid" decrements the tenure, moves `nextDue` a month and can record the EMI as an expense.                   |

## Storage, offline and privacy

- Zustand `persist` writes to IndexedDB through a small adapter that falls back to localStorage if IndexedDB is unavailable.
  The UI waits for hydration before rendering so saved data never flashes behind defaults.
- The app asks the browser for persistent storage after the first transaction (silent in Chromium).
- **Backup/restore** is a versioned JSON file. Restore validates every record and copies known fields only; an invalid file is
  rejected whole with a message rather than half-imported.
- CSV export is RFC 4180 with a UTF-8 BOM (Excel shows ₹ correctly) and neutralises formula-like text (`=HYPERLINK(…)`).
- `vite-plugin-pwa` (Workbox `generateSW`) precaches the whole app — HTML, JS, CSS, icons and the Latin subsets of Inter (which
  include ₹). Updates use a prompt ("A new version is ready · Update") rather than reloading mid-entry.
- `base: './'` plus a hash router means the same `dist/` works on any static host or sub-folder (verified under `/fintrack/`).

## Insights engine (`src/lib/insights.ts`)

- **Fair comparisons:** month-to-date is compared with the same days of last month (clamped for shorter months).
- **Projection:** month-end spending = spend so far × (last month's total ÷ last month's spend by this date) — this respects
  front-loaded bills. If last month had spent under 15% of its total by this date, a straight-line estimate is used instead.
- **Rules** (each yields at most a couple of insights, sorted negative → warning → positive → neutral):
  spending trend; category increases/drops (≥15% and ≥₹300); spikes (≥40% and ≥₹1,000) as alerts, which absorb a big purchase in
  that category; unusually large single expenses (≥3× the category median **and** ≥1.25× its largest recent expense, ≥₹2,000);
  top category share; savings rate vs the 20% guideline; on-track savings; positive cash-flow streak or last month's shortfall;
  emergency runway (balance ÷ average monthly spend); budgets kept, exceeded and running ahead of the month; goal pace; EMIs due
  within 7 days or overdue; EMI burden above 40% of income; weekend vs weekday daily spending.
- **Cash-flow health:** healthy (≥20% saved, no negative month), fair, or at risk (negative overall or ≥2 negative months) over the
  last three months.

## Visual design and accessibility

- Semantic colour tokens (`--canvas`, `--surface`, `--ink`, `--income`, `--expense` …) defined once for light and dark; Tailwind
  utilities read them via `@theme inline`. Primary blue, green for income, red for expenses as requested.
- Chart and category colours use a validated 8-hue categorical palette, checked with a colour-vision-deficiency validator against
  the app's own surfaces in both modes. Red/green income-vs-expense can't fully clear CVD separation, so every place that uses it
  also carries a `+`/`−` sign, an arrow icon or a labelled legend.
- Charts follow one set of rules: solid hairline grid, round "nice" ticks, ≤24px bars with rounded data ends, 2px lines, value-first
  tooltips, a legend for 2+ series, pies only with 2+ slices (≤6, the rest folded into "Other") and a list/table beside every chart.
- Text tokens meet WCAG AA (4.5:1) on every background they sit on; an axe scan of all screens in both themes reports no serious
  or critical issues. Native `<dialog>` gives focus trapping and Escape; motion respects `prefers-reduced-motion`.
- Mobile-first: bottom navigation with a raised add button; sidebar from `lg` up. Checked for horizontal overflow at 360px.

## Verification

- `npm test` — unit tests for all `lib/` modules and the store actions.
- Manual end-to-end runs with Playwright (not committed, to keep the project light): add/edit/delete/undo, transfers and balances,
  persistence across reloads, budgets, goals, loans + EMI payment, custom categories, accounts, theme persistence, CSV export,
  backup → erase → restore, invalid backup rejection, full offline use with the service worker, and sub-folder hosting.

## Possible next steps

Recurring transactions and reminders, multiple tabs editing at once (BroadcastChannel sync), optional encrypted cloud sync,
bank SMS/statement import, budget rollover, and per-goal transactions.
