import { describe, expect, it } from 'vitest';
import { cardActivity } from './cards';
import { budgetProgress, monthTotals } from './finance';
import { entrySummary } from './lending';
import { buildInsights } from './insights';
import { createSampleData, isSampleTransaction } from './seed';

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

  it('includes two credit cards, each with a monthly bill from the bank that matches it automatically', () => {
    expect(data.creditCards.map((c) => [c.name, c.last4, c.limit, c.outstanding, c.minDue, c.dueDate, c.interestRate])).toEqual([
      ['HDFC Millennia', '4417', 150000, 23480, 1180, '2026-11-03', 42],
      ['SBI SimplyCLICK', '9023', 80000, 6240, 320, '2026-11-18', 42],
    ]);
    for (const card of data.creditCards) {
      const activity = cardActivity(card, data.creditCards, data.transactions);
      expect(
        activity.map((a) => a.transaction.date.slice(0, 7)),
        card.name,
      ).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
      expect(activity.every((a) => a.match === 'matched' && a.transaction.category === 'bills' && a.transaction.account === 'bank')).toBe(
        true,
      );
    }
  });

  it('keeps Bills within budget with the card bills in it', () => {
    for (const month of ['2026-09', '2026-10']) {
      const bills = budgetProgress(data.budgets, data.transactions, month).items.find((i) => i.budget.category === 'bills');
      expect(bills?.status, month).toBe('ok');
    }
  });

  it('includes someone you lent to at monthly interest, whose interest arrives as linked bank transactions', () => {
    const [ramesh] = data.lentBorrowed;
    expect(ramesh).toMatchObject({
      person: 'Ramesh (cousin)',
      direction: 'lent',
      principal: 50000,
      interestType: 'monthly',
      interestRate: 1.5,
      startDate: '2026-02-10',
      dueDay: 10,
    });
    const linked = ramesh.payments.map((p) => data.transactions.find((t) => t.id === p.linkedTransactionId));
    // Mar–Sep paid; Mar is from before the sample's history, so it has no bank transaction
    expect(ramesh.payments.map((p) => [p.date, p.type, p.interestPortion])).toEqual(
      ['2026-03-10', '2026-04-10', '2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10'].map((d) => [d, 'interest', 750]),
    );
    expect(linked.map((t) => (t ? [t.type, t.amount, t.category, t.account] : null))).toEqual([
      null,
      ...Array(6).fill(['income', 750, 'interest', 'bank']),
    ]);
    // October's ₹750 hasn't come in
    expect(entrySummary(ramesh, TODAY)).toMatchObject({
      owed: 50000,
      due: { kind: 'interest', date: '2026-10-10', amount: 750 },
      dueSoon: true,
    });
  });

  it('includes money you borrowed and partly paid back, which moves the bank balance but isn’t income or spending', () => {
    const [, priya] = data.lentBorrowed;
    expect(priya).toMatchObject({
      person: 'Priya (sister)',
      direction: 'borrowed',
      principal: 10000,
      interestType: 'none',
      startDate: '2026-07-28',
      dueDate: '2026-11-30',
    });
    const start = data.transactions.find((t) => t.id === priya.startTransactionId);
    const repaid = data.transactions.find((t) => t.id === priya.payments[0].linkedTransactionId);
    expect([start?.type, start?.amount, start?.principalPart, repaid?.type, repaid?.amount, repaid?.principalPart]).toEqual([
      'income',
      10000,
      10000,
      'expense',
      4000,
      4000,
    ]);
    expect(repaid?.date).toBe('2026-09-28');
    expect(entrySummary(priya, TODAY).owed).toBe(6000);
    expect([monthTotals([start!], '2026-07').income, monthTotals([repaid!], '2026-09').expense]).toEqual([0, 0]);
  });

  it('marks its transactions so they can be told apart from ones you add', () => {
    expect(data.transactions.every(isSampleTransaction)).toBe(true);
    expect(isSampleTransaction({ ...data.transactions[0], id: '3f2b6c1e-9d7a-4e4b-8a51-0c2d9e7f6a11' })).toBe(false);
  });
});
