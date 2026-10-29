import { addDays, daysInMonth, monthBounds, monthKey, parseLocal } from './dates';
import { round2 } from './format';
import type { Account, Budget, CategoryType, Transaction } from './types';

/** Category id used for the folded "Other" slice of a breakdown. */
export const OTHER_ID = '__other__';

const inRange = (t: Transaction, start: string, end: string) => t.date >= start && t.date <= end;

/** Current balance per account: opening balance + income − expenses ± transfers. */
export function accountBalances(accounts: Account[], transactions: Transaction[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const account of accounts) balances[account.id] = account.balance;
  const apply = (id: string | undefined, delta: number) => {
    if (id && id in balances) balances[id] += delta;
  };
  for (const t of transactions) {
    if (t.type === 'income') apply(t.account, t.amount);
    else if (t.type === 'expense') apply(t.account, -t.amount);
    else {
      apply(t.account, -t.amount);
      apply(t.toAccount, t.amount);
    }
  }
  for (const id of Object.keys(balances)) balances[id] = round2(balances[id]);
  return balances;
}

export function totalBalance(accounts: Account[], transactions: Transaction[]): number {
  return round2(Object.values(accountBalances(accounts, transactions)).reduce((sum, b) => sum + b, 0));
}

/** Share of income kept; null when there is no income to measure against. */
export function savingsRate(income: number, expense: number): number | null {
  return income > 0 ? (income - expense) / income : null;
}

export interface PeriodTotals {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
}

/** Income/expense totals for an inclusive date range. Transfers are not income or spending. */
export function periodTotals(transactions: Transaction[], start: string, end: string): PeriodTotals {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (!inRange(t, start, end)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  income = round2(income);
  expense = round2(expense);
  return { income, expense, net: round2(income - expense), savingsRate: savingsRate(income, expense) };
}

export function monthTotals(transactions: Transaction[], key: string): PeriodTotals {
  const { start, end } = monthBounds(key);
  return periodTotals(transactions, start, end);
}

export interface BreakdownItem {
  categoryId: string;
  amount: number;
  /** Fraction of the breakdown total, 0–1. */
  share: number;
  count: number;
}

/** Amount per category for a type and date range, largest first. */
export function categoryBreakdown(
  transactions: Transaction[],
  { type, start, end }: { type: CategoryType; start: string; end: string },
): BreakdownItem[] {
  const byCategory = new Map<string, { amount: number; count: number }>();
  let total = 0;
  for (const t of transactions) {
    if (t.type !== type || !inRange(t, start, end)) continue;
    const entry = byCategory.get(t.category) ?? { amount: 0, count: 0 };
    entry.amount += t.amount;
    entry.count += 1;
    byCategory.set(t.category, entry);
    total += t.amount;
  }
  return [...byCategory]
    .map(([categoryId, { amount, count }]) => ({
      categoryId,
      amount: round2(amount),
      count,
      share: total > 0 ? amount / total : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Keeps the largest `maxSlices - 1` items and folds the rest into one "Other" item. */
export function foldBreakdown(items: BreakdownItem[], maxSlices: number): BreakdownItem[] {
  if (items.length <= maxSlices) return items;
  const head = items.slice(0, maxSlices - 1);
  const tail = items.slice(maxSlices - 1);
  const other = tail.reduce(
    (acc, item) => ({
      ...acc,
      amount: acc.amount + item.amount,
      share: acc.share + item.share,
      count: acc.count + item.count,
    }),
    { categoryId: OTHER_ID, amount: 0, share: 0, count: 0 },
  );
  return [...head, { ...other, amount: round2(other.amount) }];
}

export interface MonthPoint {
  key: string;
  income: number;
  expense: number;
  net: number;
}

/** Income, expense and net for each month key (in the order given). */
export function monthlySeries(transactions: Transaction[], keys: string[]): MonthPoint[] {
  const buckets = new Map(keys.map((key) => [key, { income: 0, expense: 0 }]));
  for (const t of transactions) {
    const bucket = buckets.get(monthKey(t.date));
    if (!bucket) continue;
    if (t.type === 'income') bucket.income += t.amount;
    else if (t.type === 'expense') bucket.expense += t.amount;
  }
  return keys.map((key) => {
    const { income, expense } = buckets.get(key)!;
    return { key, income: round2(income), expense: round2(expense), net: round2(income - expense) };
  });
}

export type BudgetStatus = 'ok' | 'warning' | 'over';

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  /** spent / limit */
  ratio: number;
  status: BudgetStatus;
}

/** Budgets at or above this share of their limit are flagged as nearly used up. */
export const BUDGET_WARNING_RATIO = 0.8;

export function budgetProgress(budgets: Budget[], transactions: Transaction[], key: string) {
  const { start, end } = monthBounds(key);
  const spentByCategory = new Map(categoryBreakdown(transactions, { type: 'expense', start, end }).map((i) => [i.categoryId, i.amount]));
  const items: BudgetProgress[] = budgets
    .filter((b) => b.month === key)
    .map((budget) => {
      const spent = spentByCategory.get(budget.category) ?? 0;
      const ratio = budget.limit > 0 ? spent / budget.limit : spent > 0 ? Infinity : 0;
      const status: BudgetStatus = spent > budget.limit ? 'over' : ratio >= BUDGET_WARNING_RATIO ? 'warning' : 'ok';
      return { budget, spent, remaining: round2(budget.limit - spent), ratio, status };
    });
  return {
    items,
    totalLimit: round2(items.reduce((sum, i) => sum + i.budget.limit, 0)),
    totalSpent: round2(items.reduce((sum, i) => sum + i.spent, 0)),
  };
}

/** Running total of a transaction type for every day of a month. */
export function dailyCumulative(transactions: Transaction[], key: string, type: CategoryType = 'expense') {
  const perDay = new Array<number>(daysInMonth(key)).fill(0);
  for (const t of transactions) {
    if (t.type === type && monthKey(t.date) === key) perDay[Number(t.date.slice(8, 10)) - 1] += t.amount;
  }
  let running = 0;
  return perDay.map((amount, i) => {
    running += amount;
    return { day: i + 1, total: round2(running) };
  });
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Average spending per weekday (Mon–Sun), dividing by how many of each weekday the range contains. */
export function weekdayAverages(transactions: Transaction[], start: string, end: string) {
  const mondayFirst = (iso: string) => (parseLocal(iso).getDay() + 6) % 7;
  const totals = new Array<number>(7).fill(0);
  const occurrences = new Array<number>(7).fill(0);
  for (let day = start; day <= end; day = addDays(day, 1)) occurrences[mondayFirst(day)]++;
  for (const t of transactions) {
    if (t.type === 'expense' && inRange(t, start, end)) totals[mondayFirst(t.date)] += t.amount;
  }
  return WEEKDAYS.map((label, i) => ({
    label,
    total: round2(totals[i]),
    average: occurrences[i] ? round2(totals[i] / occurrences[i]) : 0,
  }));
}
