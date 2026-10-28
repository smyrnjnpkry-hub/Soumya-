# FinTrack — personal finance tracker (₹)

A clean, modern personal finance app that runs entirely in your browser. Track income and expenses across cash, bank and UPI,
set budgets, save towards goals, follow your loans and EMIs, and get plain-language insights about your money — all in Indian
Rupees, all offline, and all private: **your data never leaves your device**.

It is a Progressive Web App (PWA), so you can install it on your phone or computer like a normal app.

## Features

| Screen           | What it does                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**    | Total balance across accounts, this month's income and expenses with change vs last month, savings rate, spending by category, budget snapshot, recent transactions, top insights and the next EMI |
| **Transactions** | Search, filter by type / period / category / account / dates, grouped by day with daily totals, quick add                                                                                          |
| **Add / edit**   | Expense, income or **transfer** between accounts; category grid ordered by how often you use it; Today / Yesterday shortcuts; "Save & add another"; delete with **Undo**                           |
| **Budget**       | Monthly limits per category with progress bars, money left, "safe to spend per day", unbudgeted spending, copy last month's budgets                                                                |
| **Goals**        | Savings goals with circular progress, the monthly amount needed to hit the deadline, add or withdraw money                                                                                         |
| **Cash flow**    | Income vs expenses over 6 or 12 months, net cash flow, best/toughest month and a month-by-month table                                                                                              |
| **Insights**     | Rule-based observations (see below), cash-flow health, spending pace vs last month, category cards with mini charts                                                                                |
| **Categories**   | Where money goes (or comes from) for any period, with a 6-month trend and largest transactions per category; custom categories with icons and colours                                              |
| **Loans & EMI**  | Outstanding principal, interest left, payoff date, due/overdue reminders, "Mark EMI paid" (optionally recorded as an expense), EMI calculator                                                      |
| **Reports**      | Pie charts for expenses and income, income vs expenses, monthly trend, spending by weekday, largest expenses, CSV export for any period                                                            |
| **Accounts**     | Cash, bank and UPI balances with this month's money in and out                                                                                                                                     |
| **Settings**     | Light / dark / system theme, install the app, export CSV, full backup and restore, sample data, erase everything                                                                                   |

### Smart insights (no AI service needed)

Insights are simple, transparent rules computed on your device. Month-to-date numbers are always compared with **the same days of
last month** (1–20 Oct vs 1–20 Sep), so a half-finished month is never judged against a full one. Examples of what you'll see:

- _Spending down 8% vs last month_
- _Food & Dining spending increased by 20% compared to last month_
- _You spent 50% more on Shopping this month_ — with the one big purchase behind it called out
- _Unusually large expense: ₹6,000 on Shopping_ (far above your typical purchase and anything recent in that category)
- _Highest expense category: Rent & Housing (25%)_
- _You're saving 24% of your income_ · _You're on track to save ₹16,051 this month_
- _Net cash flow has been positive for the last 6 months_ · _Your balance covers 5.0 months of expenses_
- _You've stayed under budget in 6 categories_ · _Food & Dining is over budget by ₹1,830_
- _Save ₹8,500/month to reach New laptop by Feb 2027_ · _Car loan EMI of ₹12,450 due in 5 days_
- _You spend 2.1× more per day on weekends_

The month-end projection scales your spending by last month's pace (so rent on the 3rd doesn't distort it), falling back to a
straight-line estimate early in the month. All thresholds live in one table at the top of [`src/lib/insights.ts`](src/lib/insights.ts).

## Run it on your computer

You need [Node.js](https://nodejs.org) 22.22 or newer (any current LTS release works).

```bash
npm install
```

```bash
npm run dev
```

Open the address it prints (usually http://localhost:5173). The first launch shows six months of **sample data** so every screen
has something to show — tap **Start fresh** on the dashboard when you're ready to track your own money.

## Put it online for free

```bash
npm run build
```

This creates a `dist/` folder: a complete static website. Because the app uses relative paths and hash-based URLs, `dist/` works
from **any** static host and any sub-folder — no server configuration needed. Some free options:

- **Netlify Drop** — drag the `dist` folder onto https://app.netlify.com/drop.
- **Vercel** — import this repository; framework preset _Vite_, output directory `dist`.
- **GitHub Pages** — in the repository go to _Settings → Pages_ and set _Source_ to **GitHub Actions**, then open the
  _Actions_ tab, choose **Deploy to GitHub Pages** and click **Run workflow**. The site appears at
  `https://<your-username>.github.io/<repository>/`.

The site must be served over **https** (all of the above are) for installing and offline mode to work.

## Install on your phone

- **Android (Chrome):** open your site, then tap **Install** in Settings, or use the browser menu → _Install app_.
- **iPhone (Safari):** open your site, tap **Share** → **Add to Home Screen**.

Once installed it opens full-screen and works with no internet connection. Long-press the app icon (Android) for
**Add expense** / **Add income** shortcuts.

## Your data and privacy

- Everything is stored in your browser's IndexedDB on this device. There is no account, no server and no tracking.
- Clearing your browser's site data deletes it, so use **Settings → Back up everything** now and then and keep the file safe.
  **Restore from backup** brings it all back (on the same or a new device).
- **Export CSV** gives you a spreadsheet of your transactions (opens in Excel or Google Sheets).

## Development

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload     |
| `npm run build`     | Type-check and build the production site |
| `npm run preview`   | Serve the production build locally       |
| `npm test`          | Run the unit tests (Vitest)              |
| `npm run typecheck` | Type-check only                          |
| `npm run format`    | Format the code with Prettier            |

**Stack:** React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Recharts 3 · Lucide icons · Zustand · idb-keyval (IndexedDB) ·
vite-plugin-pwa (Workbox) · date-fns · Vitest.

```
src/
  lib/          Pure, unit-tested logic: money/date formatting, balances, budgets, loans/EMI maths,
                CSV, backup validation, chart scales, sample data and the insights engine
  store/        Zustand stores: finance data (persisted to IndexedDB), theme, toasts, install prompt
  components/   UI kit, charts, forms, layout (sidebar, bottom nav), transaction rows, insight items
  pages/        One file per screen
```

Design decisions — data model, storage, routing, the insights rules and the colour/accessibility choices — are written up in
[`docs/design.md`](docs/design.md).
