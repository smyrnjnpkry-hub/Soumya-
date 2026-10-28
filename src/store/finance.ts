import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { todayISO } from '@/lib/dates';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/lib/defaults';
import { createId } from '@/lib/id';
import { advanceLoan } from '@/lib/loans';
import { createSampleData } from '@/lib/seed';
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

  replaceAll: (data: FinanceData, isSample?: boolean) => void;
  startFresh: () => void;
  dismissSample: () => void;
}

const emptyData = (): FinanceData => ({
  transactions: [],
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  budgets: [],
  goals: [],
  loans: [],
});

const replaceById = <T extends { id: string }>(items: T[], id: string, next: Omit<T, 'id'>): T[] =>
  items.map((item) => (item.id === id ? ({ ...next, id } as T) : item));

let askedForPersistence = false;

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
      restoreTransaction: (t) =>
        set((s) => (s.transactions.some((x) => x.id === t.id) ? s : { transactions: [t, ...s.transactions] })),

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
            transactions: fallback
              ? s.transactions.map((t) => (t.category === id ? { ...t, category: fallback.id } : t))
              : s.transactions,
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

      replaceAll: (data, isSample = false) => set({ ...data, isSample }),
      startFresh: () => set({ ...emptyData(), isSample: false }),
      dismissSample: () => set({ isSample: false }),
    }),
    {
      name: 'fintrack-data',
      version: 1,
      storage: createJSONStorage(() => deviceStorage),
      partialize: (s) => ({
        transactions: s.transactions,
        accounts: s.accounts,
        categories: s.categories,
        budgets: s.budgets,
        goals: s.goals,
        loans: s.loans,
        isSample: s.isSample,
      }),
    },
  ),
);

/** True once saved data has been read from IndexedDB (render nothing data-driven before that). */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useFinance.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useFinance.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useFinance.persist.hasHydrated());
    return unsubscribe;
  }, []);
  return hydrated;
}

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
