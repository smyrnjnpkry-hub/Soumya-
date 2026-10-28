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

## Statement import (`src/lib/statement`)

A bank's PDF statement becomes transactions in five pure, tested steps; the screen (`pages/ImportStatement.tsx`) only
wires them together.

1. **Text with positions** (`pdf.ts`). pdf.js reads every page's text items with their x/y and width — in the browser,
   nothing uploaded. It's the legacy build (older iOS Safari can't run the modern one), loaded only on the import screen
   and precached with its worker so import also works offline. Password-protected PDFs raise a typed error and the screen
   asks for the password; the buffer is copied for each attempt because pdf.js takes ownership of it.
2. **Rows** (`parse.ts`). Items are de-duplicated (some PDFs draw text twice), grouped into lines, and the header row found
   by its headings (Date, Narration/Description/Particulars, Chq/Ref, Value Dt, Withdrawal/Debit, Deposit/Credit, Balance;
   a single Amount column with Dr/Cr marks also works). Each piece of a line goes to the column whose left edge, right edge
   or centre lines up best — amounts are right-aligned, narrations start well left of their centred heading. A date in the
   date column starts a row; text-only lines under it continue its narration, across page breaks too. HDFC prints the
   header once, so later pages resume after the repeated account block (the line just above the header on page 1).
   Customer details, footers and the summary are never read as rows.
3. **Narrations re-joined.** HDFC stores narrations in 40-character pieces cut anywhere, prints each piece on its own line
   (indented a space when the piece starts with one) and wraps a piece too wide for the column at a space onto a line that
   hangs 4pt further left. The joiner follows the same model: hanging lines get their space back, full pieces are glued,
   and a 39-character piece (where the PDF dropped a trailing space) is glued only when the cut is inside a UPI ID, IFSC
   or reference number. Other banks' ordinary word-wrapped lines are joined with spaces.
4. **Checked.** The bank's summary block (opening/closing balance, debit/credit counts and totals) is read and compared
   with the rows, and every row's balance must follow from the previous one. The screen shows "Matches the bank's
   totals", a warning, or that there was nothing to check.
5. **Categories and duplicates** (`categorize.ts`, `match.ts`, `plan.ts`). Keyword rules for Indian merchants and
   narration formats (whole words, word prefixes, and run-together text like `AMAZONPAYGROCERY`) suggest a category;
   money in from a merchant is a refund; ATM withdrawals and cash deposits are transfers with Cash. Categories you chose
   before for the same description win, and choosing one for a row applies it to the same payee's other rows. A row is a
   duplicate when the account already has a transaction with the same date, amount and direction, each saved transaction
   matching one row.

The store's `importStatement` adds everything in one step — creating the account if asked, at the statement's opening
balance — and returns a receipt for `undoImport`. With only demo data loaded the import can replace it (and undo brings it
back); once you've added data of your own, that's offered but never the default.

The bundled **sample statement** is a fictional "Demo Bank" PDF drawn by `scripts/make-sample-statement.py` with the same
layout quirks, plus a JSON file of the rows it contains; `sample.test.ts` runs the real pdf.js extraction on it and checks
every row comes back exactly. The importer was also checked against a real multi-page HDFC statement (not in the
repository): every row read, matching the bank's totals to the paisa.

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

- `npm test` — unit tests for all `lib/` modules and the store actions, plus the sample statement end to end through pdf.js.
- Manual end-to-end runs with Playwright (not committed, to keep the project light): add/edit/delete/undo, transfers and balances,
  persistence across reloads, budgets, goals, loans + EMI payment, custom categories, accounts, theme persistence, CSV export,
  backup → erase → restore, invalid backup rejection, full offline use with the service worker, and sub-folder hosting;
  statement import with the sample, a password-protected copy, a non-PDF file, undo, re-import duplicates and offline use.

## Possible next steps

Recurring transactions and reminders, multiple tabs editing at once (BroadcastChannel sync), optional encrypted cloud sync,
bank SMS import and CSV/Excel statement import, budget rollover, and per-goal transactions.
