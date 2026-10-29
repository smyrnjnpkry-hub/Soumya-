import { round2 } from './format';
import type { Account, Category, Transaction, TransactionType } from './types';

export interface TransactionFilters {
  query?: string;
  type?: TransactionType | 'all';
  categoryId?: string;
  accountId?: string;
  /** Inclusive 'YYYY-MM-DD' bounds */
  from?: string;
  to?: string;
}

export interface Lookup {
  categories: Record<string, Category>;
  accounts: Record<string, Account>;
}

export function filterTransactions(transactions: Transaction[], filters: TransactionFilters, lookup: Lookup): Transaction[] {
  const query = filters.query?.trim().toLowerCase() ?? '';
  return transactions.filter((t) => {
    if (filters.type && filters.type !== 'all' && t.type !== filters.type) return false;
    if (filters.categoryId && t.category !== filters.categoryId) return false;
    if (filters.accountId && t.account !== filters.accountId && t.toAccount !== filters.accountId) return false;
    if (filters.from && t.date < filters.from) return false;
    if (filters.to && t.date > filters.to) return false;
    if (!query) return true;
    const haystack = [
      t.note,
      lookup.categories[t.category]?.name,
      lookup.accounts[t.account]?.name,
      t.toAccount ? lookup.accounts[t.toAccount]?.name : '',
      String(t.amount),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** Newest first; Array.sort is stable so same-day items keep their stored order. */
export function sortByDateDesc(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface DayGroup {
  date: string;
  items: Transaction[];
  income: number;
  expense: number;
}

export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of sortByDateDesc(transactions)) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== t.date) {
      group = { date: t.date, items: [], income: 0, expense: 0 };
      groups.push(group);
    }
    group.items.push(t);
    if (t.type === 'income') group.income = round2(group.income + t.amount);
    else if (t.type === 'expense') group.expense = round2(group.expense + t.amount);
  }
  return groups;
}
