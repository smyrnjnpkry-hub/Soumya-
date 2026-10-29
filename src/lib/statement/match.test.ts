import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { markDuplicates } from './match';

const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: Math.random().toString(36),
  category: t.type === 'transfer' ? '' : 'food',
  account: 'bank',
  note: '',
  ...t,
});

describe('markDuplicates', () => {
  it('flags rows already recorded for the account, matching each existing transaction once', () => {
    const existing = [
      tx({ type: 'expense', amount: 450.5, date: '2026-04-03' }),
      tx({ type: 'income', amount: 50000, date: '2026-04-02' }),
      tx({ type: 'expense', amount: 10, date: '2026-04-05' }),
    ];
    const rows = [
      { date: '2026-04-02', amount: 50000, direction: 'credit' as const },
      { date: '2026-04-03', amount: 450.5, direction: 'debit' as const },
      { date: '2026-04-05', amount: 10, direction: 'debit' as const }, // two identical ₹10 payments that day…
      { date: '2026-04-05', amount: 10, direction: 'debit' as const }, // …but only one is recorded
      { date: '2026-04-03', amount: 450.5, direction: 'credit' as const }, // same amount, other direction
    ];
    expect(markDuplicates(rows, existing, 'bank')).toEqual([true, true, true, false, false]);
  });

  it('only compares with the chosen account, counting transfers on either side', () => {
    const existing = [
      tx({ type: 'expense', amount: 200, date: '2026-04-03', account: 'upi' }),
      tx({ type: 'transfer', amount: 2000, date: '2026-04-18', account: 'bank', toAccount: 'cash' }),
      tx({ type: 'transfer', amount: 500, date: '2026-04-20', account: 'cash', toAccount: 'bank' }),
    ];
    const rows = [
      { date: '2026-04-03', amount: 200, direction: 'debit' as const },
      { date: '2026-04-18', amount: 2000, direction: 'debit' as const },
      { date: '2026-04-20', amount: 500, direction: 'credit' as const },
    ];
    expect(markDuplicates(rows, existing, 'bank')).toEqual([false, true, true]);
  });
});
