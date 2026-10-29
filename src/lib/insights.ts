import {
  addDays,
  addMonthsToKey,
  daysBetween,
  daysInMonth,
  lastNMonths,
  monthBounds,
  monthKey,
  monthsBetween,
  parseLocal,
  samePeriodLastMonth,
} from './dates';
import { cardsOverview, cardSummary, USAGE_WARNING } from './cards';
import {
  budgetProgress,
  categoryBreakdown,
  countedTransactions,
  monthlySeries,
  periodTotals,
  totalBalance,
  type MonthPoint,
} from './finance';
import { formatDate, formatINR, formatMonth, formatPercent, round2 } from './format';
import { entrySummary } from './lending';
import { loanSummary } from './loans';
import type { FinanceData, Transaction } from './types';

/**
 * Rule-based insights. Everything here is plain arithmetic over the user's own
 * data — no network, no ML. Month-to-date figures are always compared with the
 * *same days* of last month so a half-finished month is never judged against a
 * full one.
 */

export type InsightTone = 'positive' | 'negative' | 'warning' | 'neutral';
export type InsightKind =
  'spending' | 'category' | 'alert' | 'savings' | 'cashflow' | 'budget' | 'goal' | 'loan' | 'card' | 'lending' | 'habit';

export interface Insight {
  /** Stable id, e.g. 'category-up:food' */
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  title: string;
  detail: string;
  categoryId?: string;
}

export interface CategoryTrend {
  categoryId: string;
  /** Month-to-date spend */
  current: number;
  /** Spend over the same days last month */
  previous: number;
  changePct: number | null;
  /** Share of month-to-date spending */
  share: number;
  /** Six months, oldest first; the last entry is month-to-date */
  history: { key: string; amount: number }[];
}

export type CashFlowHealth = 'healthy' | 'fair' | 'at-risk' | 'unknown';

export interface InsightsReport {
  period: {
    monthKey: string;
    previousMonthKey: string;
    dayOfMonth: number;
    daysInMonth: number;
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  spending: {
    current: number;
    previous: number;
    changePct: number | null;
    lastMonthTotal: number;
    projected: number;
    avgDaily: number;
  };
  income: { current: number; previous: number; lastMonthTotal: number };
  savings: { rate: number | null; previousRate: number | null; projected: number | null };
  categories: CategoryTrend[];
  cashFlow: {
    /** Last six months, oldest first; the last entry is month-to-date */
    months: MonthPoint[];
    positiveStreak: number;
    health: CashFlowHealth;
    /** Savings rate over the months health was judged on */
    healthRate: number | null;
    balance: number;
    avgMonthlyExpense: number | null;
    runwayMonths: number | null;
  };
  budgets: { total: number; under: number; over: number };
  insights: Insight[];
}

/** Thresholds, tuned so small amounts don't produce noisy observations. */
const RULES = {
  steadyChange: 0.05,
  categoryChange: 0.15,
  categoryMinDiff: 300,
  spikeChange: 0.4,
  spikeMinDiff: 1000,
  /** Last month's pace is only trusted once this share of its spending had happened by today's date */
  paceMinShare: 0.15,
  largeExpenseRatio: 3,
  /** …and at least 25% above the biggest expense in that category over the lookback */
  largeExpenseOverMax: 1.25,
  largeExpenseMin: 2000,
  largeExpenseLookbackDays: 120,
  largeExpenseMinSamples: 3,
  savingsTarget: 0.2,
  runwayLow: 3,
  runwayHigh: 6,
  budgetNear: 0.85,
  /** …and only when usage is this far ahead of the share of the month gone by */
  budgetPaceMargin: 0.1,
  budgetNearMinDaysLeft: 3,
  loanDueWithinDays: 7,
  emiBurden: 0.4,
  weekendRatio: 1.5,
  weekendWindowDays: 56,
  weekendMinDays: 14,
  weekendMinTransactions: 10,
  /** Rent-sized one-offs are left out of habit maths */
  habitOutlierMultiple: 5,
  maxPerRule: 2,
} as const;

const TONE_ORDER: Record<InsightTone, number> = { negative: 0, warning: 1, positive: 2, neutral: 3 };

const rupees = (n: number) => formatINR(Math.round(n));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const dueIn = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);
const daysAgo = (days: number) => (days === 1 ? 'yesterday' : `${days} days ago`);

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Month-end spending estimate. Scaling by last month's curve respects front-loaded
 * bills (rent on the 3rd); a straight line is the fallback when last month has
 * too little data at this point to give a believable pace.
 */
function projectSpending(current: number, previous: number, lastMonthTotal: number, day: number, days: number) {
  if (day >= days) return current;
  if (previous > 0 && lastMonthTotal > 0 && previous >= RULES.paceMinShare * lastMonthTotal) {
    return round2(Math.max(current, current * (lastMonthTotal / previous)));
  }
  return round2((current / day) * days);
}

export function buildInsights(data: FinanceData, today: string): InsightsReport {
  const { categories, accounts, budgets, goals, loans, creditCards } = data;
  // Money lent, borrowed or paid back is neither income nor spending; the balance below still counts every rupee
  const transactions = countedTransactions(data.transactions);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const nameOf = (id: string) => names.get(id) ?? 'Uncategorized';

  // ---- period -------------------------------------------------------------
  const key = monthKey(today);
  const previousMonthKey = addMonthsToKey(key, -1);
  const dayOfMonth = Number(today.slice(8, 10));
  const days = daysInMonth(key);
  const currentStart = `${key}-01`;
  const { start: previousStart, end: previousEnd } = samePeriodLastMonth(today);
  const lastMonth = monthBounds(previousMonthKey);

  const cur = periodTotals(transactions, currentStart, today);
  const prev = periodTotals(transactions, previousStart, previousEnd);
  const last = periodTotals(transactions, lastMonth.start, lastMonth.end);

  const projected = projectSpending(cur.expense, prev.expense, last.expense, dayOfMonth, days);
  const spending = {
    current: cur.expense,
    previous: prev.expense,
    changePct: prev.expense > 0 ? (cur.expense - prev.expense) / prev.expense : null,
    lastMonthTotal: last.expense,
    projected,
    avgDaily: round2(cur.expense / dayOfMonth),
  };
  const projectedSavings = cur.income > 0 ? round2(cur.income - projected) : null;

  // ---- category trends ----------------------------------------------------
  const historyKeys = lastNMonths(key, 6);
  const historyStart = `${historyKeys[0]}-01`;
  const monthlyByCategory = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < historyStart || t.date > today) continue;
    const months = monthlyByCategory.get(t.category) ?? new Map<string, number>();
    months.set(monthKey(t.date), (months.get(monthKey(t.date)) ?? 0) + t.amount);
    monthlyByCategory.set(t.category, months);
  }
  const curByCat = new Map(
    categoryBreakdown(transactions, { type: 'expense', start: currentStart, end: today }).map((i) => [i.categoryId, i.amount]),
  );
  const prevByCat = new Map(
    categoryBreakdown(transactions, { type: 'expense', start: previousStart, end: previousEnd }).map((i) => [i.categoryId, i.amount]),
  );
  const trends: CategoryTrend[] = [...new Set([...curByCat.keys(), ...prevByCat.keys()])]
    .map((categoryId) => {
      const current = curByCat.get(categoryId) ?? 0;
      const previous = prevByCat.get(categoryId) ?? 0;
      return {
        categoryId,
        current,
        previous,
        changePct: previous > 0 ? (current - previous) / previous : null,
        share: cur.expense > 0 ? current / cur.expense : 0,
        history: historyKeys.map((k) => ({ key: k, amount: round2(monthlyByCategory.get(categoryId)?.get(k) ?? 0) })),
      };
    })
    .sort((a, b) => b.current - a.current || b.previous - a.previous);

  // ---- cash flow ----------------------------------------------------------
  const completed = monthlySeries(transactions, lastNMonths(previousMonthKey, 12));
  let positiveStreak = 0;
  for (let i = completed.length - 1; i >= 0 && completed[i].net > 0; i--) positiveStreak++;

  const recent = completed.slice(-3);
  const recentWithExpense = recent.filter((m) => m.expense > 0);
  const avgMonthlyExpense = recentWithExpense.length ? mean(recentWithExpense.map((m) => m.expense)) : projected > 0 ? projected : null;
  const balance = totalBalance(accounts, data.transactions);
  const runwayMonths = avgMonthlyExpense ? Math.max(balance, 0) / avgMonthlyExpense : null;

  const recentActive = recent.filter((m) => m.income > 0 || m.expense > 0);
  const healthBasis: MonthPoint[] = recentActive.length
    ? recentActive
    : cur.income > 0 || cur.expense > 0
      ? [{ key, income: cur.income, expense: cur.expense, net: cur.net }]
      : [];
  let health: CashFlowHealth = 'unknown';
  let healthRate: number | null = null;
  if (healthBasis.length) {
    const income = healthBasis.reduce((s, m) => s + m.income, 0);
    const expense = healthBasis.reduce((s, m) => s + m.expense, 0);
    const negativeMonths = healthBasis.filter((m) => m.net < 0).length;
    healthRate = income > 0 ? (income - expense) / income : null;
    if (healthRate === null) health = expense > 0 ? 'at-risk' : 'unknown';
    else if (healthRate >= RULES.savingsTarget && negativeMonths === 0) health = 'healthy';
    else if (healthRate < 0 || negativeMonths >= 2) health = 'at-risk';
    else health = 'fair';
  }
  const recentWithIncome = recent.filter((m) => m.income > 0);
  const avgMonthlyIncome = recentWithIncome.length ? mean(recentWithIncome.map((m) => m.income)) : cur.income;

  // ---- budgets ------------------------------------------------------------
  const budgetItems = budgetProgress(budgets, transactions, key).items;
  const budgetsUnder = budgetItems.filter((i) => i.spent <= i.budget.limit).length;

  // ---- rules --------------------------------------------------------------
  const out: Insight[] = [];
  const add = (insight: Insight) => out.push(insight);

  // Spending trend
  if (spending.changePct !== null && cur.expense > 0) {
    const change = spending.changePct;
    const detail = `You’ve spent ${rupees(cur.expense)} so far this month, compared with ${rupees(prev.expense)} by this time last month.`;
    if (Math.abs(change) < RULES.steadyChange) {
      add({ id: 'spending-trend', kind: 'spending', tone: 'neutral', title: 'Spending is steady vs last month', detail });
    } else {
      const up = change > 0;
      add({
        id: 'spending-trend',
        kind: 'spending',
        tone: up ? 'warning' : 'positive',
        title: `Spending ${up ? 'up' : 'down'} ${formatPercent(Math.abs(change))} vs last month`,
        detail,
      });
    }
  }

  // Unusually large single expense vs the category's typical amount
  const lookbackStart = addDays(today, -RULES.largeExpenseLookbackDays);
  const baseline = new Map<string, number[]>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < lookbackStart || t.date >= currentStart) continue;
    baseline.set(t.category, [...(baseline.get(t.category) ?? []), t.amount]);
  }
  // Unusual = far above the typical amount AND clearly bigger than anything recent,
  // so a monthly ₹2,000 petrol fill among ₹150 auto rides is not flagged.
  const largeByCategory = new Map<string, { t: Transaction; ratio: number; typical: number }>();
  for (const t of transactions) {
    if (t.type !== 'expense' || t.date < currentStart || t.date > today || t.amount < RULES.largeExpenseMin) continue;
    const samples = baseline.get(t.category);
    if (!samples || samples.length < RULES.largeExpenseMinSamples) continue;
    const typical = median(samples);
    const ratio = typical > 0 ? t.amount / typical : 0;
    if (ratio < RULES.largeExpenseRatio || t.amount < Math.max(...samples) * RULES.largeExpenseOverMax) continue;
    const best = largeByCategory.get(t.category);
    if (!best || ratio > best.ratio) largeByCategory.set(t.category, { t, ratio, typical });
  }

  // Category movers: big jumps become alerts, moderate moves become trends
  const vsLastMonth = (t: CategoryTrend) => `${rupees(t.current)} so far vs ${rupees(t.previous)} by this time last month.`;
  const movers = trends.filter((t) => t.changePct !== null);
  const isSpike = (t: CategoryTrend) => t.changePct! >= RULES.spikeChange && t.current - t.previous >= RULES.spikeMinDiff;
  const byIncrease = (a: CategoryTrend, b: CategoryTrend) => b.current - b.previous - (a.current - a.previous);
  for (const t of movers.filter(isSpike).sort(byIncrease).slice(0, RULES.maxPerRule)) {
    // A spike driven by one big purchase is explained here rather than repeated as its own alert
    let detail = vsLastMonth(t);
    const big = largeByCategory.get(t.categoryId)?.t;
    if (big) {
      detail += ` Includes ${rupees(big.amount)} on ${big.note || nameOf(big.category)} (${formatDate(big.date, 'short')}).`;
      largeByCategory.delete(t.categoryId);
    }
    add({
      id: `category-spike:${t.categoryId}`,
      kind: 'alert',
      tone: 'negative',
      title: `You spent ${formatPercent(t.changePct!)} more on ${nameOf(t.categoryId)} this month`,
      detail,
      categoryId: t.categoryId,
    });
  }
  const ups = movers.filter((t) => !isSpike(t) && t.changePct! >= RULES.categoryChange && t.current - t.previous >= RULES.categoryMinDiff);
  for (const t of ups.sort(byIncrease).slice(0, RULES.maxPerRule)) {
    add({
      id: `category-up:${t.categoryId}`,
      kind: 'category',
      tone: 'warning',
      title: `${nameOf(t.categoryId)} spending increased by ${formatPercent(t.changePct!)} compared to last month`,
      detail: vsLastMonth(t),
      categoryId: t.categoryId,
    });
  }
  // A category with nothing spent yet this month is "not yet", not "cut back"
  const downs = movers.filter(
    (t) => t.current > 0 && t.changePct! <= -RULES.categoryChange && t.previous - t.current >= RULES.categoryMinDiff,
  );
  for (const t of downs.sort((a, b) => -byIncrease(a, b)).slice(0, RULES.maxPerRule)) {
    add({
      id: `category-down:${t.categoryId}`,
      kind: 'category',
      tone: 'positive',
      title: `${nameOf(t.categoryId)} spending dropped ${formatPercent(Math.abs(t.changePct!))}`,
      detail: vsLastMonth(t),
      categoryId: t.categoryId,
    });
  }

  const largest = [...largeByCategory.values()].sort((a, b) => b.ratio - a.ratio)[0];
  if (largest) {
    const { t, ratio, typical } = largest;
    const name = nameOf(t.category);
    add({
      id: 'large-expense',
      kind: 'alert',
      tone: 'warning',
      title: `Unusually large expense: ${rupees(t.amount)} on ${name}`,
      detail: `${formatDate(t.date, 'short')}${t.note ? ` · ${t.note}` : ''} — about ${Math.round(ratio)}× your typical ${name} spend of ${rupees(typical)}.`,
      categoryId: t.category,
    });
  }

  // Highest expense category
  const top = trends.find((t) => t.current > 0);
  if (top) {
    add({
      id: 'top-category',
      kind: 'category',
      tone: 'neutral',
      title: `Highest expense category: ${nameOf(top.categoryId)} (${formatPercent(top.share)})`,
      detail: `${rupees(top.current)} of your ${rupees(cur.expense)} spending this month.`,
      categoryId: top.categoryId,
    });
  }

  // Savings rate and month-end projection
  if (cur.income > 0 && cur.savingsRate !== null) {
    const rate = cur.savingsRate;
    if (rate < 0) {
      add({
        id: 'savings-rate',
        kind: 'savings',
        tone: 'negative',
        title: 'You’ve spent more than you earned',
        detail: `Expenses are ${rupees(cur.expense - cur.income)} above income so far this month.`,
      });
    } else if (rate < RULES.savingsTarget) {
      add({
        id: 'savings-rate',
        kind: 'savings',
        tone: 'warning',
        title: `Savings rate is ${formatPercent(rate)}`,
        detail: `Trimming ${rupees(cur.expense - cur.income * (1 - RULES.savingsTarget))} of spending would get you to 20%.`,
      });
    } else {
      add({
        id: 'savings-rate',
        kind: 'savings',
        tone: 'positive',
        title: `You’re saving ${formatPercent(rate)} of your income`,
        detail:
          formatPercent(rate) === '20%'
            ? 'That’s right on the 20% savings rate most planners recommend.'
            : 'That’s above the 20% savings rate most planners recommend.',
      });
    }
  }
  if (projectedSavings !== null && dayOfMonth < days) {
    add(
      projectedSavings >= 0
        ? {
            id: 'savings-projection',
            kind: 'savings',
            tone: 'positive',
            title: `You’re on track to save ${rupees(projectedSavings)} this month`,
            detail: `${rupees(cur.income)} earned so far, with spending projected to reach ${rupees(projected)}.`,
          }
        : {
            id: 'savings-projection',
            kind: 'savings',
            tone: 'negative',
            title: `At this pace you’ll overspend by ${rupees(-projectedSavings)}`,
            detail: `Spending is projected to reach ${rupees(projected)} against ${rupees(cur.income)} of income.`,
          },
    );
  }

  // Net cash flow streak, or last month's shortfall
  const lastCompleted = completed[completed.length - 1];
  if (positiveStreak >= 2) {
    const saved = completed.slice(-positiveStreak).reduce((s, m) => s + m.net, 0);
    add({
      id: 'cashflow-streak',
      kind: 'cashflow',
      tone: 'positive',
      title: `Net cash flow has been positive for the last ${positiveStreak} months`,
      detail: `You’ve saved ${rupees(saved)} across those months.`,
    });
  } else if (lastCompleted && lastCompleted.net < 0) {
    add({
      id: 'cashflow-negative',
      kind: 'cashflow',
      tone: 'negative',
      title: `You spent ${rupees(-lastCompleted.net)} more than you earned in ${formatMonth(lastCompleted.key)}`,
      detail: 'Check your top categories for room to cut back this month.',
    });
  }

  // Emergency runway
  if (runwayMonths !== null) {
    const months = runwayMonths.toFixed(1);
    if (runwayMonths >= RULES.runwayHigh) {
      add({
        id: 'runway',
        kind: 'cashflow',
        tone: 'positive',
        title: `Your balance covers ${months} months of expenses`,
        detail: 'That’s a healthy emergency cushion — 3 to 6 months is the usual target.',
      });
    } else if (runwayMonths < RULES.runwayLow) {
      add({
        id: 'runway',
        kind: 'cashflow',
        tone: 'warning',
        title: `Your balance covers only ${months} months of expenses`,
        detail: 'Aim to build an emergency fund worth 3–6 months of spending.',
      });
    } else {
      add({
        id: 'runway',
        kind: 'cashflow',
        tone: 'neutral',
        title: `Your balance covers ${months} months of expenses`,
        detail: 'You’re within the recommended 3–6 month emergency range.',
      });
    }
  }

  // Budgets
  if (budgetItems.length) {
    const over = budgetItems.length - budgetsUnder;
    if (budgetsUnder > 0) {
      add({
        id: 'budget-under',
        kind: 'budget',
        tone: over === 0 ? 'positive' : 'neutral',
        title: `You’ve stayed under budget in ${budgetsUnder} ${plural(budgetsUnder, 'category', 'categories')}`,
        detail:
          over === 0
            ? `Every budget is on track for ${formatMonth(key)}.`
            : `${over} ${plural(over, 'budget is', 'budgets are')} over the limit this month.`,
      });
    }
    const overs = budgetItems
      .filter((i) => i.status === 'over')
      .sort((a, b) => b.spent - b.budget.limit - (a.spent - a.budget.limit))
      .slice(0, RULES.maxPerRule);
    for (const i of overs) {
      add({
        id: `budget-over:${i.budget.category}`,
        kind: 'budget',
        tone: 'negative',
        title: `${nameOf(i.budget.category)} is over budget by ${rupees(i.spent - i.budget.limit)}`,
        detail: `Spent ${rupees(i.spent)} of a ${rupees(i.budget.limit)} budget.`,
        categoryId: i.budget.category,
      });
    }
    const daysLeft = days - dayOfMonth;
    if (daysLeft >= RULES.budgetNearMinDaysLeft) {
      // Only warn when spending is running ahead of the month, not merely close to the limit
      const elapsed = dayOfMonth / days;
      const nears = budgetItems
        .filter((i) => i.status !== 'over' && i.ratio >= RULES.budgetNear && i.ratio >= elapsed + RULES.budgetPaceMargin)
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, RULES.maxPerRule);
      for (const i of nears) {
        add({
          id: `budget-near:${i.budget.category}`,
          kind: 'budget',
          tone: 'warning',
          title: `${nameOf(i.budget.category)} budget is ${formatPercent(i.ratio)} used`,
          detail: `${rupees(i.remaining)} left with ${daysLeft} days to go.`,
          categoryId: i.budget.category,
        });
      }
    }
  }

  // Goals
  for (const g of goals.filter((g) => g.target > 0 && g.current >= g.target).slice(0, RULES.maxPerRule)) {
    add({
      id: `goal-done:${g.id}`,
      kind: 'goal',
      tone: 'positive',
      title: `You’ve reached your ${g.name} goal`,
      detail: `${rupees(g.target)} saved — time to set the next one?`,
    });
  }
  const openGoals = goals.filter((g) => g.current < g.target);
  const nextGoal = openGoals.filter((g) => g.deadline >= today).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  if (nextGoal) {
    const months = Math.max(1, monthsBetween(today, nextGoal.deadline));
    const remaining = nextGoal.target - nextGoal.current;
    add({
      id: `goal-pace:${nextGoal.id}`,
      kind: 'goal',
      tone: 'neutral',
      title: `Save ${rupees(remaining / months)}/month to reach ${nextGoal.name} by ${formatMonth(monthKey(nextGoal.deadline), 'medium')}`,
      detail: `${rupees(remaining)} to go over ${months} ${plural(months, 'month', 'months')}.`,
    });
  }
  const lateGoal = openGoals.find((g) => g.deadline < today);
  if (lateGoal) {
    add({
      id: `goal-overdue:${lateGoal.id}`,
      kind: 'goal',
      tone: 'warning',
      title: `${lateGoal.name} goal is past its deadline`,
      detail: `${rupees(lateGoal.target - lateGoal.current)} still to go — consider setting a new date.`,
    });
  }

  // Loans / EMIs
  const activeLoans = loans.filter((l) => l.remainingTenure > 0);
  for (const loan of activeLoans) {
    const s = loanSummary(loan, today);
    if (s.isOverdue) {
      const late = -s.daysUntilDue;
      add({
        id: `loan-overdue:${loan.id}`,
        kind: 'loan',
        tone: 'negative',
        title: `${loan.name} EMI is overdue by ${late} ${plural(late, 'day', 'days')}`,
        detail: `${rupees(loan.emi)} was due on ${formatDate(loan.nextDue)}.`,
      });
    } else if (s.daysUntilDue <= RULES.loanDueWithinDays) {
      add({
        id: `loan-due:${loan.id}`,
        kind: 'loan',
        tone: 'warning',
        title: `${loan.name} EMI of ${rupees(loan.emi)} due ${dueIn(s.daysUntilDue)}`,
        detail: `Due on ${formatDate(loan.nextDue)} — keep the money ready in your account.`,
      });
    }
  }
  const totalEmi = activeLoans.reduce((s, l) => s + l.emi, 0);
  if (totalEmi > 0 && avgMonthlyIncome > 0 && totalEmi / avgMonthlyIncome > RULES.emiBurden) {
    add({
      id: 'emi-burden',
      kind: 'loan',
      tone: 'warning',
      title: `EMIs take ${formatPercent(totalEmi / avgMonthlyIncome)} of your income`,
      detail: `${rupees(totalEmi)} a month goes to EMIs. Planners suggest keeping this under 40%.`,
    });
  }

  // Credit cards
  for (const card of creditCards) {
    const s = cardSummary(card, today);
    if (s.status === 'overdue') {
      const late = -s.daysUntilDue;
      add({
        id: `card-overdue:${card.id}`,
        kind: 'card',
        tone: 'negative',
        title: `${card.name} payment is overdue by ${late} ${plural(late, 'day', 'days')}`,
        detail: `The minimum of ${rupees(card.minDue)} was due on ${formatDate(card.dueDate)}. Paying it soon limits late fees and interest.`,
      });
    } else if (s.status === 'due-soon') {
      add({
        id: `card-due:${card.id}`,
        kind: 'card',
        tone: 'warning',
        title: `${card.name} minimum of ${rupees(card.minDue)} due ${dueIn(s.daysUntilDue)}`,
        detail: `Due on ${formatDate(card.dueDate)}. Paying the full ${rupees(card.outstanding)} avoids interest.`,
      });
    }
  }
  const cards = cardsOverview(creditCards);
  if (cards.limit > 0 && cards.usage >= USAGE_WARNING) {
    add({
      id: 'card-usage',
      kind: 'card',
      tone: 'warning',
      title: `Your cards are ${formatPercent(cards.usage)} used`,
      detail: `${rupees(cards.owed)} of ${rupees(cards.limit)} in limits. Keeping it under 30% helps your credit score.`,
    });
  }

  // Lent & Borrowed: what's overdue or due within a week, for people with reminders on
  const lendingDue = data.lentBorrowed
    .map((entry) => ({ entry, due: entrySummary(entry, today) }))
    .filter(({ due }) => due.dueSoon)
    .map(({ entry, due }) => ({ entry, due: due.due! }))
    .sort((a, b) => a.due.days - b.due.days);
  const overdueLending = lendingDue.filter(({ due }) => due.days < 0).slice(0, RULES.maxPerRule);
  const soonLending = lendingDue.filter(({ due }) => due.days >= 0).slice(0, RULES.maxPerRule);
  for (const { entry, due } of [...overdueLending, ...soonLending]) {
    const late = due.days < 0;
    const amount = rupees(due.amount);
    const lent = entry.direction === 'lent';
    let title: string;
    if (due.kind === 'interest') {
      if (late) title = lent ? `${amount} interest pending from ${entry.person}` : `Your ${amount} interest to ${entry.person} is overdue`;
      else
        title = lent
          ? `${amount} interest from ${entry.person} due ${dueIn(due.days)}`
          : `Your ${amount} interest to ${entry.person} is due ${dueIn(due.days)}`;
    } else {
      const who = lent ? `${amount} from ${entry.person}` : `${amount} to ${entry.person}`;
      title = late ? `${who} was due back ${daysAgo(-due.days)}` : `${who} due back ${dueIn(due.days)}`;
    }
    add({
      id: `lending-${late ? 'overdue' : 'due'}:${entry.id}`,
      kind: 'lending',
      tone: late ? 'negative' : 'warning',
      title,
      detail: late ? `Due since ${formatDate(due.date)}. Record it in Lent & Borrowed once it’s paid.` : `Due on ${formatDate(due.date)}.`,
    });
  }

  // Weekend vs weekday spending habit
  const expenseDates = transactions.filter((t) => t.type === 'expense' && t.date <= today).map((t) => t.date);
  if (expenseDates.length) {
    const earliest = expenseDates.reduce((a, b) => (a < b ? a : b));
    const windowStartCandidate = addDays(today, -(RULES.weekendWindowDays - 1));
    const windowStart = earliest > windowStartCandidate ? earliest : windowStartCandidate;
    const windowDays = daysBetween(windowStart, today) + 1;
    const inWindow = transactions.filter((t) => t.type === 'expense' && t.date >= windowStart && t.date <= today);
    if (windowDays >= RULES.weekendMinDays && inWindow.length >= RULES.weekendMinTransactions) {
      const cap = median(inWindow.map((t) => t.amount)) * RULES.habitOutlierMultiple;
      const isWeekend = (iso: string) => [0, 6].includes(parseLocal(iso).getDay());
      let weekendDays = 0;
      for (let i = 0; i < windowDays; i++) if (isWeekend(addDays(windowStart, i))) weekendDays++;
      const weekdayDays = windowDays - weekendDays;
      let weekendTotal = 0;
      let weekdayTotal = 0;
      for (const t of inWindow) {
        if (t.amount >= cap) continue;
        if (isWeekend(t.date)) weekendTotal += t.amount;
        else weekdayTotal += t.amount;
      }
      const weekendAvg = weekendDays ? weekendTotal / weekendDays : 0;
      const weekdayAvg = weekdayDays ? weekdayTotal / weekdayDays : 0;
      if (weekdayAvg > 0 && weekendAvg / weekdayAvg >= RULES.weekendRatio) {
        const weeks = Math.round(windowDays / 7);
        add({
          id: 'weekend-spending',
          kind: 'habit',
          tone: 'neutral',
          title: `You spend ${Number((weekendAvg / weekdayAvg).toFixed(1))}× more per day on weekends`,
          detail: `Weekend days average ${rupees(weekendAvg)} vs ${rupees(weekdayAvg)} on weekdays over the last ${weeks} ${plural(weeks, 'week', 'weeks')}.`,
        });
      }
    }
  }

  return {
    period: {
      monthKey: key,
      previousMonthKey,
      dayOfMonth,
      daysInMonth: days,
      currentStart,
      currentEnd: today,
      previousStart,
      previousEnd,
    },
    spending,
    income: { current: cur.income, previous: prev.income, lastMonthTotal: last.income },
    savings: { rate: cur.savingsRate, previousRate: prev.savingsRate, projected: projectedSavings },
    categories: trends,
    cashFlow: {
      months: monthlySeries(
        transactions.filter((t) => t.date <= today),
        historyKeys,
      ),
      positiveStreak,
      health,
      healthRate,
      balance,
      avgMonthlyExpense,
      runwayMonths,
    },
    budgets: { total: budgetItems.length, under: budgetsUnder, over: budgetItems.length - budgetsUnder },
    insights: out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]),
  };
}
