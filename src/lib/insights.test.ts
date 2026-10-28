import { describe, expect, it } from 'vitest';
import { buildInsights, type Insight } from './insights';
import type { Budget, Category, FinanceData, Goal, Loan, Transaction } from './types';

const categories: Category[] = [
  { id: 'salary', name: 'Salary', icon: 'briefcase', color: 'green', type: 'income' },
  { id: 'rent', name: 'Rent', icon: 'house', color: 'violet', type: 'expense' },
  { id: 'food', name: 'Food', icon: 'utensils', color: 'orange', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: 'magenta', type: 'expense' },
];

let seq = 0;
const tx = (date: string, type: 'income' | 'expense', amount: number, category: string, note = ''): Transaction => ({
  id: `t${++seq}`,
  type,
  amount,
  date,
  category,
  account: 'bank',
  note,
});

/**
 * Hand-computed facts for TODAY = 2026-10-20 (day 20 of 31):
 *   Oct 1–20 spending 22,000 · Sep 1–20 spending 24,000 · Sep total 26,000 · Aug total 23,000
 *   Food 6,000 vs 5,000 (+20%) · Shopping 1,000 vs 4,000 (−75%) · Rent 15,000 vs 15,000
 *   Balance = 50,000 + 3×60,000 − (23,000 + 26,000 + 22,000) = 1,59,000
 */
const TODAY = '2026-10-20';
const base: Transaction[] = [
  tx('2026-08-01', 'income', 60000, 'salary'),
  tx('2026-08-03', 'expense', 15000, 'rent'),
  tx('2026-08-10', 'expense', 5000, 'food'),
  tx('2026-08-12', 'expense', 3000, 'shopping'),
  tx('2026-09-01', 'income', 60000, 'salary'),
  tx('2026-09-03', 'expense', 15000, 'rent'),
  tx('2026-09-10', 'expense', 2500, 'food'),
  tx('2026-09-12', 'expense', 4000, 'shopping'),
  tx('2026-09-15', 'expense', 2500, 'food'),
  tx('2026-09-25', 'expense', 2000, 'food'),
  tx('2026-10-01', 'income', 60000, 'salary'),
  tx('2026-10-03', 'expense', 15000, 'rent'),
  tx('2026-10-08', 'expense', 3000, 'food'),
  tx('2026-10-12', 'expense', 1000, 'shopping'),
  tx('2026-10-15', 'expense', 3000, 'food'),
];

const data = (overrides: Partial<FinanceData> = {}): FinanceData => ({
  transactions: base,
  accounts: [{ id: 'bank', name: 'Bank', type: 'bank', balance: 50000 }],
  categories,
  budgets: [],
  goals: [],
  loans: [],
  ...overrides,
});

const byId = (insights: Insight[], id: string) => insights.find((i) => i.id === id);

describe('buildInsights — period and spending analysis', () => {
  const report = buildInsights(data(), TODAY);

  it('compares month-to-date with the same days of last month', () => {
    expect(report.period).toMatchObject({
      monthKey: '2026-10',
      dayOfMonth: 20,
      daysInMonth: 31,
      currentStart: '2026-10-01',
      currentEnd: '2026-10-20',
      previousStart: '2026-09-01',
      previousEnd: '2026-09-20',
    });
    expect(report.spending.current).toBe(22000);
    expect(report.spending.previous).toBe(24000);
    expect(report.spending.lastMonthTotal).toBe(26000);
    expect(report.spending.changePct).toBeCloseTo(-0.0833, 4);
    expect(report.spending.avgDaily).toBe(1100);
  });

  it('projects month-end spending from last month’s pace', () => {
    // 22,000 × 26,000 / 24,000
    expect(report.spending.projected).toBeCloseTo(23833.33, 2);
  });

  it('reports the spending trend vs last month', () => {
    expect(byId(report.insights, 'spending-trend')).toMatchObject({
      tone: 'positive',
      title: 'Spending down 8% vs last month',
    });
  });

  it('flags categories that rose or fell meaningfully', () => {
    expect(byId(report.insights, 'category-up:food')).toMatchObject({
      tone: 'warning',
      title: 'Food spending increased by 20% compared to last month',
      categoryId: 'food',
    });
    expect(byId(report.insights, 'category-down:shopping')).toMatchObject({
      tone: 'positive',
      title: 'Shopping spending dropped 75%',
    });
    expect(byId(report.insights, 'category-up:rent')).toBeUndefined();
    expect(byId(report.insights, 'category-down:rent')).toBeUndefined();
  });

  it('does not celebrate a category that simply has no spending yet this month', () => {
    const withoutOctoberShopping = base.filter((t) => !(t.category === 'shopping' && t.date >= '2026-10-01'));
    const report = buildInsights(data({ transactions: withoutOctoberShopping }), TODAY);
    expect(byId(report.insights, 'category-down:shopping')).toBeUndefined();
  });

  it('names the highest expense category with its share', () => {
    expect(byId(report.insights, 'top-category')?.title).toBe('Highest expense category: Rent (68%)');
  });

  it('builds category trends with six months of history', () => {
    expect(report.categories.map((c) => [c.categoryId, c.current, c.previous])).toEqual([
      ['rent', 15000, 15000],
      ['food', 6000, 5000],
      ['shopping', 1000, 4000],
    ]);
    const food = report.categories[1];
    expect(food.changePct).toBeCloseTo(0.2, 6);
    expect(food.share).toBeCloseTo(6000 / 22000, 6);
    expect(food.history).toEqual([
      { key: '2026-05', amount: 0 },
      { key: '2026-06', amount: 0 },
      { key: '2026-07', amount: 0 },
      { key: '2026-08', amount: 5000 },
      { key: '2026-09', amount: 7000 },
      { key: '2026-10', amount: 6000 },
    ]);
  });
});

describe('buildInsights — savings and cash flow', () => {
  const report = buildInsights(data(), TODAY);

  it('reports the savings rate and the on-track savings for the month', () => {
    expect(report.savings.rate).toBeCloseTo(38000 / 60000, 6);
    expect(byId(report.insights, 'savings-rate')).toMatchObject({ tone: 'positive', title: 'You’re saving 63% of your income' });
    // 60,000 income − 23,833.33 projected spending
    expect(report.savings.projected).toBeCloseTo(36166.67, 2);
    expect(byId(report.insights, 'savings-projection')?.title).toBe('You’re on track to save ₹36,167 this month');
  });

  it('counts consecutive positive months of net cash flow', () => {
    expect(report.cashFlow.positiveStreak).toBe(2);
    expect(byId(report.insights, 'cashflow-streak')?.title).toBe('Net cash flow has been positive for the last 2 months');
  });

  it('rates cash-flow health and the emergency runway', () => {
    expect(report.cashFlow.health).toBe('healthy');
    // 1,59,000 balance ÷ average of Aug (23,000) and Sep (26,000)
    expect(report.cashFlow.runwayMonths).toBeCloseTo(159000 / 24500, 6);
    expect(byId(report.insights, 'runway')).toMatchObject({ tone: 'positive', title: 'Your balance covers 6.5 months of expenses' });
  });

  it('warns when spending exceeds income', () => {
    const overspent = buildInsights(data({ transactions: [...base, tx('2026-10-18', 'expense', 50000, 'shopping')] }), TODAY);
    expect(byId(overspent.insights, 'savings-rate')).toMatchObject({ tone: 'negative', title: 'You’ve spent more than you earned' });
    expect(byId(overspent.insights, 'savings-projection')?.tone).toBe('negative');
  });
});

describe('buildInsights — alerts', () => {
  it('raises an alert (instead of a trend) for a large category spike', () => {
    const report = buildInsights(data({ transactions: [...base, tx('2026-10-18', 'expense', 1500, 'food')] }), TODAY);
    expect(byId(report.insights, 'category-spike:food')).toMatchObject({
      kind: 'alert',
      tone: 'negative',
      title: 'You spent 50% more on Food this month',
    });
    expect(byId(report.insights, 'category-up:food')).toBeUndefined();
  });

  it('explains a spike caused by one big purchase inside the spike alert instead of repeating it', () => {
    const report = buildInsights(
      data({
        transactions: [
          ...base,
          tx('2026-07-10', 'expense', 800, 'shopping'),
          tx('2026-08-20', 'expense', 1000, 'shopping'),
          tx('2026-09-05', 'expense', 1200, 'shopping'),
          tx('2026-10-19', 'expense', 9000, 'shopping', 'Headphones'),
        ],
      }),
      TODAY,
    );
    expect(byId(report.insights, 'large-expense')).toBeUndefined();
    expect(byId(report.insights, 'category-spike:shopping')?.detail).toContain('₹9,000 on Headphones');
  });

  it('folds each purchase into its own category’s spike even when a bigger outlier exists elsewhere', () => {
    const health = (date: string, amount: number) => ({ ...tx(date, 'expense', amount, 'shopping'), category: 'health' });
    const report = buildInsights(
      data({
        categories: [...categories, { id: 'health', name: 'Health', icon: 'heart-pulse', color: 'green', type: 'expense' }],
        transactions: [
          ...base,
          tx('2026-07-10', 'expense', 800, 'shopping'),
          tx('2026-08-20', 'expense', 1000, 'shopping'),
          tx('2026-09-05', 'expense', 1200, 'shopping'),
          tx('2026-10-19', 'expense', 9000, 'shopping', 'Headphones'),
          health('2026-07-05', 300),
          health('2026-08-05', 300),
          health('2026-09-25', 400),
          health('2026-10-10', 5000), // 16× typical, no comparable spend last month
        ],
      }),
      TODAY,
    );
    expect(byId(report.insights, 'category-spike:shopping')?.detail).toContain('₹9,000 on Headphones');
    expect(byId(report.insights, 'large-expense')?.title).toBe('Unusually large expense: ₹5,000 on Health');
  });

  it('does not flag a recurring expense that is large only next to small everyday ones', () => {
    // Many small rides keep the median low, but petrol at ~₹2,000 happens every month.
    const rides = ['2026-07', '2026-08', '2026-09'].flatMap((m) => [
      tx(`${m}-04`, 'expense', 150, 'shopping'),
      tx(`${m}-11`, 'expense', 180, 'shopping'),
      tx(`${m}-18`, 'expense', 120, 'shopping'),
      tx(`${m}-10`, 'expense', 2050, 'shopping', 'Petrol'),
    ]);
    const report = buildInsights(
      data({ transactions: [...rides, tx('2026-10-10', 'expense', 2100, 'shopping', 'Petrol')] }),
      TODAY,
    );
    expect(byId(report.insights, 'large-expense')).toBeUndefined();
  });

  it('spots a single expense far above the category’s typical amount', () => {
    const report = buildInsights(
      data({
        transactions: [
          ...base,
          tx('2026-07-10', 'expense', 800, 'shopping'),
          tx('2026-08-20', 'expense', 1000, 'shopping'),
          tx('2026-09-05', 'expense', 1200, 'shopping'),
          tx('2026-10-19', 'expense', 6000, 'shopping', 'Sofa'),
        ],
      }),
      TODAY,
    );
    // typical (median of Jul–Sep shopping: 800, 1000, 1200, 3000, 4000) = 1,200 → 5×
    expect(byId(report.insights, 'large-expense')).toMatchObject({
      tone: 'warning',
      title: 'Unusually large expense: ₹6,000 on Shopping',
    });
  });
});

describe('buildInsights — budgets', () => {
  const budgets: Budget[] = [
    { id: 'b1', category: 'food', month: '2026-10', limit: 5000 },
    { id: 'b2', category: 'shopping', month: '2026-10', limit: 3000 },
    { id: 'b3', category: 'rent', month: '2026-10', limit: 16000 },
    { id: 'b4', category: 'food', month: '2026-09', limit: 100 },
  ];
  const report = buildInsights(data({ budgets }), TODAY);

  it('counts budgets kept and exceeded this month', () => {
    expect(report.budgets).toEqual({ total: 3, under: 2, over: 1 });
    expect(byId(report.insights, 'budget-under')).toMatchObject({
      tone: 'neutral',
      title: 'You’ve stayed under budget in 2 categories',
    });
  });

  it('calls out the overspent budget and the nearly used one', () => {
    expect(byId(report.insights, 'budget-over:food')).toMatchObject({ tone: 'negative', title: 'Food is over budget by ₹1,000' });
    expect(byId(report.insights, 'budget-near:rent')).toMatchObject({ tone: 'warning', title: 'Rent budget is 94% used' });
  });

  it('does not warn about a nearly used budget that is on pace for the month', () => {
    // Day 28 of 31: 90% of the month is gone, so 87% of the budget used is on track.
    const late = buildInsights(data({ budgets: [{ id: 'b', category: 'rent', month: '2026-10', limit: 17250 }] }), '2026-10-28');
    expect(byId(late.insights, 'budget-near:rent')).toBeUndefined();
  });

  it('orders insights by severity: negative, warning, positive, neutral', () => {
    const rank = { negative: 0, warning: 1, positive: 2, neutral: 3 };
    const ranks = report.insights.map((i) => rank[i.tone]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(report.insights[0].tone).toBe('negative');
  });
});

describe('buildInsights — goals and loans', () => {
  it('shows the monthly pace needed for the nearest goal and celebrates finished ones', () => {
    const goals: Goal[] = [
      { id: 'g1', name: 'Laptop', target: 90000, current: 30000, deadline: '2027-04-20' },
      { id: 'g2', name: 'Trip', target: 20000, current: 20000, deadline: '2026-12-01' },
      { id: 'g3', name: 'Car', target: 500000, current: 0, deadline: '2030-01-01' },
    ];
    const report = buildInsights(data({ goals }), TODAY);
    expect(byId(report.insights, 'goal-pace:g1')?.title).toBe('Save ₹10,000/month to reach Laptop by Apr 2027');
    expect(byId(report.insights, 'goal-pace:g3')).toBeUndefined();
    expect(byId(report.insights, 'goal-done:g2')?.tone).toBe('positive');
  });

  it('reminds about EMIs due within a week and flags overdue ones', () => {
    const loans: Loan[] = [
      { id: 'l1', name: 'Car loan', principal: 500000, emi: 12600, interestRate: 9, remainingTenure: 20, nextDue: '2026-10-25' },
      { id: 'l2', name: 'Phone', principal: 30000, emi: 2000, interestRate: 14, remainingTenure: 3, nextDue: '2026-10-18' },
      { id: 'l3', name: 'Home loan', principal: 2500000, emi: 22000, interestRate: 8.5, remainingTenure: 200, nextDue: '2026-11-05' },
    ];
    const report = buildInsights(data({ loans }), TODAY);
    expect(byId(report.insights, 'loan-due:l1')).toMatchObject({ tone: 'warning', title: 'Car loan EMI of ₹12,600 due in 5 days' });
    expect(byId(report.insights, 'loan-overdue:l2')).toMatchObject({ tone: 'negative', title: 'Phone EMI is overdue by 2 days' });
    expect(byId(report.insights, 'loan-due:l3')).toBeUndefined();
    // 36,600 of EMIs vs 60,000 monthly income = 61%
    expect(byId(report.insights, 'emi-burden')).toMatchObject({ tone: 'warning', title: 'EMIs take 61% of your income' });
  });
});

describe('buildInsights — habits and edge cases', () => {
  it('notices when weekend days cost more than weekdays', () => {
    const daily: Transaction[] = [];
    for (let i = 0; i < 56; i++) {
      const d = new Date(2026, 9, 20 - i);
      const weekend = d.getDay() === 0 || d.getDay() === 6;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      daily.push(tx(iso, 'expense', weekend ? 1500 : 500, 'food'));
    }
    const report = buildInsights(data({ transactions: daily }), TODAY);
    expect(byId(report.insights, 'weekend-spending')?.title).toBe('You spend 3× more per day on weekends');
  });

  it('projects linearly when last month gives no usable pace', () => {
    // Only 100 of September's 20,100 had been spent by the 4th — scaling by that ratio would explode.
    const report = buildInsights(
      data({
        transactions: [
          tx('2026-09-02', 'expense', 100, 'food'),
          tx('2026-09-20', 'expense', 20000, 'rent'),
          tx('2026-10-02', 'expense', 2000, 'food'),
        ],
      }),
      '2026-10-04',
    );
    expect(report.spending.projected).toBe(15500); // 2,000 ÷ 4 days × 31
  });

  it('returns no insights for an empty ledger', () => {
    const report = buildInsights(data({ transactions: [], accounts: [] }), TODAY);
    expect(report.insights).toEqual([]);
    expect(report.cashFlow.health).toBe('unknown');
    expect(report.cashFlow.runwayMonths).toBeNull();
  });
});
