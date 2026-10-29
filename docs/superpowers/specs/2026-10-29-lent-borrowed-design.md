# Lent & Borrowed — design

Date: 29 Oct 2026 · Status: approved in chat, section by section; built straight away at the user's request

## Goal

Track money lent to people and borrowed from them: who, how much is still owed, interest (often monthly "byaj"), what's
due, and every payment — **without** money lent, borrowed or paid back ever counting as income or spending, and without
adding what people owe you to your balance.

The request came as a prompt written for another project ("Artha", TanStack Start, `src/lib/finance/…`, `shell.tsx`). This
maps it onto FinTrack and changes a few points (see _Changes from the prompt_).

## Decisions

| Topic               | Decision                                                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money in your books | A transaction linked or added here carries `principalPart`: the money lent, borrowed or paid back inside it. Income/spending totals leave that part out; balances, each account's money in/out and duplicate checks keep it |
| Interest pending    | A running total: every monthly due date adds a month's interest on what's still owed; payments clear the oldest month first                                                                                                 |
| Owed / settled      | Worked out from the history, never stored, so they can't drift                                                                                                                                                              |
| Interest kinds      | `none` · `monthly` (byaj) · `end` (simple interest paid with the money). Rate stored per month                                                                                                                              |
| Where things live   | `src/lib/types.ts`, new `src/lib/lending.ts`, `src/store/finance.ts`, `src/lib/seed.ts`, `src/lib/backup.ts`, `src/lib/insights.ts`, new `src/pages/LentBorrowed.tsx`, new `src/components/forms/LentBorrowedForms.tsx`     |
| Nav                 | "Lent & Borrowed" in the Plan group after Credit Cards; More on phones                                                                                                                                                      |

## Data model (`src/lib/types.ts`)

```ts
export type LentBorrowedType = 'lent' | 'borrowed';
export type InterestType = 'none' | 'monthly' | 'end';

export interface LentBorrowedPayment {
  id: string;
  date: string; // 'YYYY-MM-DD'
  type: 'interest' | 'principal' | 'mixed' | 'settlement' | 'correction';
  interestPortion: number; // ₹
  principalPortion: number; // ₹ money back; for a correction, how much it lowered what's owed (negative raises it)
  waived?: number; // interest let go when settling
  note?: string;
  linkedTransactionId?: string; // this payment's transaction in your books
  addedTransaction?: boolean; // the app added it (removing the payment removes it)
}

export interface LentBorrowed {
  id: string;
  person: string;
  phone?: string;
  note?: string;
  direction: LentBorrowedType;
  principal: number; // amount lent or borrowed
  interestType: InterestType;
  interestRate: number; // % per month, 0 with no interest
  startDate: string;
  dueDay?: number; // day of the month monthly interest is due, 1–31; the start date's day when missing
  dueDate?: string; // when the money should be back
  remind: boolean;
  payments: LentBorrowedPayment[];
  startTransactionId?: string; // where the money went out (lent) or came in (borrowed)
  addedStartTransaction?: boolean;
}
```

- `FinanceData` gains `lentBorrowed: LentBorrowed[]`; `Transaction` gains `principalPart?: number`.

## The numbers (`src/lib/lending.ts`, pure, unit-tested)

- **Owed on a date** = amount − money paid back (and corrections) up to that date; never below 0.
- **Monthly interest**: due on the due day of each month, from the month after the start (a 31 means the last day of
  shorter months). Each due date adds `owed just before that day × rate`. Interest pending = added − received − waived.
  Received interest clears the oldest month first; the oldest month not fully cleared is "overdue since".
- **Interest at the end**: simple interest by the day (30-day month) on what's owed over time; pending = so far −
  received − waived. Settling asks for what's owed plus that.
- **Settled** = nothing owed and no interest pending (₹0.50 tolerance).
- **Due badge** (most urgent wins): interest overdue (pending, since the oldest unpaid month) · next interest due · money
  due back / overdue (`dueDate`; for interest at the end the amount includes the interest so far). **Due soon** = overdue or
  within 7 days, for people with reminders on.
- **Overview**: owed to you, you owe, net position, interest received this month (lent entries, settled ones included) and
  interest pending to you.
- **Transaction candidates**: money in or out (never transfers) of about the same amount (₹1 or 1%) within 5 days, not
  already used by any entry or linked to a credit card; closest amount, then closest date.
- Also: filters/search/sort, CSV rows for the export, the WhatsApp reminder link, and form checks.

## Store (`src/store/finance.ts`)

- `addLentBorrowed(draft, record)` · `updateLentBorrowed(id, draft)` · `deleteLentBorrowed(id)`.
- `recordLentBorrowedPayment(id, { kind: 'interest' | 'money' | 'settle', date, interestPortion, principalPortion, note,
record })` → `{ id, paymentId }` · `deleteLentBorrowedPayment(id, paymentId)` (also Undo) ·
  `adjustRemaining(id, { owed, date, note })` (a "Correction" line).
- `record` is `{ transactionId }` (link: `principalPart` = the money part, capped at the amount), `{ accountId }` (add one
  transaction) or `null` (books unchanged).
  - Added start: lent → expense under Other ("Lent to Ramesh"); borrowed → income under Other Income.
  - Added payment: lent → income under Interest & Dividends when it has interest, else Other Income; borrowed → expense
    under EMI & Loans. `principalPart` = the money-back part.
- Settling pays what's owed on that date; interest paid below what's pending is recorded as waived.
- Deleting a payment or a person removes transactions the app added and takes the marker off linked ones, which count as
  normal income/spending again.
- Editing a transaction keeps its marker (capped at the new amount). Once there's history, the direction can't change.
- Saved data goes to version 3: older data gets `lentBorrowed: []` (sample people, without transaction links, while the
  sample is showing); a missing list is never filled from the initial state. Start fresh, import "clear the sample data"
  and its undo include it.

## Totals

`countedAmount(t) = amount − principalPart`. Used by period/month totals, monthly series, category breakdowns (and so
budgets), daily cumulative, weekday totals, insights, the Transactions summary and day totals, Reports and Categories.
Not used by account balances, the Accounts screen's money in/out or statement duplicate matching.

## Screens

- **Page** `/lent-borrowed`: Add and Export; tiles Net position · Owed to you · You owe · Interest this month (with
  pending); search (name or note); filters All · I lent · I borrowed · With interest · No interest · Due soon; **Show
  settled** off by default; order: overdue and due soon first, then next due, settled last.
- **Card**: name, "You lent"/"You borrowed", bell when reminders are on, phone (tap to call), note; "₹X still owed of ₹Y"
  with a bar; interest per month and year with this month's interest or "about ₹X so far"; interest pending; due badge;
  Record payment · Settle · Edit (correction and Delete inside); "Remind on WhatsApp" for money lent with a phone and
  something due; History (n) with delete.
- **Add/edit person** and **Record payment** forms as agreed: the payment form splits Interest and Money back,
  pre-filled per kind (Interest = pending, or a month's interest; Settle = owed + pending, lowering interest waives it);
  both offer Link / Add as a transaction / Don't add. "Don't add" is the default for a start date before your first
  transaction. Undo after saving.
- **Dashboard**: a "Lent & Borrowed" card under the credit cards card when someone still owes or is owed: net position,
  owed to you, you owe, interest this month, up to 2 due-soon people with **Record interest** (pending pre-filled), Add
  and View all. Total balance unchanged.
- **Transactions**: linked ones show "Lent & Borrowed" in their subtitle; the edit form explains the uncounted part.
- **Tips**: interest due within 7 days or pending, money due back soon or overdue, for both directions; reminders on;
  up to 2 of each.

## Sample data

- Ramesh (cousin): lent ₹50,000 eight months ago at 1.5% a month, due on the 10th; ₹750 arrives monthly as linked bank
  transactions; this month's is missing (₹750 pending, overdue).
- Priya (sister): borrowed ₹10,000 three months ago, no interest, ₹4,000 paid back last month, due back next month;
  both bank transactions marked, so ₹6,000 owed.
- Fixed amounts; the rest of the sample stays the same.

## Changes from the prompt

- Owed and settled are derived (the prompt stored `remaining`/`status`); `adjustRemaining` records a dated correction.
- Interest kinds renamed `monthly`/`end` and defined; missed interest adds up.
- Money-back marker on transactions so linked bank transactions stop counting as income/spending; the loan's own
  money-out transaction can be linked too.
- Payments can be undone and deleted; settling can waive interest.
- The separate "Settled" filter is folded into the Show settled switch; WhatsApp reminder added.

## Not included

Phone notifications or automatic WhatsApp messages, compound interest, lending more within one entry (add another).
