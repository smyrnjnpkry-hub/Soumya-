# FinTrack — personal finance tracker (₹)

A clean, modern personal finance app that runs entirely in your browser. Track income and expenses across cash, bank and UPI,
set budgets, save towards goals, follow your loans, EMIs, credit cards and money lent or borrowed, and get plain-language insights about your money — all in Indian
Rupees, all offline, and all private: **your data never leaves your device**.

It is a Progressive Web App (PWA), so you can install it on your phone or computer like a normal app.

## Features

| Screen              | What it does                                                                                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**       | Total balance across accounts, this month's income and expenses with change vs last month, savings rate, spending by category, budget snapshot, recent transactions, top insights, the next EMI and what's owed on credit cards                                              |
| **Transactions**    | Search, filter by type / period / category / account / dates, grouped by day with daily totals, quick add                                                                                                                                                                    |
| **Add / edit**      | Expense, income or **transfer** between accounts; category grid ordered by how often you use it; Today / Yesterday shortcuts; "Save & add another"; delete with **Undo**                                                                                                     |
| **Budget**          | Monthly limits per category with progress bars, money left, "safe to spend per day", unbudgeted spending, copy last month's budgets                                                                                                                                          |
| **Goals**           | Savings goals with circular progress, the monthly amount needed to hit the deadline, add or withdraw money                                                                                                                                                                   |
| **Cash flow**       | Income vs expenses over 6 or 12 months, net cash flow, best/toughest month and a month-by-month table                                                                                                                                                                        |
| **Insights**        | Rule-based observations (see below), cash-flow health, spending pace vs last month, category cards with mini charts                                                                                                                                                          |
| **Categories**      | Where money goes (or comes from) for any period, with a 6-month trend and largest transactions per category; custom categories with icons and colours                                                                                                                        |
| **Loans & EMI**     | Outstanding principal, interest left, payoff date, due/overdue reminders, "Mark EMI paid" (optionally recorded as an expense), EMI calculator                                                                                                                                |
| **Credit cards**    | Each card's limit, what you owe, the minimum due and when, how much of the limit is used and what paying only the minimum costs; card bills already in your transactions show under the right card, never counted twice (see below)                                          |
| **Lent & Borrowed** | Money you've lent to people and borrowed from them: what's still owed, monthly interest (with a running total of anything unpaid) or interest paid at the end, what's due, every payment, CSV export and WhatsApp reminders; never counted as income or spending (see below) |
| **Reports**         | Pie charts for expenses and income, income vs expenses, monthly trend, spending by weekday, largest expenses, CSV export for any period                                                                                                                                      |
| **Accounts**        | Cash, bank and UPI balances with this month's money in and out                                                                                                                                                                                                               |
| **Import**          | Add months of transactions from your bank's **PDF statement**: suggested categories, duplicates skipped, checked against the bank's own totals, undo straight after (see below)                                                                                              |
| **Settings**        | Light / dark / system theme, install the app, export CSV, full backup and restore, sample data, erase everything                                                                                                                                                             |

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
- _HDFC Millennia minimum of ₹1,180 due in 5 days_ · _Your cards are 35% used_ (keeping it under 30% helps your credit score)
- _₹750 interest pending from Ramesh_ · _₹6,000 to Priya due back in 3 days_
- _You spend 2.1× more per day on weekends_

The month-end projection scales your spending by last month's pace (so rent on the 3rd doesn't distort it), falling back to a
straight-line estimate early in the month. All thresholds live in one table at the top of [`src/lib/insights.ts`](src/lib/insights.ts).

### Import your bank statement (PDF)

**Import statement** (in the menu, and on the Transactions, Accounts and Settings screens) reads the PDF statement you
download from net banking or your bank's app:

1. **Choose PDF** — or tap **Try a sample statement** to see how it works with made-up data. Password-protected statements
   are fine; you'll be asked for the password.
2. **Review** — every transaction is listed with a short description (`UPI-ZOMATO LTD-ZOMATO.RZP@…` becomes _Zomato Ltd_)
   and a suggested category. Change any of them; picking a category for one payment to a person applies it to their other
   payments too. ATM withdrawals become transfers to your Cash account. Rows already in FinTrack are unticked so nothing is
   added twice. A badge tells you whether the rows add up to the **bank's own totals**.
3. **Import** into a new account (named like _HDFC Bank ••5678_, opened at the statement's opening balance so its balance
   matches the bank's) or an existing one. **Undo** is offered straight after.

The PDF is read **on your device** — it is never uploaded, and only the last four digits of the account number are kept.
It's built and tested on HDFC Bank statements; statements from other banks with Date / Narration / Withdrawal / Deposit /
Balance columns usually work too. Scanned or photographed statements can't be read (they have no text). Next time you
import, categories you chose before are remembered.

### Credit cards

**Credit Cards** (under Loans & EMI in the menu) works like the loans screen: add each card with its limit, what you owe,
the minimum due, the due date and the interest rate (card papers often quote it per month — 3.5% a month is 42% a year).

- **Card bills you already have are matched for you.** A payment whose note shows the card's last 4 digits as part of a
  card number (_Credit card bill ••4417_, _XXXX4417_, _card ending 4417_) or the card's full name goes under that card.
  With a single card, any payment that reads like a card bill does. Anything that could be either of two cards is listed
  at the top so you can pick, and **Not this card** or **Link a transaction** fixes a wrong or missed match.
- **Nothing is counted twice.** A card bill paid from your bank is already spending, so **Record payment** offers to link
  that transaction (it finds ones of about the same amount within 5 days) instead of adding another. You can also add the
  payment as a new expense, or just update the card if you'll import the statement later. Every step can be undone.
- What you owe on cards is shown separately: your total balance, income, spending and budgets don't change.

### Lent & Borrowed

**Lent & Borrowed** (under Credit Cards in the menu) keeps track of money between you and people you know: add someone,
how much changed hands, and the interest if any — none, **monthly** (the usual byaj, e.g. 2% a month = ₹2 per ₹100) or
**at the end** (simple interest, paid with the money).

- **Interest that isn't paid adds up.** Each month's interest is added on its due day; payments clear the oldest month
  first, so the card shows e.g. _₹2,250 interest pending · overdue by 49 days_ and **Record payment** offers that amount.
- **Your totals stay honest.** Money you lend, borrow or get back is not income or spending — only interest is. When you
  record a payment, link the transfer already in your transactions (e.g. one imported from your statement: it finds ones of
  about the same amount within 5 days) and only its interest part counts as income; your bank balance still includes all
  of it. You can also add the payment as a new transaction, or just record it here. Every step can be undone.
- What people owe you is **not** added to your balance. Settle in full (letting go of unpaid interest if you like), correct
  what's owed, see the history, search and filter, export a CSV, and send a ready-made reminder on WhatsApp (you press send).

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
- **Statement import** reads PDFs in the browser; the file isn't uploaded or stored.

## Development

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload     |
| `npm run build`     | Type-check and build the production site |
| `npm run preview`   | Serve the production build locally       |
| `npm test`          | Run the unit tests (Vitest)              |
| `npm run typecheck` | Type-check only                          |
| `npm run format`    | Format the code with Prettier            |

The sample statement (`public/sample-statement.pdf`, fictional "Demo Bank" data) is drawn by
`python3 scripts/make-sample-statement.py` (needs `pip install reportlab`), which also writes the rows the import test
expects.

**Stack:** React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Recharts 3 · Lucide icons · Zustand · idb-keyval (IndexedDB) ·
vite-plugin-pwa (Workbox) · pdf.js (statement import) · date-fns · Vitest.

```
src/
  lib/          Pure, unit-tested logic: money/date formatting, balances, budgets, loans/EMI maths,
                credit card matching, lent & borrowed interest, CSV, backup validation, chart scales, sample data
                and the insights engine
  lib/statement/  Bank statement import: PDF text → transactions, categories, duplicates
  store/        Zustand stores: finance data (persisted to IndexedDB), theme, toasts, install prompt
  components/   UI kit, charts, forms, layout (sidebar, bottom nav), transaction rows, insight items
  pages/        One file per screen
```

Design decisions — data model, storage, routing, the insights rules and the colour/accessibility choices — are written up in
[`docs/design.md`](docs/design.md).
