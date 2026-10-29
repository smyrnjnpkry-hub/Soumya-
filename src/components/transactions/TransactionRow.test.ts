import { expect, it } from 'vitest';
import type { LentBorrowed, Transaction } from '@/lib/types';
import { describe } from './TransactionRow';

const lookup = {
  categories: {
    'other-income': { id: 'other-income', name: 'Other Income', icon: 'coins', color: 'slate' as const, type: 'income' as const },
  },
  accounts: { bank: { id: 'bank', name: 'HDFC Savings', type: 'bank' as const, balance: 0 } },
};
const repaid: Transaction = {
  id: 't1',
  type: 'income',
  amount: 5200,
  date: '2026-10-12',
  category: 'other-income',
  account: 'bank',
  note: 'UPI from Ramesh',
};
const ramesh: LentBorrowed = {
  id: 'ramesh',
  person: 'Ramesh',
  direction: 'lent',
  principal: 20000,
  interestType: 'none',
  interestRate: 0,
  startDate: '2026-08-01',
  remind: true,
  payments: [],
};

it('labels a transaction that belongs to someone in Lent & Borrowed instead of showing its category', () => {
  expect(describe(repaid, { ...lookup, lending: new Map([['t1', ramesh]]) })).toEqual({
    title: 'UPI from Ramesh',
    subtitle: 'Lent & Borrowed · HDFC Savings',
  });
  expect(describe(repaid, lookup)).toEqual({ title: 'UPI from Ramesh', subtitle: 'Other Income · HDFC Savings' });
});
