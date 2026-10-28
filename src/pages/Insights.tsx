import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Info, Lightbulb, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CumulativeSpendChart, MiniBars, NetSparkBars } from '@/components/charts/Charts';
import { InsightItem } from '@/components/insights/InsightItem';
import { CategoryIcon, EmptyState } from '@/components/ui/Bits';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Form';
import { dailyCumulative } from '@/lib/finance';
import { formatDate, formatINR, formatMonth, formatPercent } from '@/lib/format';
import { buildInsights, type CashFlowHealth, type Insight } from '@/lib/insights';
import { todayISO } from '@/lib/dates';
import { cn, colorVar } from '@/lib/ui';
import { useFinanceData, useLookups } from '@/store/finance';

const HEALTH: Record<CashFlowHealth, { label: string; icon: typeof Info; className: string }> = {
  healthy: { label: 'Healthy', icon: CircleCheck, className: 'bg-income-soft text-income' },
  fair: { label: 'Fair', icon: CircleAlert, className: 'bg-warning-soft text-warning' },
  'at-risk': { label: 'At risk', icon: TriangleAlert, className: 'bg-expense-soft text-expense' },
  unknown: { label: 'Not enough data', icon: Info, className: 'bg-primary-soft text-primary' },
};

const FILTERS: { id: string; label: string; match: (i: Insight) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'attention', label: 'Needs attention', match: (i) => i.tone === 'negative' || i.tone === 'warning' },
  { id: 'good', label: 'Good news', match: (i) => i.tone === 'positive' },
  { id: 'info', label: 'Observations', match: (i) => i.tone === 'neutral' },
];

/** Change badge where up is bad (spending). Arrow + sign carry meaning without colour. */
function SpendChange({ change }: { change: number | null }) {
  if (change === null)
    return <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-ink">New</span>;
  if (Math.abs(change) < 0.005) return <span className="text-xs font-medium text-muted">No change</span>;
  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
        up ? 'bg-expense-soft text-expense' : 'bg-income-soft text-income',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatPercent(Math.abs(change))}
    </span>
  );
}

export default function Insights() {
  const data = useFinanceData();
  const lookup = useLookups();
  const today = todayISO();
  const [filter, setFilter] = useState('all');
  const report = useMemo(() => buildInsights(data, today), [data, today]);
  const { period, spending, savings, cashFlow } = report;

  const curve = useMemo(
    () => ({
      current: dailyCumulative(data.transactions, period.monthKey),
      previous: dailyCumulative(data.transactions, period.previousMonthKey),
    }),
    [data.transactions, period.monthKey, period.previousMonthKey],
  );

  if (!data.transactions.length) {
    return (
      <>
        <PageHeader title="Insights" />
        <Card>
          <EmptyState
            icon={Lightbulb}
            title="Insights need a little history"
            description="Add a few weeks of income and expenses and FinTrack will start spotting trends, unusual spending and savings opportunities."
            action={<ButtonLink to="/transactions/new">Add a transaction</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  const health = HEALTH[cashFlow.health];
  const HealthIcon = health.icon;
  const healthText = {
    healthy: `You’ve kept ${formatPercent(cashFlow.healthRate ?? 0)} of your income recently, and no month ended in the red.`,
    fair: `You’re saving ${formatPercent(Math.max(cashFlow.healthRate ?? 0, 0))} of your income recently — below the 20% target, or with a month in the red.`,
    'at-risk': 'Spending has been outpacing income recently. Look at your biggest categories first.',
    unknown: 'Track a full month of income and expenses to get a health check.',
  }[cashFlow.health];
  const shown = report.insights.filter(FILTERS.find((f) => f.id === filter)!.match);
  // "1–28 Oct vs 1–28 Sep": both ranges start on the 1st of their month
  const span = (start: string, end: string) => `${Number(start.slice(8, 10))}–${formatDate(end, 'short')}`;
  const comparing = `${span(period.currentStart, period.currentEnd)} vs ${span(period.previousStart, period.previousEnd)}`;
  const topCategories = report.categories.filter((c) => c.current > 0).slice(0, 6);

  return (
    <>
      <PageHeader title="Insights" subtitle={`Smart observations from your own data · ${comparing}`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Cash-flow health */}
        <Card className="flex flex-col">
          <CardHeader title="Cash flow health" subtitle="Based on your last three months" />
          <div className="flex items-center gap-3">
            <span className={cn('grid size-12 place-items-center rounded-2xl', health.className)}>
              <HealthIcon className="size-6" aria-hidden />
            </span>
            <p className="text-2xl font-bold tracking-tight text-ink">{health.label}</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{healthText}</p>
          <div className="mt-4 mb-4">
            <p className="mb-2 text-xs font-medium text-muted">Net cash flow · last 6 months</p>
            <NetSparkBars months={cashFlow.months} />
          </div>
          <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            <div>
              <dt className="text-[11px] text-muted">Savings rate</dt>
              <dd className="mt-0.5 font-semibold text-ink">{cashFlow.healthRate !== null ? formatPercent(cashFlow.healthRate) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Positive streak</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {cashFlow.positiveStreak} {cashFlow.positiveStreak === 1 ? 'month' : 'months'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Runway</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {cashFlow.runwayMonths !== null ? `${cashFlow.runwayMonths.toFixed(1)} mo` : '—'}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Spending pace */}
        <Card className="lg:col-span-2">
          <CardHeader title="Spending trend" subtitle="Cumulative spending, this month vs last month" />
          <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-muted">So far this month</p>
              <p className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink">
                {formatINR(spending.current)} <SpendChange change={spending.changePct} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Same days last month</p>
              <p className="text-lg font-semibold text-ink-2">{formatINR(spending.previous)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Projected for {formatMonth(period.monthKey, 'short')}</p>
              <p className="text-lg font-semibold text-ink-2">{formatINR(Math.round(spending.projected))}</p>
            </div>
          </div>
          <CumulativeSpendChart current={curve.current} previous={curve.previous} uptoDay={period.dayOfMonth} />
        </Card>

        {/* All observations */}
        <Card className="lg:col-span-2">
          <CardHeader title="Observations" subtitle={`${report.insights.length} things worth knowing`} />
          <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
            {FILTERS.map((f) => {
              const count = report.insights.filter(f.match).length;
              return (
                <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label} <span className="text-muted">{count}</span>
                </Chip>
              );
            })}
          </div>
          {shown.length ? (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              {shown.map((insight) => (
                <li key={insight.id}>
                  <InsightItem insight={insight} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing in this group right now.</p>
          )}
        </Card>

        {/* Savings */}
        <Card>
          <CardHeader title="Savings this month" />
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted">Savings rate so far</p>
              <p className="text-3xl font-bold tracking-tight text-ink">{savings.rate !== null ? formatPercent(savings.rate) : '—'}</p>
              {savings.previousRate !== null && (
                <p className="mt-0.5 text-[13px] text-muted">vs {formatPercent(savings.previousRate)} by this time last month</p>
              )}
            </div>
            {savings.projected !== null && (
              <div className="rounded-xl bg-subtle p-3">
                <p className="text-xs text-muted">{savings.projected >= 0 ? 'On track to save' : 'Projected shortfall'}</p>
                <p className={cn('text-lg font-semibold', savings.projected >= 0 ? 'text-income' : 'text-expense')}>
                  {formatINR(Math.abs(Math.round(savings.projected)))}
                </p>
                <p className="text-xs text-muted">
                  by {formatDate(`${period.monthKey}-${String(period.daysInMonth).padStart(2, '0')}`, 'short')}, at your current pace
                </p>
              </div>
            )}
            {report.budgets.total > 0 && (
              <p className="text-sm text-ink-2">
                <span className="font-semibold text-ink">
                  {report.budgets.under} of {report.budgets.total}
                </span>{' '}
                budgets within their limit.
              </p>
            )}
            <p className="text-sm text-ink-2">
              Average daily spend: <span className="font-semibold text-ink">{formatINR(Math.round(spending.avgDaily))}</span>
            </p>
          </div>
        </Card>

        {/* Category insights */}
        <section className="lg:col-span-3" aria-labelledby="category-insights">
          <h2 id="category-insights" className="mt-2 mb-3 text-[15px] font-semibold text-ink">
            Top categories this month
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {topCategories.map((c) => {
              const category = lookup.categories[c.categoryId];
              return (
                <Card key={c.categoryId} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <CategoryIcon category={category} size="sm" />
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink">{category?.name ?? 'Uncategorized'}</p>
                    <span className="text-xs text-muted">{formatPercent(c.share)} of spend</span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold tracking-tight text-ink">{formatINR(c.current)}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <SpendChange change={c.changePct} />
                        <span className="text-xs text-muted">vs {formatINR(c.previous)}</span>
                      </div>
                    </div>
                    <MiniBars
                      values={c.history.map((h) => h.amount)}
                      labels={c.history.map((h) => formatMonth(h.key, 'medium'))}
                      color={colorVar(category?.color ?? 'slate')}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
