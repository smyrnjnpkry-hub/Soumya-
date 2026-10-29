import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../defaults';
import type { Transaction } from '../types';
import { applyChoice, buildReview, planTransactions, statementAccountName, withDuplicates } from './plan';
import { STATEMENT_ACCOUNT, type ParsedStatement, type StatementRow } from './types';

const row = (date: string, direction: StatementRow['direction'], amount: number, narration: string): StatementRow => ({
  date,
  direction,
  amount,
  narration,
  ref: '',
  balance: null,
});

const rows = [
  row('2026-04-02', 'credit', 50000, 'NEFT CR-ICIC0000104-ACME LABS PVT LTD-ASHA VERMA-N0922612345 SALARY FOR MAR 2026'),
  row('2026-04-03', 'debit', 450.5, 'UPI-ZOMATO LTD-ZOMATO.RZP@HDFCBANK-HDFC0MERUPI-612345678901-PAY VIA RAZORPAY'),
  row('2026-04-18', 'debit', 2000, 'NWD-512345XXXXXX7788-00123456-NASHIK'),
];

const saved: Transaction = {
  id: 'x',
  type: 'expense',
  amount: 450.5,
  date: '2026-04-03',
  category: 'food',
  account: 'bank',
  note: 'Dinner',
};

describe('buildReview', () => {
  it('suggests a category and a short description for every row, and unticks rows already saved', () => {
    const review = buildReview(rows, { categories: DEFAULT_CATEGORIES, transactions: [saved], accountId: 'bank', cash: true });
    expect(review.map((r) => [r.note, r.choice, r.duplicate, r.selected])).toEqual([
      ['Acme Labs Pvt Ltd · Salary for Mar 2026', 'income:salary', false, true],
      ['Zomato Ltd', 'expense:food', true, false],
      ['ATM withdrawal · Nashik', 'transfer', false, true],
    ]);
  });

  it('falls back to Other when a suggested category no longer exists, or there is no Cash account', () => {
    const categories = DEFAULT_CATEGORIES.filter((c) => c.id !== 'food');
    const review = buildReview(rows, { categories, transactions: [], accountId: null, cash: false });
    expect(review.map((r) => r.choice)).toEqual(['income:salary', 'expense:other-expense', 'expense:other-expense']);
  });

  it('reuses the category you gave the same payee before', () => {
    const before: Transaction = { ...saved, id: 'y', date: '2026-01-01', note: 'Zomato Ltd', category: 'entertainment' };
    const review = buildReview(rows, { categories: DEFAULT_CATEGORIES, transactions: [before], accountId: 'bank', cash: true });
    expect(review[1].choice).toBe('expense:entertainment');
  });

  it('re-checks duplicates for another account', () => {
    const review = buildReview(rows, { categories: DEFAULT_CATEGORIES, transactions: [saved], accountId: 'bank', cash: true });
    expect(withDuplicates(review, [saved], 'upi').map((r) => r.selected)).toEqual([true, true, true]);
    expect(withDuplicates(review, [saved], null).map((r) => r.duplicate)).toEqual([false, false, false]);
  });
});

describe('applyChoice', () => {
  const ravi = (date: string, direction: StatementRow['direction'] = 'debit') =>
    row(date, direction, 100, 'UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-UPI SEND MONEY');
  const review = () =>
    buildReview([ravi('2026-04-01'), ravi('2026-04-02'), ravi('2026-04-03'), ravi('2026-04-04', 'credit'), rows[1]], {
      categories: DEFAULT_CATEGORIES,
      transactions: [],
      accountId: null,
      cash: true,
    });

  it('applies a category to the other rows with the same description and direction', () => {
    const { rows: next, alsoChanged } = applyChoice(review(), 0, 'expense:rent');
    expect(next.map((r) => r.choice)).toEqual(['expense:rent', 'expense:rent', 'expense:rent', 'income:other-income', 'expense:food']);
    expect(alsoChanged).toBe(2);
  });

  it('leaves rows you already changed yourself alone, and ticks the row you changed', () => {
    let current = review().map((r) => (r.id === 0 ? { ...r, selected: false } : r));
    current = applyChoice(current, 2, 'expense:personal').rows;
    const { rows: next, alsoChanged } = applyChoice(current, 0, 'expense:rent');
    expect(next.map((r) => r.choice)).toEqual(['expense:rent', 'expense:rent', 'expense:personal', 'income:other-income', 'expense:food']);
    expect(next[0].selected).toBe(true);
    expect(alsoChanged).toBe(1);
  });
});

describe('planTransactions', () => {
  it('turns ticked rows into transactions on the statement account, with ATM cash moved to Cash', () => {
    const review = buildReview(rows, { categories: DEFAULT_CATEGORIES, transactions: [saved], accountId: 'bank', cash: true });
    expect(planTransactions(review, 'cash')).toEqual([
      {
        type: 'income',
        amount: 50000,
        date: '2026-04-02',
        category: 'salary',
        account: STATEMENT_ACCOUNT,
        note: 'Acme Labs Pvt Ltd · Salary for Mar 2026',
      },
      {
        type: 'transfer',
        amount: 2000,
        date: '2026-04-18',
        category: '',
        account: STATEMENT_ACCOUNT,
        toAccount: 'cash',
        note: 'ATM withdrawal · Nashik',
      },
    ]);
  });

  it('records a cash deposit as a transfer from Cash into the statement account', () => {
    const review = buildReview([row('2026-04-20', 'credit', 500, 'CASH DEPOSIT BY SELF')], {
      categories: DEFAULT_CATEGORIES,
      transactions: [],
      accountId: null,
      cash: true,
    });
    expect(planTransactions(review, 'cash')).toEqual([
      {
        type: 'transfer',
        amount: 500,
        date: '2026-04-20',
        category: '',
        account: 'cash',
        toAccount: STATEMENT_ACCOUNT,
        note: 'Cash Deposit Self',
      },
    ]);
  });
});

describe('statementAccountName', () => {
  const statement = (bank: string | null, accountLast4: string | null) => ({ bank, accountLast4 }) as ParsedStatement;
  it('names the account after the bank and the last four digits', () => {
    expect(statementAccountName(statement('HDFC Bank', '5678'))).toBe('HDFC Bank ••5678');
    expect(statementAccountName(statement(null, '5678'))).toBe('Bank account ••5678');
    expect(statementAccountName(statement('State Bank of India', null))).toBe('State Bank of India');
  });
});
