import { describe, expect, it } from 'vitest';
import { buildInsights } from './insights';
import { createSampleData } from './seed';

const TODAY = '2026-10-28';

describe('createSampleData', () => {
  const data = createSampleData(TODAY);

  it('only references accounts and categories that exist, with matching types', () => {
    const accountIds = new Set(data.accounts.map((a) => a.id));
    const categoryType = new Map(data.categories.map((c) => [c.id, c.type]));
    for (const t of data.transactions) {
      expect(accountIds.has(t.account), `account of ${t.id}`).toBe(true);
      if (t.type === 'transfer') {
        expect(accountIds.has(t.toAccount ?? ''), `toAccount of ${t.id}`).toBe(true);
        expect(t.toAccount).not.toBe(t.account);
      } else {
        expect(categoryType.get(t.category), `category of ${t.id}`).toBe(t.type);
      }
    }
    for (const b of data.budgets) expect(categoryType.get(b.category)).toBe('expense');
  });

  it('never creates future-dated transactions and covers the last six months', () => {
    expect(data.transactions.every((t) => t.date <= TODAY)).toBe(true);
    const months = new Set(data.transactions.map((t) => t.date.slice(0, 7)));
    for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
      expect(months.has(m), m).toBe(true);
    }
  });

  it('uses unique ids and positive amounts', () => {
    const ids = data.transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.transactions.every((t) => t.amount > 0)).toBe(true);
  });

  it('is deterministic for a given date', () => {
    expect(createSampleData(TODAY)).toEqual(data);
  });

  it('gives the Insights screen something to say', () => {
    expect(buildInsights(data, TODAY).insights.length).toBeGreaterThanOrEqual(6);
  });
});
