import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup } from './backup';
import type { FinanceData } from './types';

const data: FinanceData = {
  transactions: [{ id: 't1', type: 'expense', amount: 250, date: '2026-10-02', category: 'food', account: 'cash', note: 'Chai' }],
  accounts: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 1000 }],
  categories: [{ id: 'food', name: 'Food', icon: 'utensils', color: 'orange', type: 'expense' }],
  budgets: [{ id: 'b1', category: 'food', month: '2026-10', limit: 5000 }],
  goals: [{ id: 'g1', name: 'Bike', target: 90000, current: 1000, deadline: '2027-06-01' }],
  loans: [{ id: 'l1', name: 'Phone', principal: 30000, emi: 2700, interestRate: 14, remainingTenure: 10, nextDue: '2026-11-05' }],
};

describe('backup round trip', () => {
  it('restores exactly what was backed up', () => {
    const result = parseBackup(createBackup(data, '2026-10-28T10:00:00.000Z'));
    expect(result).toEqual({ ok: true, data });
  });

  it('fills in collections missing from older backups', () => {
    const minimal = JSON.stringify({ app: 'fintrack', version: 1, data: { transactions: [], accounts: [], categories: [] } });
    expect(parseBackup(minimal)).toEqual({
      ok: true,
      data: { transactions: [], accounts: [], categories: [], budgets: [], goals: [], loans: [] },
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

  it('rejects impossible dates and unknown transaction types', () => {
    const badDate = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    badDate.data.transactions[0].date = '28/10/2026';
    expect(parseBackup(JSON.stringify(badDate)).ok).toBe(false);

    const badType = JSON.parse(createBackup(data, '2026-10-28T10:00:00.000Z'));
    badType.data.transactions[0].type = 'refund';
    expect(parseBackup(JSON.stringify(badType)).ok).toBe(false);
  });
});
