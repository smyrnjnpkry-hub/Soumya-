import { describe, expect, it } from 'vitest';
import { filterTransactions, groupByDay, sortByDateDesc } from './transactions';
import type { Account, Category, Transaction } from './types';

const categories: Record<string, Category> = {
  food: { id: 'food', name: 'Food & Dining', icon: 'utensils', color: 'orange', type: 'expense' },
  salary: { id: 'salary', name: 'Salary', icon: 'briefcase', color: 'green', type: 'income' },
};
const accounts: Record<string, Account> = {
  bank: { id: 'bank', name: 'HDFC Bank', type: 'bank', balance: 0 },
  cash: { id: 'cash', name: 'Cash', type: 'cash', balance: 0 },
};
const lookup = { categories, accounts };

const t = (
  id: string,
  date: string,
  type: Transaction['type'],
  amount: number,
  category: string,
  account: string,
  note = '',
  toAccount?: string,
): Transaction => ({
  id,
  date,
  type,
  amount,
  category,
  account,
  note,
  toAccount,
});

const list: Transaction[] = [
  t('a', '2026-10-02', 'expense', 450, 'food', 'cash', 'Dosa at Vidyarthi Bhavan'),
  t('b', '2026-10-01', 'income', 60000, 'salary', 'bank', 'October salary'),
  t('c', '2026-10-02', 'expense', 1200, 'food', 'bank', 'Team lunch'),
  t('d', '2026-09-28', 'transfer', 2000, '', 'bank', 'ATM', 'cash'),
];

const ids = (txs: Transaction[]) => txs.map((x) => x.id);

describe('filterTransactions', () => {
  it('returns everything with no filters', () => {
    expect(ids(filterTransactions(list, {}, lookup))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('searches notes, category names, account names and amounts case-insensitively', () => {
    expect(ids(filterTransactions(list, { query: 'DOSA' }, lookup))).toEqual(['a']);
    expect(ids(filterTransactions(list, { query: 'food' }, lookup))).toEqual(['a', 'c']);
    expect(ids(filterTransactions(list, { query: 'hdfc' }, lookup))).toEqual(['b', 'c', 'd']);
    expect(ids(filterTransactions(list, { query: '1200' }, lookup))).toEqual(['c']);
  });

  it('filters by type, category and date range (inclusive)', () => {
    expect(ids(filterTransactions(list, { type: 'expense' }, lookup))).toEqual(['a', 'c']);
    expect(ids(filterTransactions(list, { categoryId: 'salary' }, lookup))).toEqual(['b']);
    expect(ids(filterTransactions(list, { from: '2026-10-01', to: '2026-10-01' }, lookup))).toEqual(['b']);
  });

  it('matches transfers on either side when filtering by account', () => {
    expect(ids(filterTransactions(list, { accountId: 'cash' }, lookup))).toEqual(['a', 'd']);
  });
});

describe('sortByDateDesc', () => {
  it('orders newest first and keeps insertion order within a day', () => {
    expect(ids(sortByDateDesc(list))).toEqual(['a', 'c', 'b', 'd']);
  });
});

describe('groupByDay', () => {
  it('groups by date, newest first, with day totals that ignore transfers', () => {
    const groups = groupByDay(list);
    expect(groups.map((g) => [g.date, ids(g.items), g.income, g.expense])).toEqual([
      ['2026-10-02', ['a', 'c'], 0, 1650],
      ['2026-10-01', ['b'], 60000, 0],
      ['2026-09-28', ['d'], 0, 0],
    ]);
  });
});
