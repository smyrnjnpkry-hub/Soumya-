# Credit Cards — design

Date: 29 Oct 2026 · Status: built (29 Oct 2026)

## Goal

Add a **Credit Cards** section to FinTrack: each card's limit, what's owed, the minimum due and when, how much of the limit
is in use, and the card's payments as they already appear in your transactions (typed in or imported from a bank
statement) — **without ever counting a payment twice**.

The request came as a prompt written for a different project (TanStack Start, `src/lib/finance/…`, `shell.tsx`,
`PrimaryButton`). This spec maps it onto FinTrack and changes a few points, listed under _Decisions_.

## Approach

Credit cards are a **separate tracker, like Loans**: you enter the card's numbers; payments from your bank are _linked_ to
the card, never added again. This matches how the statement import already records a card bill as an expense (Bills &
Utilities).

Not chosen: treating cards as accounts with every card purchase recorded on them. That needs credit-card statement import
(a different PDF), changes how the total balance works, and would double-count against the card-bill expenses already
imported. It can come later.

## Decisions

| Topic                 | Decision                                                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where things live     | `src/lib/types.ts`, `src/store/finance.ts`, `src/lib/seed.ts`, new `src/lib/cards.ts`, `src/pages/CreditCards.tsx`, `src/components/forms/CreditCardForms.tsx`, route in `src/App.tsx`, nav entry in `src/components/layout/nav.ts` |
| Action names          | Follow Loans: `addCreditCard`, `updateCreditCard`, `deleteCreditCard`, `payCreditCard` (+ `undoCardPayment`), `linkCardTransaction`                                                                                                 |
| Interest rate         | Stored **per year**, like loans. The form says card papers often quote it per month (3.5% a month = 42% a year); the page shows both                                                                                                |
| Matching on "EMI"     | **Not used.** It would pull loan EMIs into card history                                                                                                                                                                             |
| Matching on bank name | **Not used alone.** "HDFC" would match every HDFC transaction; the card's full name or masked last 4 digits are used instead                                                                                                        |
| Subtitle              | "Limits, outstanding balances, due dates, and statement activity" (as requested; no full stop, like the other screens)                                                                                                              |
| Nav                   | "Credit Cards" in the Plan group under "Loans & EMI"; the phone's More menu lists it automatically                                                                                                                                  |

## Data model (`src/lib/types.ts`)

```ts
export interface CreditCard {
  id: string;
  name: string; // e.g. "HDFC Millennia"
  limit: number; // credit limit, ₹
  outstanding: number; // amount owed now, ₹ (you keep it up to date; payments lower it)
  minDue: number; // minimum due on the current statement, ₹ (0 once paid)
  dueDate: string; // 'YYYY-MM-DD'
  interestRate: number; // % per year, e.g. 42
  last4?: string; // exactly 4 digits
}
```

- `FinanceData` gains `creditCards: CreditCard[]`.
- `Transaction` gains `creditCardId?: string | null`:
  - a card id — linked to that card by hand (or by recording a payment);
  - `null` — marked "not a card payment", so automatic matching leaves it alone;
  - missing — automatic matching decides.
- Editing a transaction keeps its link (the edit form doesn't touch it).

## Saved data and backups

- The store's saved format goes from version 1 to 2. Upgrading data saved before cards existed adds `creditCards: []` —
  or the sample cards if the app is still showing sample data. A guard also fills in `[]` if the list is ever missing.
- Backups include `creditCards` and each transaction's `creditCardId`. Backups made before this change still restore
  (no cards). Every card field is validated like the other records; one bad record rejects the file, as today.
- "Start fresh", statement import's "clear the sample data" and its undo all include cards.

## Matching (`src/lib/cards.ts`, display only — never creates transactions)

`cardFor(transaction, cards)` decides which card, if any, a transaction belongs to:

1. `creditCardId` is `null` → none.
2. `creditCardId` names an existing card → that card. (A link to a deleted card is ignored.)
3. The note contains a card's **last 4 written as a masked number**: `••4417`, `XX4417`, `**4417`, `ending 4417`,
   `card 4417` — so "Salary for Mar 2026" can't match a card ending 2026. Exactly one card must match.
4. The note contains a card's **full name** (names of 5+ characters, ignoring case). Exactly one card must match.
5. The note looks like a **generic card payment** ("credit card", "cc bill/payment/autopay", "card bill/payment/dues")
   and there is **exactly one** card → that card.

Built on it:

- `cardActivity(card, cards, transactions)` — the card's transactions, newest first, each marked _linked_ or _matched_.
- `unmatchedCardPayments(cards, transactions)` — generic card payments that no card claims (only possible with two or
  more cards). Shown on the page with a **Link** button.
- `paymentCandidates(card, amount, date, transactions)` — transactions that may already be a payment of this amount:
  **expenses only** (an ATM withdrawal is a transfer and must never be offered), not marked "not a card payment", not
  linked to another card, amount within ₹1 or 1%, date within 5 days. Best first: already matched to this card, then
  closest amount, then closest date.

## Card maths (`src/lib/cards.ts`)

- **Usage** = outstanding ÷ limit. **Available** = limit − outstanding (not below 0).
- **Status**: overdue (minimum due > 0 and the due date has passed) · due soon (within 7 days) · due on date ·
  minimum paid (minimum due 0, still owing) · nothing owed (outstanding 0).
- **Interest if only the minimum is paid** ≈ (outstanding − minimum due) × yearly rate ÷ 12. Shown as "about ₹X next
  month" — an estimate, since banks charge from each purchase date.
- **Overview**: total owed, total limit, overall usage, and the next card due — the earliest due date among cards that
  still have a minimum due.
- Usage colours (always with the % in text): blue under 30%, amber 30–70%, red from 70%.

## Store (`src/store/finance.ts`)

- `addCreditCard(draft) → id`, `updateCreditCard(id, draft)`.
- `deleteCreditCard(id)` — also clears `creditCardId` on transactions linked to it (they stay in your list).
- `linkCardTransaction(transactionId, cardId | null)` — link to a card, or mark "not a card payment".
- `payCreditCard(id, { amount, date, transactionId?, accountId? }) → receipt` — lowers outstanding and minimum due by the
  amount (never below 0). Then **one** of:
  - `transactionId`: link that existing transaction (no new transaction);
  - `accountId`: add one new expense — Bills & Utilities (or the closest expense category if that was removed), from
    that account, note "‹card name› bill", linked to the card;
  - neither: only the card's numbers change.
- `undoCardPayment(receipt)` — puts the card's numbers back and removes the added expense or restores the previous link.

## Screens

**Credit Cards page** (`/credit-cards`), modeled on Loans:

- Header: "Credit Cards", the subtitle above, **Add card** button.
- Summary tiles: owed on cards · total limit · limit used · next due.
- "Card payments not matched to a card" (only when there are some), each with **Link to…**.
- One card per credit card:
  - name ••last 4 and status pill (Due in 5 days / Overdue by 2 days / Minimum paid …);
  - **₹23,480 owed of ₹1,50,000**, usage bar and %, available credit;
  - minimum due and due date · interest "42% a year (3.5% a month)";
  - "Paying only the minimum costs about ₹780 in interest next month" (when there's interest to pay);
  - buttons: **Record payment**, **Edit** (Delete is inside Edit, as with Loans, and asks for confirmation);
  - **Activity**: date, note, category, amount — latest 3, "Show all"; each row has **Not this card**; **Link a
    transaction** opens a searchable picker. Empty state when nothing matches.
- Empty page state: "No credit cards yet" with **Add card**.

**Add / edit card** (modal): name, last 4 (optional), credit limit, amount owed, minimum due, due date, interest (% a
year, with the per-month hint). Checks: name needed; limit above 0; owed 0 or more; minimum due 0 to owed; due date
needed; interest 0–60; last 4 exactly 4 digits.

**Record payment** (modal): amount with **Minimum** / **Full amount** shortcuts, date. "Already in your transactions?"
lists `paymentCandidates` and pre-selects the best; other choices are "Add it as a new expense from ‹account›" and "Just
update the card". Toast with **Undo**.

**Dashboard**: a small "Credit cards" card under the next-EMI card (only when you have cards): total owed, usage bar,
next due — labelled "Not part of your balance". Total balance, income/expense totals, budgets and charts don't change.

**Insights** (two new rules): a card's minimum due within 7 days (warning) or overdue (alert); overall usage at 30% or
more (warning: keeping it under 30% helps your credit score).

## Sample data

- Two cards: "HDFC Millennia ••4417" (limit ₹1,50,000, owed ₹23,480, minimum ₹1,180, due on the 3rd) and "SBI
  SimplyCLICK ••9023" (limit ₹80,000, owed ₹6,240, minimum ₹320, due on the 18th), at 42% a year.
- Monthly bill payments from the bank: "Credit card bill ••4417" (matched by last 4) and "SBI SimplyCLICK payment"
  (matched by name), fixed amounts so the rest of the sample stays the same. The sample's Bills budget rises from
  ₹4,500 to ₹10,000 so the demo isn't over budget.

## Testing

- Unit tests first (`cards.test.ts`): `cardFor` for every rule and its tie-breaks, activity order, unmatched list,
  payment candidates (amount, date window, exclusions, order), usage, status, interest estimate, overview.
- Store tests: add/update/delete (links cleared), link/unlink, payments (linking adds no transaction and leaves totals
  unchanged; recording adds exactly one expense; numbers never below 0; undo), editing keeps links, saved-data upgrade.
- Backup tests: round trip with cards and links, old backup without cards, invalid card rejected.
- Seed and insights tests for the new sample data and rules.
- Browser: add/edit/delete a card, record a payment by linking and as new, unlink/link, dashboard card, accessibility
  (axe, both themes), 360px screens, offline.

## As built

Built as above, with a few small additions found while building it:

- `linkCardTransaction` also takes `undefined` (back to automatic matching) and returns the previous link, so every link
  change has an **Undo**.
- The unmatched list also has **Not a card payment**, for card-looking notes that aren't card bills.
- The "Link a transaction" picker searches notes and amounts and says when a transaction is now under another card.
- The interest estimate is shown rounded ("about ₹780"); the card form's checks and the picker's list are unit-tested
  (`checkCardForm`, `linkCandidates`).

## Not included

Credit-card statement import, cards as accounts, per-purchase card tracking, EMIs on cards, reminders/notifications.
