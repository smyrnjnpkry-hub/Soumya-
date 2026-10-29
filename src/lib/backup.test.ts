import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from './backup';
import type { FinanceData } from './types';

const data: FinanceData = {
  transactions: [
    { id: 't1', type: 'expense', amount: 250, date: '2026-10-02', category: 'food', account: 'cash', note: 'Chai' },
    {
      id: 't2',
      type: 'expense',
      amount: 23480,
      date: '2026-10-28',
      category: 'food',
      account: 'cash',
      note: 'NEFT to card',
      creditCardId: 'c1',
    },
    {
      id: 't3',
      type: 'expense',
      amount: 500,
      date: '2026-10-28',
      category: 'food',
      account: 'cash',
      note: 'Card bill',
      creditCardId: null,
    },
    {
      id: 't4',
      type: 'income',
      amount: 5200,
      date: '2026-10-12',
      category: 'food',
      account: 'cash',
      note: 'UPI from Ramesh',
      principalPart: 5000,
    },
    {
      id: 't5',
      type: 'expense',
      amount: 20000,
      date: '2026-08-02',
      category: 'food',
      account: 'cash',
      note: 'Lent to Ramesh',
      principalPart: 20000,
    },
  ],
  accounts: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 1000 }],
  categories: [{ id: 'food', name: 'Food', icon: 'utensils', color: 'orange', type: 'expense' }],
  budgets: [{ id: 'b1', category: 'food', month: '2026-10', limit: 5000 }],
  goals: [{ id: 'g1', name: 'Bike', target: 90000, current: 1000, deadline: '2027-06-01' }],
  loans: [{ id: 'l1', name: 'Phone', principal: 30000, emi: 2700, interestRate: 14, remainingTenure: 10, nextDue: '2026-11-05' }],
  creditCards: [
    {
      id: 'c1',
      name: 'HDFC Millennia',
      limit: 150000,
      outstanding: 23480,
      minDue: 1180,
      dueDate: '2026-11-03',
      interestRate: 42,
      last4: '4417',
    },
    { id: 'c2', name: 'Store card', limit: 20000, outstanding: 0, minDue: 0, dueDate: '2026-11-18', interestRate: 36 },
  ],
  lentBorrowed: [
    {
      id: 'lb1',
      person: 'Ramesh',
      phone: '98765 43210',
      note: 'Shop',
      direction: 'lent',
      principal: 20000,
      interestType: 'monthly',
      interestRate: 2,
      startDate: '2026-08-01',
      dueDay: 10,
      dueDate: '2027-02-01',
      remind: true,
      startTransactionId: 't5',
      addedStartTransaction: true,
      payments: [
        { id: 'p1', date: '2026-10-12', type: 'mixed', interestPortion: 200, principalPortion: 5000, linkedTransactionId: 't4' },
        { id: 'p2', date: '2026-10-20', type: 'correction', interestPortion: 0, principalPortion: -1000, note: 'Lent ₹1,000 more' },
        {
          id: 'p3',
          date: '2026-10-29',
          type: 'settlement',
          interestPortion: 100,
          principalPortion: 16000,
          waived: 50,
          addedTransaction: true,
          linkedTransactionId: 'gone',
        },
      ],
    },
    {
      id: 'lb2',
      person: 'Priya',
      direction: 'borrowed',
      principal: 10000,
      interestType: 'none',
      interestRate: 0,
      startDate: '2026-07-28',
      remind: false,
      payments: [],
    },
  ],
};

describe('backup round trip', () => {
  it('restores exactly what was backed up, cards and card links included', () => {
    const result = parseBackup(createBackup(data, '2026-10-28T10:00:00.000Z'));
    expect(result).toEqual({ ok: true, data });
  });

  it('fills in collections missing from older backups', () => {
    const minimal = JSON.stringify({ app: 'fintrack', version: 1, data: { transactions: [], accounts: [], categories: [] } });
    expect(parseBackup(minimal)).toEqual({
      ok: true,
      data: { transactions: [], accounts: [], categories: [], budgets: [], goals: [], loans: [], creditCards: [], lentBorrowed: [] },
    });
  });
});

describe('parseBackup rejects files it cannot trust', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('not json')).toMatchObject({ ok: false });
  });

  it('rejects JSON that is not a FinTrack backup', () => {
    expect(parseBackup(JSON.stringify({ hello: 'world' }))).toMatchObject({ ok: false });
  });

  it('rejects a backup with a malformed transaction, naming the problem', () => {
    const bad = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    bad.data.transactions[0].amount = '250';
    const result = parseBackup(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/transaction/i);
  });

  it.each([
    ['a limit that is not a number', { limit: '150000' }],
    ['a negative amount owed', { outstanding: -1 }],
    ['a due date that is not a date', { dueDate: '3 Nov' }],
    ['last 4 digits that are not 4 digits', { last4: '44171' }],
  ])('rejects a card with %s, naming the problem', (_, change) => {
    const bad = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    Object.assign(bad.data.creditCards[0], change);
    const result = parseBackup(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/card/i);
  });

  it.each([
    ['a direction that isn’t lent or borrowed', { direction: 'given' }],
    ['an amount that is not a number', { principal: '20000' }],
    ['an unknown kind of interest', { interestType: 'weekly' }],
    ['a due day past 31', { dueDay: 32 }],
    ['a history that isn’t a list', { payments: {} }],
    [
      'a payment of an unknown type',
      { payments: [{ id: 'p', date: '2026-10-12', type: 'gift', interestPortion: 0, principalPortion: 5 }] },
    ],
    [
      'a payment without a proper date',
      { payments: [{ id: 'p', date: '12/10/2026', type: 'interest', interestPortion: 5, principalPortion: 0 }] },
    ],
  ])('rejects someone lent to or borrowed from with %s, naming the problem', (_, change) => {
    const bad = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    Object.assign(bad.data.lentBorrowed[0], change);
    const result = parseBackup(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/lent|borrowed/i);
  });

  it.each([
    ['negative', -1],
    ['more than the amount', 5201],
    ['not a number', '5000'],
  ])('rejects a money-back part that is %s', (_, principalPart) => {
    const bad = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    bad.data.transactions[3].principalPart = principalPart;
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects a card link that is not a card id or null', () => {
    const bad = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    bad.data.transactions[1].creditCardId = 7;
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects impossible dates and unknown transaction types', () => {
    const badDate = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    badDate.data.transactions[0].date = '28/10/2026';
    expect(parseBackup(JSON.stringify(badDate)).ok).toBe(false);

    const badType = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    badType.data.transactions[0].type = 'refund';
    expect(parseBackup(JSON.stringify(badType)).ok).toBe(false);
  });
});
