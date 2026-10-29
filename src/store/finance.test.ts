import { beforeEach, describe, expect, it } from 'vitest';
import { accountBalances } from '@/lib/finance';
import type { CreditCard, FinanceData } from '@/lib/types';
import { STATEMENT_ACCOUNT } from '@/lib/statement/types';
import { useFinance } from './finance';

const hdfc: CreditCard = {
  id: 'c1',
  name: 'HDFC Millennia',
  limit: 150000,
  outstanding: 23480,
  minDue: 1180,
  dueDate: '2026-11-03',
  interestRate: 42,
  last4: '4417',
};

const fixture = (): FinanceData => ({
  transactions: [
    { id: 't1', type: 'expense', amount: 400, date: '2026-10-02', category: 'snacks', account: 'cash', note: 'Samosa' },
    { id: 't2', type: 'income', amount: 50000, date: '2026-10-01', category: 'salary', account: 'bank', note: '' },
    { id: 't3', type: 'transfer', amount: 2000, date: '2026-10-03', category: '', account: 'bank', toAccount: 'cash', note: '' },
  ],
  accounts: [
    { id: 'bank', name: 'Bank', type: 'bank', balance: 0 },
    { id: 'cash', name: 'Cash', type: 'cash', balance: 0 },
    { id: 'upi', name: 'UPI', type: 'upi', balance: 0 },
  ],
  categories: [
    { id: 'snacks', name: 'Snacks', icon: 'coffee', color: 'orange', type: 'expense' },
    { id: 'other-expense', name: 'Other', icon: 'tag', color: 'slate', type: 'expense' },
    { id: 'emi', name: 'EMI & Loans', icon: 'landmark', color: 'red', type: 'expense' },
    { id: 'bills', name: 'Bills & Utilities', icon: 'zap', color: 'yellow', type: 'expense' },
    { id: 'salary', name: 'Salary', icon: 'briefcase', color: 'green', type: 'income' },
  ],
  budgets: [
    { id: 'b1', category: 'snacks', month: '2026-10', limit: 1000 },
    { id: 'b2', category: 'emi', month: '2026-09', limit: 20000 },
    { id: 'b3', category: 'snacks', month: '2026-09', limit: 800 },
  ],
  goals: [{ id: 'g1', name: 'Bike', target: 90000, current: 1000, deadline: '2027-06-01' }],
  loans: [{ id: 'l1', name: 'Phone', principal: 30000, emi: 2700, interestRate: 14, remainingTenure: 10, nextDue: '2026-11-05' }],
  creditCards: [hdfc],
});

const state = () => useFinance.getState();

beforeEach(() => state().replaceAll(fixture()));

describe('accounts', () => {
  it('refuses to delete an account that transactions still use, including as a transfer target', () => {
    expect(state().deleteAccount('cash')).toBe(false);
    expect(state().accounts.map((a) => a.id)).toContain('cash');
  });

  it('deletes an unused account', () => {
    expect(state().deleteAccount('upi')).toBe(true);
    expect(state().accounts.map((a) => a.id)).toEqual(['bank', 'cash']);
  });
});

describe('categories', () => {
  it('moves a deleted category’s transactions to Other and drops its budgets', () => {
    state().deleteCategory('snacks');
    expect(state().transactions.find((t) => t.id === 't1')?.category).toBe('other-expense');
    expect(state().budgets.map((b) => b.id)).toEqual(['b2']);
    expect(state().categories.map((c) => c.id)).not.toContain('snacks');
  });
});

describe('budgets', () => {
  it('keeps one budget per category and month', () => {
    state().setBudget('snacks', '2026-10', 1500);
    const october = state().budgets.filter((b) => b.month === '2026-10');
    expect(october).toEqual([{ id: 'b1', category: 'snacks', month: '2026-10', limit: 1500 }]);
  });

  it('copies last month’s budgets without overwriting ones already set', () => {
    expect(state().copyBudgets('2026-09', '2026-10')).toBe(1);
    const october = state().budgets.filter((b) => b.month === '2026-10');
    expect(october.map((b) => [b.category, b.limit])).toEqual([
      ['snacks', 1000],
      ['emi', 20000],
    ]);
  });
});

describe('loans', () => {
  it('marks an EMI paid and records it as an expense from the chosen account', () => {
    state().payEmi('l1', { accountId: 'bank', date: '2026-11-05' });
    expect(state().loans[0]).toMatchObject({ remainingTenure: 9, nextDue: '2026-12-05' });
    expect(state().transactions[0]).toMatchObject({
      type: 'expense',
      amount: 2700,
      date: '2026-11-05',
      category: 'emi',
      account: 'bank',
      note: 'Phone EMI',
    });
  });

  it('can mark an EMI paid without recording a transaction', () => {
    state().payEmi('l1');
    expect(state().loans[0].remainingTenure).toBe(9);
    expect(state().transactions).toHaveLength(3);
  });
});

describe('goals and transactions', () => {
  it('never lets a goal balance go below zero', () => {
    state().contributeToGoal('g1', -5000);
    expect(state().goals[0].current).toBe(0);
  });

  it('can undo a deleted transaction', () => {
    const removed = state().deleteTransaction('t2');
    expect(state().transactions.map((t) => t.id)).toEqual(['t1', 't3']);
    state().restoreTransaction(removed!);
    expect(
      state()
        .transactions.map((t) => t.id)
        .sort(),
    ).toEqual(['t1', 't2', 't3']);
  });

  it('starts fresh with default categories and accounts and no sample flag', () => {
    state().startFresh();
    const s = state();
    expect([s.transactions, s.budgets, s.goals, s.loans, s.creditCards]).toEqual([[], [], [], [], []]);
    expect(s.categories.some((c) => c.id === 'salary')).toBe(true);
    expect(s.accounts.map((a) => a.type).sort()).toEqual(['bank', 'cash', 'upi']);
    expect(s.isSample).toBe(false);
  });
});

describe('statement import', () => {
  const rows = [
    { type: 'income' as const, amount: 50000, date: '2026-10-05', category: 'salary', account: STATEMENT_ACCOUNT, note: 'Acme Labs' },
    {
      type: 'transfer' as const,
      amount: 2000,
      date: '2026-10-06',
      category: '',
      account: STATEMENT_ACCOUNT,
      toAccount: 'cash',
      note: 'ATM withdrawal',
    },
    { type: 'expense' as const, amount: 450.5, date: '2026-10-07', category: 'snacks', account: STATEMENT_ACCOUNT, note: 'Zomato' },
  ];
  const balances = () => accountBalances(state().accounts, state().transactions);

  it('adds every row to the chosen account in one step, newest first', () => {
    const receipt = state().importStatement({ account: 'bank', transactions: rows });
    expect(receipt).toMatchObject({ accountId: 'bank', createdAccount: false });
    expect(receipt.ids).toHaveLength(3);
    const added = state().transactions.slice(0, 3);
    expect(added.map((t) => [t.note, t.account, t.toAccount])).toEqual([
      ['Zomato', 'bank', undefined],
      ['ATM withdrawal', 'bank', 'cash'],
      ['Acme Labs', 'bank', undefined],
    ]);
    expect(state().transactions).toHaveLength(6);
  });

  it('can create the account, opening it at the statement’s opening balance', () => {
    const receipt = state().importStatement({ account: { name: 'HDFC Bank ••5678', type: 'bank', balance: 10000 }, transactions: rows });
    expect(receipt.createdAccount).toBe(true);
    expect(state().accounts.find((a) => a.id === receipt.accountId)?.name).toBe('HDFC Bank ••5678');
    // 10,000 + 50,000 − 2,000 − 450.50
    expect(balances()[receipt.accountId]).toBe(57549.5);
  });

  it('undo removes the rows and the account it created', () => {
    const receipt = state().importStatement({ account: { name: 'HDFC Bank ••5678', type: 'bank', balance: 10000 }, transactions: rows });
    state().undoImport(receipt);
    expect(state().transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(state().accounts.map((a) => a.id)).toEqual(['bank', 'cash', 'upi']);
  });

  it('can set an existing account’s opening balance, and undo puts it back', () => {
    const receipt = state().importStatement({ account: 'upi', openingBalance: 1200, transactions: rows });
    expect(state().accounts.find((a) => a.id === 'upi')?.balance).toBe(1200);
    state().undoImport(receipt);
    expect(state().accounts.find((a) => a.id === 'upi')?.balance).toBe(0);
    expect(state().transactions).toHaveLength(3);
  });

  it('can replace the sample data, and undo brings the sample back', () => {
    state().replaceAll(fixture(), true);
    const receipt = state().importStatement({ account: 'bank', transactions: rows, fresh: true });
    expect(state().isSample).toBe(false);
    expect(state().transactions.map((t) => t.note)).toEqual(['Zomato', 'ATM withdrawal', 'Acme Labs']);
    expect(state().goals).toEqual([]);
    expect(state().creditCards).toEqual([]);
    state().undoImport(receipt);
    expect(state().isSample).toBe(true);
    expect(state().transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(state().goals).toHaveLength(1);
    expect(state().creditCards).toEqual([hdfc]);
  });
});

describe('credit cards', () => {
  const bill = {
    id: 't4',
    type: 'expense' as const,
    amount: 23480,
    date: '2026-10-28',
    category: 'bills',
    account: 'bank',
    note: 'NEFT to card',
  };
  const card = () => state().creditCards.find((c) => c.id === 'c1');
  const txn = (id: string) => state().transactions.find((t) => t.id === id);
  const balances = () => accountBalances(state().accounts, state().transactions);

  beforeEach(() => state().replaceAll({ ...fixture(), transactions: [...fixture().transactions, bill] }));

  it('adds and updates a card', () => {
    const sbi = { name: 'SBI SimplyCLICK', limit: 80000, outstanding: 6240, minDue: 320, dueDate: '2026-11-18', interestRate: 42 };
    const id = state().addCreditCard(sbi);
    state().updateCreditCard(id, { ...sbi, limit: 90000, last4: '9023' });
    expect(state().creditCards.map((c) => [c.id, c.name, c.limit, c.last4])).toEqual([
      ['c1', 'HDFC Millennia', 150000, '4417'],
      [id, 'SBI SimplyCLICK', 90000, '9023'],
    ]);
  });

  it('deleting a card unlinks its transactions but keeps them', () => {
    state().linkCardTransaction('t4', 'c1');
    state().linkCardTransaction('t1', null);
    state().deleteCreditCard('c1');
    expect(state().creditCards).toEqual([]);
    expect(txn('t4')).toEqual(bill);
    expect(txn('t1')?.creditCardId).toBeNull();
  });

  it('links a transaction, marks it not a card payment, or hands it back to automatic matching — returning the previous link', () => {
    expect(state().linkCardTransaction('t4', 'c1')).toBeUndefined();
    expect(txn('t4')?.creditCardId).toBe('c1');
    expect(state().linkCardTransaction('t4', null)).toBe('c1');
    expect(txn('t4')?.creditCardId).toBeNull();
    expect(state().linkCardTransaction('t4', undefined)).toBeNull();
    expect(txn('t4')).toEqual(bill);
  });

  it('records a payment that is already in your transactions by linking it: nothing is added and balances stay the same', () => {
    const before = balances();
    state().payCreditCard('c1', { amount: 23480, date: '2026-10-28', transactionId: 't4' });
    expect(card()).toMatchObject({ outstanding: 0, minDue: 0 });
    expect(state().transactions).toHaveLength(4);
    expect(txn('t4')?.creditCardId).toBe('c1');
    expect(balances()).toEqual(before);
  });

  it('can record a payment as one new expense from an account, linked to the card', () => {
    state().payCreditCard('c1', { amount: 5000, date: '2026-10-29', accountId: 'bank' });
    expect(state().transactions).toHaveLength(5);
    expect(state().transactions[0]).toMatchObject({
      type: 'expense',
      amount: 5000,
      date: '2026-10-29',
      category: 'bills',
      account: 'bank',
      note: 'HDFC Millennia bill',
      creditCardId: 'c1',
    });
    // 23,480 − 5,000, and the 1,180 minimum is covered
    expect(card()).toMatchObject({ outstanding: 18480, minDue: 0 });
  });

  it('lowers the minimum due by a part payment, and never takes anything below zero', () => {
    state().payCreditCard('c1', { amount: 1000, date: '2026-10-29' });
    expect(card()).toMatchObject({ outstanding: 22480, minDue: 180 });
    state().payCreditCard('c1', { amount: 30000, date: '2026-10-30' });
    expect(card()).toMatchObject({ outstanding: 0, minDue: 0 });
    expect(state().transactions).toHaveLength(4);
  });

  it('files a new payment under Other once Bills & Utilities is deleted', () => {
    state().deleteCategory('bills');
    state().payCreditCard('c1', { amount: 5000, date: '2026-10-29', accountId: 'bank' });
    expect(state().transactions[0].category).toBe('other-expense');
  });

  it('undo puts the card’s numbers back and removes the added expense', () => {
    const receipt = state().payCreditCard('c1', { amount: 5000, date: '2026-10-29', accountId: 'bank' });
    state().undoCardPayment(receipt!);
    expect(card()).toEqual(hdfc);
    expect(state().transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('undo of a linked payment restores the previous link', () => {
    state().linkCardTransaction('t4', null);
    const receipt = state().payCreditCard('c1', { amount: 23480, date: '2026-10-28', transactionId: 't4' });
    state().undoCardPayment(receipt!);
    expect(card()).toEqual(hdfc);
    expect(txn('t4')?.creditCardId).toBeNull();
  });

  it('refuses a payment of nothing or to a card that doesn’t exist', () => {
    expect(state().payCreditCard('gone', { amount: 100, date: '2026-10-29', accountId: 'bank' })).toBeNull();
    expect(state().payCreditCard('c1', { amount: 0, date: '2026-10-29', accountId: 'bank' })).toBeNull();
    expect(card()).toEqual(hdfc);
    expect(state().transactions).toHaveLength(4);
  });

  it('keeps a transaction’s card link when it is edited', () => {
    state().linkCardTransaction('t4', 'c1');
    // What the edit form sends: every field but the id and the link
    const draft = {
      type: 'expense' as const,
      amount: 23480,
      date: '2026-10-28',
      category: 'bills',
      account: 'bank',
      note: 'HDFC card payment',
    };
    state().updateTransaction('t4', draft);
    expect(txn('t4')).toMatchObject({ note: 'HDFC card payment', creditCardId: 'c1' });
  });
});
