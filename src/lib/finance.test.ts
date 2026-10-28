import { describe, expect, it } from 'vitest';
import {
  accountBalances,
  budgetProgress,
  categoryBreakdown,
  dailyCumulative,
  foldBreakdown,
  monthlySeries,
  monthTotals,
  OTHER_ID,
  savingsRate,
  totalBalance,
  weekdayAverages,
} from './finance';
import type { Account, Budget, Transaction } from './types';

const accounts: Account[] = [
  { id: 'bank', name: 'HDFC Bank', type: 'bank', balance: 10000 },
  { id: 'cash', name: 'Cash', type: 'cash', balance: 500 },
];

let seq = 0;
const tx = (
  date: string,
  type: Transaction['type'],
  amount: number,
  category: string,
  account = 'bank',
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `t${++seq}`,
  type,
  amount,
  date,
  category,
  account,
  note: '',
  ...extra,
});

const ledger: Transaction[] = [
  tx('2026-10-01', 'income', 50000, 'salary'),
  tx('2026-10-03', 'expense', 15000, 'rent'),
  tx('2026-10-04', 'expense', 1200, 'food', 'cash'),
  tx('2026-10-05', 'transfer', 2000, '', 'bank', { toAccount: 'cash' }),
  tx('2026-09-20', 'expense', 800, 'food'),
];

describe('account balances', () => {
  it('applies income, expenses and transfers to opening balances', () => {
    // bank: 10000 + 50000 - 15000 - 2000 (transfer out) - 800 = 42200
    // cash:   500 -  1200 + 2000 (transfer in) = 1300
    expect(accountBalances(accounts, ledger)).toEqual({ bank: 42200, cash: 1300 });
  });

  it('totals all accounts; transfers do not change net worth', () => {
    expect(totalBalance(accounts, ledger)).toBe(43500);
  });
});

describe('month totals', () => {
  it('sums income and expenses for the month, ignoring transfers and other months', () => {
    expect(monthTotals(ledger, '2026-10')).toEqual({
      income: 50000,
      expense: 16200,
      net: 33800,
      savingsRate: 0.676,
    });
  });

  it('has no savings rate when there is no income', () => {
    expect(savingsRate(0, 500)).toBeNull();
    expect(savingsRate(1000, 1250)).toBe(-0.25);
  });
});

describe('category breakdown', () => {
  it('ranks categories by amount with their share of the total', () => {
    const items = categoryBreakdown(ledger, { type: 'expense', start: '2026-10-01', end: '2026-10-31' });
    expect(items.map((i) => [i.categoryId, i.amount, i.count])).toEqual([
      ['rent', 15000, 1],
      ['food', 1200, 1],
    ]);
    expect(items[0].share).toBeCloseTo(0.9259, 4);
    expect(items[1].share).toBeCloseTo(0.0741, 4);
  });

  it('folds the tail into a single Other slice', () => {
    const items = [
      { categoryId: 'a', amount: 500, share: 0.5, count: 1 },
      { categoryId: 'b', amount: 300, share: 0.3, count: 2 },
      { categoryId: 'c', amount: 100, share: 0.1, count: 1 },
      { categoryId: 'd', amount: 60, share: 0.06, count: 1 },
      { categoryId: 'e', amount: 40, share: 0.04, count: 3 },
    ];
    const folded = foldBreakdown(items, 3);
    expect(folded.map((i) => i.categoryId)).toEqual(['a', 'b', OTHER_ID]);
    expect(folded[2]).toMatchObject({ amount: 200, count: 5 });
    expect(folded[2].share).toBeCloseTo(0.2, 6);
    expect(foldBreakdown(items.slice(0, 3), 3)).toHaveLength(3);
  });
});

describe('monthly series', () => {
  it('produces one point per month including empty months', () => {
    expect(monthlySeries(ledger, ['2026-08', '2026-09', '2026-10'])).toEqual([
      { key: '2026-08', income: 0, expense: 0, net: 0 },
      { key: '2026-09', income: 0, expense: 800, net: -800 },
      { key: '2026-10', income: 50000, expense: 16200, net: 33800 },
    ]);
  });
});

describe('budget progress', () => {
  const budgets: Budget[] = [
    { id: 'b1', category: 'food', month: '2026-10', limit: 1000 },
    { id: 'b2', category: 'rent', month: '2026-10', limit: 20000 },
    { id: 'b3', category: 'food', month: '2026-09', limit: 5000 },
    { id: 'b4', category: 'fuel', month: '2026-10', limit: 2000 },
  ];
  const extra = [tx('2026-10-10', 'expense', 1700, 'fuel'), tx('2026-10-11', 'expense', 300, 'fuel')];

  it('measures each budget of the month against that month’s spending', () => {
    const { items, totalLimit, totalSpent } = budgetProgress(budgets, [...ledger, ...extra], '2026-10');
    expect(items.map((i) => [i.budget.id, i.spent, i.remaining, i.status])).toEqual([
      ['b1', 1200, -200, 'over'],
      ['b2', 15000, 5000, 'ok'],
      ['b4', 2000, 0, 'warning'],
    ]);
    expect(items[0].ratio).toBeCloseTo(1.2, 6);
    expect(totalLimit).toBe(23000);
    expect(totalSpent).toBe(18200);
  });
});

describe('daily cumulative spending', () => {
  it('accumulates expenses day by day across the whole month', () => {
    const days = dailyCumulative(ledger, '2026-10');
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ day: 1, total: 0 });
    expect(days[2]).toEqual({ day: 3, total: 15000 });
    expect(days[3]).toEqual({ day: 4, total: 16200 });
    expect(days[30]).toEqual({ day: 31, total: 16200 });
  });
});

describe('weekday averages', () => {
  it('averages spending per weekday over the days that occurred in the range', () => {
    // 5–18 Oct 2026 is exactly two weeks, Monday to Sunday
    const txs = [
      tx('2026-10-05', 'expense', 100, 'food'), // Mon
      tx('2026-10-12', 'expense', 300, 'food'), // Mon
      tx('2026-10-10', 'expense', 1000, 'food'), // Sat
      tx('2026-10-11', 'income', 9999, 'salary'), // Sun — not spending
    ];
    const days = weekdayAverages(txs, '2026-10-05', '2026-10-18');
    expect(days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days[0]).toMatchObject({ total: 400, average: 200 });
    expect(days[5]).toMatchObject({ total: 1000, average: 500 });
    expect(days[6]).toMatchObject({ total: 0, average: 0 });
  });
});
