import { describe, expect, it } from 'vitest';
import { toCSV, transactionsToCSV } from './csv';
import type { Account, Category, Transaction } from './types';

describe('toCSV', () => {
  it('quotes cells containing commas, quotes or line breaks (RFC 4180)', () => {
    expect(
      toCSV([
        ['a', 'b'],
        ['c,d', 'e"f'],
        ['line\nbreak', ''],
      ]),
    ).toBe('a,b\r\n"c,d","e""f"\r\n"line\nbreak",');
  });
});

describe('transactionsToCSV', () => {
  const categories: Record<string, Category> = {
    salary: { id: 'salary', name: 'Salary', icon: 'briefcase', color: 'green', type: 'income' },
    food: { id: 'food', name: 'Food & Dining', icon: 'utensils', color: 'orange', type: 'expense' },
  };
  const accounts: Record<string, Account> = {
    bank: { id: 'bank', name: 'HDFC Bank', type: 'bank', balance: 0 },
    cash: { id: 'cash', name: 'Cash', type: 'cash', balance: 0 },
  };
  const transactions: Transaction[] = [
    { id: '1', type: 'expense', amount: 99.5, date: '2026-10-02', category: 'food', account: 'cash', note: '=HYPERLINK("x")' },
    { id: '2', type: 'income', amount: 60000, date: '2026-10-01', category: 'salary', account: 'bank', note: 'October salary' },
    { id: '3', type: 'transfer', amount: 2000, date: '2026-09-28', category: '', account: 'bank', toAccount: 'cash', note: 'ATM' },
    { id: '4', type: 'expense', amount: 300, date: '2026-10-03', category: 'deleted-cat', account: 'cash', note: '' },
  ];

  it('exports one chronological row per transaction with readable names', () => {
    const lines = transactionsToCSV(transactions, { categories, accounts }).split('\r\n');
    expect(lines).toEqual([
      'Date,Type,Category,Account,To account,Amount (INR),Note',
      '2026-09-28,Transfer,,HDFC Bank,Cash,2000,ATM',
      '2026-10-01,Income,Salary,HDFC Bank,,60000,October salary',
      `2026-10-02,Expense,Food & Dining,Cash,,99.5,"'=HYPERLINK(""x"")"`,
      '2026-10-03,Expense,Uncategorized,Cash,,300,',
    ]);
  });
});
