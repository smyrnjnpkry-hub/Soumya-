import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayISO } from '@/lib/dates';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/lib/defaults';
import { round2 } from '@/lib/format';
import { createId } from '@/lib/id';
import { interestState, owedOn, type Draft as LendingDraft, type PaymentKind } from '@/lib/lending';
import { advanceLoan } from '@/lib/loans';
import { createSampleData } from '@/lib/seed';
import { STATEMENT_ACCOUNT } from '@/lib/statement/types';
import type {
  Account,
  Budget,
  Category,
  CategoryType,
  CreditCard,
  FinanceData,
  Goal,
  LentBorrowed,
  LentBorrowedPayment,
  Loan,
  Transaction,
} from '@/lib/types';
import { deviceStorage, requestPersistentStorage } from './storage';

type Draft<T> = Omit<T, 'id'>;

export interface FinanceState extends FinanceData {
  /** True while the generated demo data is loaded */
  isSample: boolean;

  addTransaction: (t: Draft<Transaction>) => string;
  updateTransaction: (id: string, t: Draft<Transaction>) => void;
  /** Returns the removed transaction so the UI can offer Undo */
  deleteTransaction: (id: string) => Transaction | undefined;
  restoreTransaction: (t: Transaction) => void;

  addAccount: (a: Draft<Account>) => string;
  updateAccount: (id: string, a: Draft<Account>) => void;
  /** Refuses (returns false) while transactions still use the account */
  deleteAccount: (id: string) => boolean;

  addCategory: (c: Draft<Category>) => string;
  updateCategory: (id: string, c: Draft<Category>) => void;
  /** Moves the category's transactions to "Other" and drops its budgets */
  deleteCategory: (id: string) => void;

  setBudget: (category: string, month: string, limit: number) => void;
  deleteBudget: (id: string) => void;
  /** Copies budgets into a month for categories it doesn't budget yet; returns how many */
  copyBudgets: (fromMonth: string, toMonth: string) => number;

  addGoal: (g: Draft<Goal>) => string;
  updateGoal: (id: string, g: Draft<Goal>) => void;
  deleteGoal: (id: string) => void;
  /** Negative amounts withdraw; the balance never drops below zero */
  contributeToGoal: (id: string, amount: number) => void;

  addLoan: (l: Draft<Loan>) => string;
  updateLoan: (id: string, l: Draft<Loan>) => void;
  deleteLoan: (id: string) => void;
  /** Marks the next EMI paid; with an account it is also recorded as an expense */
  payEmi: (id: string, record?: { accountId: string; date: string }) => void;

  addCreditCard: (c: Draft<CreditCard>) => string;
  updateCreditCard: (id: string, c: Draft<CreditCard>) => void;
  /** Also unlinks its transactions, which stay in your list */
  deleteCreditCard: (id: string) => void;
  /**
   * Links a transaction to a card, marks it "not a card payment" (null), or hands it back to automatic matching
   * (undefined). Returns the previous link, for Undo.
   */
  linkCardTransaction: (transactionId: string, cardId: string | null | undefined) => CardLink;
  /** Lowers what's owed and the minimum due (never below 0); returns what undoCardPayment needs, or null if refused */
  payCreditCard: (id: string, payment: CardPayment) => CardPaymentReceipt | null;
  undoCardPayment: (receipt: CardPaymentReceipt) => void;

  /** Adds someone; `record` links the transaction where the money went out or came in, adds one, or leaves your books alone */
  addLentBorrowed: (draft: LendingDraft, record: TransactionChoice) => string;
  /** A transaction the app added follows the new details. Lent/borrowed can't switch once there's history. */
  updateLentBorrowed: (id: string, draft: LendingDraft) => void;
  /** Removes them and their history: transactions the app added go too, linked ones count as normal again */
  deleteLentBorrowed: (id: string) => void;
  /** Interest and/or money back, or settling up; returns what deleteLentBorrowedPayment needs (Undo), or null */
  recordLentBorrowedPayment: (id: string, payment: LendingPaymentInput) => { id: string; paymentId: string } | null;
  /** Takes a payment or correction out, putting its transaction back as it was */
  deleteLentBorrowedPayment: (id: string, paymentId: string) => void;
  /** Corrects what's still owed from a date on, as a line in the history; returns its id, or null */
  adjustRemaining: (id: string, correction: { owed: number; date: string; note?: string }) => string | null;

  /** Adds a statement's rows in one step, optionally creating their account; returns what undoImport needs */
  importStatement: (plan: ImportPlan) => ImportReceipt;
  undoImport: (receipt: ImportReceipt) => void;

  replaceAll: (data: FinanceData, isSample?: boolean) => void;
  startFresh: () => void;
  dismissSample: () => void;
}

/** A transaction's card link: a card id, null ("not a card payment") or undefined (automatic matching decides). */
export type CardLink = Transaction['creditCardId'];

export interface CardPayment {
  amount: number;
  date: string;
  /** A transaction that already is this payment: it gets linked and nothing is added */
  transactionId?: string;
  /** Otherwise, the account to add the payment from as a new expense. With neither, only the card's numbers change. */
  accountId?: string;
}

export interface CardPaymentReceipt {
  cardId: string;
  previous: Pick<CreditCard, 'outstanding' | 'minDue'>;
  /** The expense added for the payment */
  addedId: string | null;
  /** The transaction linked as the payment, with the link it had before */
  linked: { transactionId: string; previous: CardLink } | null;
}

/** Where Lent & Borrowed money goes in your books: a transaction to link, an account to add one from, or nowhere. */
export type TransactionChoice = { transactionId: string } | { accountId: string } | null;

export interface LendingPaymentInput {
  kind: PaymentKind;
  date: string;
  interestPortion: number;
  /** Ignored when settling: everything owed that day is paid back */
  principalPortion: number;
  note?: string;
  record: TransactionChoice;
}

export interface ImportPlan {
  /** An existing account id, or a new account to create. Rows refer to it as STATEMENT_ACCOUNT. */
  account: string | Draft<Account>;
  /** Replaces an existing account's opening balance */
  openingBalance?: number;
  transactions: Draft<Transaction>[];
  /** Clear the sample data first */
  fresh?: boolean;
}

export interface ImportReceipt {
  accountId: string;
  ids: string[];
  createdAccount: boolean;
  previousOpening: number | null;
  /** Everything as it was, when the import replaced the sample data */
  previous: (FinanceData & { isSample: boolean }) | null;
}

const emptyData = (): FinanceData => ({
  transactions: [],
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  budgets: [],
  goals: [],
  loans: [],
  creditCards: [],
  lentBorrowed: [],
});

const pickData = (s: FinanceData): FinanceData => ({
  transactions: s.transactions,
  accounts: s.accounts,
  categories: s.categories,
  budgets: s.budgets,
  goals: s.goals,
  loans: s.loans,
  creditCards: s.creditCards,
  lentBorrowed: s.lentBorrowed,
});

const replaceById = <T extends { id: string }>(items: T[], id: string, next: Omit<T, 'id'>): T[] =>
  items.map((item) => (item.id === id ? ({ ...next, id } as T) : item));

/** undefined removes the link, so automatic matching decides again. */
const withCardLink = (t: Transaction, link: CardLink): Transaction => {
  const { creditCardId: _previous, ...rest } = t;
  return link === undefined ? rest : { ...rest, creditCardId: link };
};

const setCardLink = (transactions: Transaction[], id: string, link: CardLink) =>
  transactions.map((t) => (t.id === id ? withCardLink(t, link) : t));

/** Where a card payment added as a new expense goes: Bills & Utilities, or the closest category left. */
export const cardPaymentCategory = (categories: Category[]) =>
  categories.find((c) => c.id === 'bills') ??
  categories.find((c) => c.type === 'expense' && /bill|utilit/i.test(c.name)) ??
  categories.find((c) => c.id === 'other-expense') ??
  categories.find((c) => c.type === 'expense');

/** Sets how much of a transaction is money lent, borrowed or paid back (never more than its amount); 0 or undefined clears it. */
const withPrincipal = (t: Transaction, part: number | undefined): Transaction => {
  const { principalPart: _previous, ...rest } = t;
  return part ? { ...rest, principalPart: round2(Math.min(part, t.amount)) } : rest;
};

/** The first of these categories that exists, else any of the type. */
const categoryFor = (categories: Category[], ids: string[], type: CategoryType) =>
  ids.map((id) => categories.find((c) => c.id === id)).find((c) => c !== undefined) ?? categories.find((c) => c.type === type);

const startNote = (entry: Pick<LentBorrowed, 'person' | 'direction'>) =>
  entry.direction === 'lent' ? `Lent to ${entry.person}` : `Borrowed from ${entry.person}`;

function paymentNote({ person, direction }: LentBorrowed, interest: number, principal: number, settle: boolean) {
  if (direction === 'lent') {
    if (settle) return `${person} settled`;
    return interest > 0 && principal > 0
      ? `${person} paid back with interest`
      : interest > 0
        ? `Interest from ${person}`
        : `${person} paid back`;
  }
  if (settle) return `Settled with ${person}`;
  return interest > 0 && principal > 0
    ? `Paid back ${person} with interest`
    : interest > 0
      ? `Interest to ${person}`
      : `Paid back ${person}`;
}

/** How much of a transaction an entry says is money lent, borrowed or paid back, if it uses the transaction. */
function principalLinkedTo(entries: LentBorrowed[], transactionId: string): number | undefined {
  for (const entry of entries) {
    if (entry.startTransactionId === transactionId) return entry.principal;
    const payment = entry.payments.find((p) => p.linkedTransactionId === transactionId);
    if (payment) return payment.principalPortion;
  }
  return undefined;
}

/** Sample people from before an upgrade, without links to sample transactions that saved data doesn't have. */
const withoutTransactionLinks = ({ startTransactionId: _start, addedStartTransaction: _added, ...entry }: LentBorrowed): LentBorrowed => ({
  ...entry,
  payments: entry.payments.map(({ linkedTransactionId: _link, addedTransaction: _addedPayment, ...p }) => p),
});

let askedForPersistence = false;

/** Where the saved data lives (one JSON document). */
export const STORAGE_KEY = 'fintrack-data';

/**
 * 'error' means saved data exists but couldn't be read. The app then shows a
 * recovery screen and never writes, so a temporary failure can't overwrite real data.
 */
export type BootStatus = 'loading' | 'ready' | 'error';
export const useBoot = create<{ status: BootStatus; error: string | null }>()(() => ({ status: 'loading', error: null }));

export const useFinance = create<FinanceState>()(
  persist(
    (set, get) => ({
      // First launch shows a realistic demo; the dashboard offers "Start fresh".
      ...createSampleData(todayISO()),
      isSample: true,

      addTransaction: (t) => {
        const id = createId();
        set((s) => ({ transactions: [{ ...t, id }, ...s.transactions] }));
        if (!askedForPersistence) {
          askedForPersistence = true;
          requestPersistentStorage();
        }
        return id;
      },
      // The edit form doesn't know about card links or Lent & Borrowed, so those are kept
      updateTransaction: (id, t) =>
        set((s) => {
          const linked = principalLinkedTo(s.lentBorrowed, id);
          return {
            transactions: s.transactions.map((old) =>
              old.id === id
                ? withPrincipal(
                    { ...('creditCardId' in old ? { creditCardId: old.creditCardId } : {}), ...t, id },
                    linked ?? old.principalPart,
                  )
                : old,
            ),
          };
        }),
      deleteTransaction: (id) => {
        const removed = get().transactions.find((t) => t.id === id);
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
        return removed;
      },
      restoreTransaction: (t) => set((s) => (s.transactions.some((x) => x.id === t.id) ? s : { transactions: [t, ...s.transactions] })),

      addAccount: (a) => {
        const id = createId();
        set((s) => ({ accounts: [...s.accounts, { ...a, id }] }));
        return id;
      },
      updateAccount: (id, a) => set((s) => ({ accounts: replaceById(s.accounts, id, a) })),
      deleteAccount: (id) => {
        if (get().transactions.some((t) => t.account === id || t.toAccount === id)) return false;
        set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
        return true;
      },

      addCategory: (c) => {
        const id = createId();
        set((s) => ({ categories: [...s.categories, { ...c, id }] }));
        return id;
      },
      updateCategory: (id, c) => set((s) => ({ categories: replaceById(s.categories, id, c) })),
      deleteCategory: (id) =>
        set((s) => {
          const doomed = s.categories.find((c) => c.id === id);
          if (!doomed) return s;
          const fallback =
            s.categories.find((c) => c.id !== id && c.type === doomed.type && c.id === `other-${doomed.type}`) ??
            s.categories.find((c) => c.id !== id && c.type === doomed.type && /^other/i.test(c.name));
          return {
            categories: s.categories.filter((c) => c.id !== id),
            budgets: s.budgets.filter((b) => b.category !== id),
            transactions: fallback ? s.transactions.map((t) => (t.category === id ? { ...t, category: fallback.id } : t)) : s.transactions,
          };
        }),

      setBudget: (category, month, limit) =>
        set((s) => {
          const existing = s.budgets.find((b) => b.category === category && b.month === month);
          const budget: Budget = { id: existing?.id ?? createId(), category, month, limit };
          return {
            budgets: existing ? s.budgets.map((b) => (b.id === existing.id ? budget : b)) : [...s.budgets, budget],
          };
        }),
      deleteBudget: (id) => set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) })),
      copyBudgets: (fromMonth, toMonth) => {
        const { budgets } = get();
        const taken = new Set(budgets.filter((b) => b.month === toMonth).map((b) => b.category));
        const copies = budgets
          .filter((b) => b.month === fromMonth && !taken.has(b.category))
          .map((b) => ({ ...b, id: createId(), month: toMonth }));
        if (copies.length) set({ budgets: [...budgets, ...copies] });
        return copies.length;
      },

      addGoal: (g) => {
        const id = createId();
        set((s) => ({ goals: [...s.goals, { ...g, id }] }));
        return id;
      },
      updateGoal: (id, g) => set((s) => ({ goals: replaceById(s.goals, id, g) })),
      deleteGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      contributeToGoal: (id, amount) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, current: Math.max(0, Math.round((g.current + amount) * 100) / 100) } : g)),
        })),

      addLoan: (l) => {
        const id = createId();
        set((s) => ({ loans: [...s.loans, { ...l, id }] }));
        return id;
      },
      updateLoan: (id, l) => set((s) => ({ loans: replaceById(s.loans, id, l) })),
      deleteLoan: (id) => set((s) => ({ loans: s.loans.filter((l) => l.id !== id) })),
      payEmi: (id, record) =>
        set((s) => {
          const loan = s.loans.find((l) => l.id === id);
          if (!loan || loan.remainingTenure <= 0) return s;
          const loans = s.loans.map((l) => (l.id === id ? advanceLoan(l) : l));
          if (!record) return { loans };
          const category =
            s.categories.find((c) => c.id === 'emi') ??
            s.categories.find((c) => c.type === 'expense' && /emi|loan/i.test(c.name)) ??
            s.categories.find((c) => c.type === 'expense');
          const expense: Transaction = {
            id: createId(),
            type: 'expense',
            amount: loan.emi,
            date: record.date,
            category: category?.id ?? '',
            account: record.accountId,
            note: `${loan.name} EMI`,
          };
          return { loans, transactions: [expense, ...s.transactions] };
        }),

      addCreditCard: (c) => {
        const id = createId();
        set((s) => ({ creditCards: [...s.creditCards, { ...c, id }] }));
        return id;
      },
      updateCreditCard: (id, c) => set((s) => ({ creditCards: replaceById(s.creditCards, id, c) })),
      deleteCreditCard: (id) =>
        set((s) => ({
          creditCards: s.creditCards.filter((c) => c.id !== id),
          transactions: s.transactions.map((t) => (t.creditCardId === id ? withCardLink(t, undefined) : t)),
        })),
      linkCardTransaction: (transactionId, cardId) => {
        const previous = get().transactions.find((t) => t.id === transactionId)?.creditCardId;
        set((s) => ({ transactions: setCardLink(s.transactions, transactionId, cardId) }));
        return previous;
      },
      payCreditCard: (id, payment) => {
        const s = get();
        const card = s.creditCards.find((c) => c.id === id);
        if (!card || !(payment.amount > 0)) return null;
        const creditCards = s.creditCards.map((c) =>
          c.id === id
            ? {
                ...c,
                outstanding: round2(Math.max(c.outstanding - payment.amount, 0)),
                minDue: round2(Math.max(c.minDue - payment.amount, 0)),
              }
            : c,
        );
        const receipt: CardPaymentReceipt = {
          cardId: id,
          previous: { outstanding: card.outstanding, minDue: card.minDue },
          addedId: null,
          linked: null,
        };
        let { transactions } = s;
        const existing = payment.transactionId ? transactions.find((t) => t.id === payment.transactionId) : undefined;
        if (existing) {
          receipt.linked = { transactionId: existing.id, previous: existing.creditCardId };
          transactions = setCardLink(transactions, existing.id, id);
        } else if (payment.accountId) {
          const category = cardPaymentCategory(s.categories);
          const expense: Transaction = {
            id: createId(),
            type: 'expense',
            amount: payment.amount,
            date: payment.date,
            category: category?.id ?? '',
            account: payment.accountId,
            note: `${card.name} bill`,
            creditCardId: id,
          };
          receipt.addedId = expense.id;
          transactions = [expense, ...transactions];
        }
        set({ creditCards, transactions });
        return receipt;
      },
      undoCardPayment: (receipt) =>
        set((s) => {
          const { linked, addedId, previous } = receipt;
          let { transactions } = s;
          if (addedId) transactions = transactions.filter((t) => t.id !== addedId);
          if (linked) transactions = setCardLink(transactions, linked.transactionId, linked.previous);
          return {
            transactions,
            creditCards: s.creditCards.map((c) => (c.id === receipt.cardId ? { ...c, ...previous } : c)),
          };
        }),

      addLentBorrowed: (draft, record) => {
        const id = createId();
        let { transactions } = get();
        let start: Pick<LentBorrowed, 'startTransactionId' | 'addedStartTransaction'> = {};
        if (record && 'transactionId' in record && transactions.some((t) => t.id === record.transactionId)) {
          transactions = transactions.map((t) => (t.id === record.transactionId ? withPrincipal(t, draft.principal) : t));
          start = { startTransactionId: record.transactionId };
        } else if (record && 'accountId' in record) {
          const type = draft.direction === 'lent' ? 'expense' : 'income';
          const category = categoryFor(get().categories, [type === 'expense' ? 'other-expense' : 'other-income'], type);
          const added: Transaction = {
            id: createId(),
            type,
            amount: draft.principal,
            date: draft.startDate,
            category: category?.id ?? '',
            account: record.accountId,
            note: startNote(draft),
            principalPart: draft.principal,
          };
          transactions = [added, ...transactions];
          start = { startTransactionId: added.id, addedStartTransaction: true };
        }
        set((s) => ({ lentBorrowed: [...s.lentBorrowed, { ...draft, id, payments: [], ...start }], transactions }));
        return id;
      },
      updateLentBorrowed: (id, draft) =>
        set((s) => {
          const old = s.lentBorrowed.find((e) => e.id === id);
          if (!old) return s;
          const next: LentBorrowed = {
            ...draft,
            id,
            direction: old.payments.length ? old.direction : draft.direction,
            payments: old.payments,
            ...(old.startTransactionId ? { startTransactionId: old.startTransactionId } : {}),
            ...(old.addedStartTransaction ? { addedStartTransaction: true } : {}),
          };
          const transactions = s.transactions.map((t) => {
            if (t.id !== old.startTransactionId) return t;
            if (!old.addedStartTransaction) return withPrincipal(t, next.principal);
            const type: Transaction['type'] = next.direction === 'lent' ? 'expense' : 'income';
            const category =
              t.type === type
                ? t.category
                : (categoryFor(s.categories, [type === 'expense' ? 'other-expense' : 'other-income'], type)?.id ?? '');
            return {
              ...t,
              type,
              category,
              amount: next.principal,
              date: next.startDate,
              note: startNote(next),
              principalPart: next.principal,
            };
          });
          return { lentBorrowed: s.lentBorrowed.map((e) => (e.id === id ? next : e)), transactions };
        }),
      deleteLentBorrowed: (id) =>
        set((s) => {
          const entry = s.lentBorrowed.find((e) => e.id === id);
          if (!entry) return s;
          const added = new Set<string>();
          const linked = new Set<string>();
          const track = (transactionId: string | undefined, wasAdded: boolean | undefined) => {
            if (transactionId) (wasAdded ? added : linked).add(transactionId);
          };
          track(entry.startTransactionId, entry.addedStartTransaction);
          for (const p of entry.payments) track(p.linkedTransactionId, p.addedTransaction);
          return {
            lentBorrowed: s.lentBorrowed.filter((e) => e.id !== id),
            transactions: s.transactions.filter((t) => !added.has(t.id)).map((t) => (linked.has(t.id) ? withPrincipal(t, undefined) : t)),
          };
        }),
      recordLentBorrowedPayment: (id, input) => {
        const s = get();
        const entry = s.lentBorrowed.find((e) => e.id === id);
        if (!entry) return null;
        const settle = input.kind === 'settle';
        const interest = round2(input.interestPortion);
        const principal = round2(settle ? owedOn(entry, input.date) : input.principalPortion);
        // Settling lets go of interest pending that day beyond what was paid
        const waived = settle ? round2(Math.max(interestState(entry, input.date).pending - interest, 0)) : 0;
        const note = input.note?.trim();
        const payment: LentBorrowedPayment = {
          id: createId(),
          date: input.date,
          type: settle ? 'settlement' : interest > 0 && principal > 0 ? 'mixed' : interest > 0 ? 'interest' : 'principal',
          interestPortion: interest,
          principalPortion: principal,
          ...(waived > 0 ? { waived } : {}),
          ...(note ? { note } : {}),
        };
        let { transactions } = s;
        const { record } = input;
        if (record && 'transactionId' in record && transactions.some((t) => t.id === record.transactionId)) {
          transactions = transactions.map((t) => (t.id === record.transactionId ? withPrincipal(t, principal) : t));
          payment.linkedTransactionId = record.transactionId;
        } else if (record && 'accountId' in record && interest + principal > 0) {
          const lent = entry.direction === 'lent';
          const type = lent ? 'income' : 'expense';
          const category = categoryFor(
            s.categories,
            lent ? (interest > 0 ? ['interest', 'other-income'] : ['other-income']) : ['emi', 'other-expense'],
            type,
          );
          const added: Transaction = {
            id: createId(),
            type,
            amount: round2(interest + principal),
            date: input.date,
            category: category?.id ?? '',
            account: record.accountId,
            note: paymentNote(entry, interest, principal, settle),
            ...(principal > 0 ? { principalPart: principal } : {}),
          };
          transactions = [added, ...transactions];
          payment.linkedTransactionId = added.id;
          payment.addedTransaction = true;
        }
        set({ lentBorrowed: s.lentBorrowed.map((e) => (e.id === id ? { ...e, payments: [...e.payments, payment] } : e)), transactions });
        return { id, paymentId: payment.id };
      },
      deleteLentBorrowedPayment: (id, paymentId) =>
        set((s) => {
          const payment = s.lentBorrowed.find((e) => e.id === id)?.payments.find((p) => p.id === paymentId);
          if (!payment) return s;
          const linked = payment.linkedTransactionId;
          return {
            lentBorrowed: s.lentBorrowed.map((e) => (e.id === id ? { ...e, payments: e.payments.filter((p) => p.id !== paymentId) } : e)),
            transactions: !linked
              ? s.transactions
              : payment.addedTransaction
                ? s.transactions.filter((t) => t.id !== linked)
                : s.transactions.map((t) => (t.id === linked ? withPrincipal(t, undefined) : t)),
          };
        }),
      adjustRemaining: (id, { owed, date, note }) => {
        const entry = get().lentBorrowed.find((e) => e.id === id);
        if (!entry) return null;
        const text = note?.trim();
        const correction: LentBorrowedPayment = {
          id: createId(),
          date,
          type: 'correction',
          interestPortion: 0,
          principalPortion: round2(owedOn(entry, date) - owed),
          ...(text ? { note: text } : {}),
        };
        set((s) => ({ lentBorrowed: s.lentBorrowed.map((e) => (e.id === id ? { ...e, payments: [...e.payments, correction] } : e)) }));
        return correction.id;
      },

      importStatement: (plan) => {
        const current = get();
        const previous = plan.fresh ? { ...pickData(current), isSample: current.isSample } : null;
        const start = plan.fresh ? emptyData() : pickData(current);
        let accountId: string;
        let accounts = start.accounts;
        let previousOpening: number | null = null;
        if (typeof plan.account === 'string') {
          accountId = plan.account;
          const { openingBalance } = plan;
          if (openingBalance !== undefined) {
            previousOpening = accounts.find((a) => a.id === accountId)?.balance ?? null;
            accounts = accounts.map((a) => (a.id === accountId ? { ...a, balance: openingBalance } : a));
          }
        } else {
          accountId = createId();
          accounts = [...accounts, { ...plan.account, id: accountId }];
        }
        const resolve = (id: string) => (id === STATEMENT_ACCOUNT ? accountId : id);
        // Newest first, like transactions added one by one
        const added: Transaction[] = plan.transactions
          .map((t) => ({ ...t, id: createId(), account: resolve(t.account), ...(t.toAccount ? { toAccount: resolve(t.toAccount) } : {}) }))
          .reverse();
        set({ ...start, accounts, transactions: [...added, ...start.transactions], isSample: plan.fresh ? false : current.isSample });
        if (!askedForPersistence) {
          askedForPersistence = true;
          requestPersistentStorage();
        }
        return { accountId, ids: added.map((t) => t.id), createdAccount: typeof plan.account !== 'string', previousOpening, previous };
      },
      undoImport: (receipt) =>
        set((s) => {
          if (receipt.previous) return { ...receipt.previous };
          const ids = new Set(receipt.ids);
          const transactions = s.transactions.filter((t) => !ids.has(t.id));
          const inUse = transactions.some((t) => t.account === receipt.accountId || t.toAccount === receipt.accountId);
          const { previousOpening } = receipt;
          let accounts = s.accounts;
          if (receipt.createdAccount && !inUse) accounts = accounts.filter((a) => a.id !== receipt.accountId);
          else if (previousOpening !== null)
            accounts = accounts.map((a) => (a.id === receipt.accountId ? { ...a, balance: previousOpening } : a));
          return { transactions, accounts };
        }),

      replaceAll: (data, isSample = false) => set({ ...data, isSample }),
      startFresh: () => set({ ...emptyData(), isSample: false }),
      dismissSample: () => set({ isSample: false }),
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => deviceStorage),
      // Version 2 added credit cards and version 3 Lent & Borrowed: the sample gets its own, your data starts with none
      migrate: (persisted, version) => {
        const saved = { ...(persisted as Partial<FinanceState>) };
        const sample = saved.isSample ? createSampleData(todayISO()) : null;
        if (version < 2) saved.creditCards = sample ? sample.creditCards : [];
        if (version < 3) saved.lentBorrowed = sample ? sample.lentBorrowed.map(withoutTransactionLinks) : [];
        return saved;
      },
      // A missing list must never be filled from the initial state: those are the sample's cards and people, not yours
      merge: (persisted, current) => {
        if (!persisted) return current;
        const saved = persisted as Partial<FinanceState>;
        return { ...current, ...saved, creditCards: saved.creditCards ?? [], lentBorrowed: saved.lentBorrowed ?? [] };
      },
      onRehydrateStorage: () => (_state, error) =>
        useBoot.setState(
          error ? { status: 'error', error: error instanceof Error ? error.message : String(error) } : { status: 'ready', error: null },
        ),
      partialize: (s) => ({ ...pickData(s), isSample: s.isSample }),
    },
  ),
);

/** Id → entity maps for categories and accounts. */
export function useLookups() {
  const categories = useFinance((s) => s.categories);
  const accounts = useFinance((s) => s.accounts);
  return useMemo(
    () => ({
      categories: Object.fromEntries(categories.map((c) => [c.id, c])),
      accounts: Object.fromEntries(accounts.map((a) => [a.id, a])),
    }),
    [categories, accounts],
  );
}

/** The whole dataset as one object (memoised), for calculations like insights. */
export function useFinanceData(): FinanceData {
  const transactions = useFinance((s) => s.transactions);
  const accounts = useFinance((s) => s.accounts);
  const categories = useFinance((s) => s.categories);
  const budgets = useFinance((s) => s.budgets);
  const goals = useFinance((s) => s.goals);
  const loans = useFinance((s) => s.loans);
  const creditCards = useFinance((s) => s.creditCards);
  const lentBorrowed = useFinance((s) => s.lentBorrowed);
  return useMemo(
    () => ({ transactions, accounts, categories, budgets, goals, loans, creditCards, lentBorrowed }),
    [transactions, accounts, categories, budgets, goals, loans, creditCards, lentBorrowed],
  );
}
