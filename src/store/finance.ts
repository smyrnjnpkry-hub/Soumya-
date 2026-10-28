import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayISO } from '@/lib/dates';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/lib/defaults';
import { createId } from '@/lib/id';
import { advanceLoan } from '@/lib/loans';
import { createSampleData } from '@/lib/seed';
import { STATEMENT_ACCOUNT } from '@/lib/statement/types';
import type { Account, Budget, Category, FinanceData, Goal, Loan, Transaction } from '@/lib/types';
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

  /** Adds a statement's rows in one step, optionally creating their account; returns what undoImport needs */
  importStatement: (plan: ImportPlan) => ImportReceipt;
  undoImport: (receipt: ImportReceipt) => void;

  replaceAll: (data: FinanceData, isSample?: boolean) => void;
  startFresh: () => void;
  dismissSample: () => void;
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
});

const pickData = (s: FinanceData): FinanceData => ({
  transactions: s.transactions,
  accounts: s.accounts,
  categories: s.categories,
  budgets: s.budgets,
  goals: s.goals,
  loans: s.loans,
});

const replaceById = <T extends { id: string }>(items: T[], id: string, next: Omit<T, 'id'>): T[] =>
  items.map((item) => (item.id === id ? ({ ...next, id } as T) : item));

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
      updateTransaction: (id, t) => set((s) => ({ transactions: replaceById(s.transactions, id, t) })),
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
      version: 1,
      storage: createJSONStorage(() => deviceStorage),
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
  return useMemo(
    () => ({ transactions, accounts, categories, budgets, goals, loans }),
    [transactions, accounts, categories, budgets, goals, loans],
  );
}
