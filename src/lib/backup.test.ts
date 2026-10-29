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
      data: { transactions: [], accounts: [], categories: [], budgets: [], goals: [], loans: [], creditCards: [] },
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
