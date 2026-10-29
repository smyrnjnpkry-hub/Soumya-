import { ChartPie, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IncomeExpenseChart, MonthlyTrendChart, SpendingDonut, WeekdayChart } from '@/components/charts/Charts';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import { EmptyState } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Form';
import { transactionsToCSV } from '@/lib/csv';
import { addMonthsToKey, lastNMonths, monthBounds, monthKey, todayISO } from '@/lib/dates';
import { downloadCSV } from '@/lib/download';
import { categoryBreakdown, countedTransactions, foldBreakdown, monthlySeries, periodTotals, weekdayAverages } from '@/lib/finance';
import { formatINR, formatPercent } from '@/lib/format';
import { cn } from '@/lib/ui';
import { useFinance, useLookups } from '@/store/finance';
import { toast } from '@/store/toast';

interface Period {
  id: string;
  label: string;
  start: string;
  end: string;
}

function usePeriods(): Period[] {
  const today = todayISO();
  const key = monthKey(today);
  return [
    { id: 'this', label: 'This month', ...monthBounds(key) },
    { id: 'last', label: 'Last month', ...monthBounds(addMonthsToKey(key, -1)) },
    { id: '3m', label: '3 months', start: monthBounds(addMonthsToKey(key, -2)).start, end: monthBounds(key).end },
    { id: '6m', label: '6 months', start: monthBounds(addMonthsToKey(key, -5)).start, end: monthBounds(key).end },
    { id: 'year', label: `This year`, start: `${today.slice(0, 4)}-01-01`, end: monthBounds(key).end },
  ];
}

/** Month keys from the start month to the end month, inclusive. */
function monthsIn(start: string, end: string) {
  const keys: string[] = [];
  for (let key = monthKey(start); key <= monthKey(end); key = addMonthsToKey(key, 1)) keys.push(key);
  return keys;
}

export default function Reports() {
  const transactions = useFinance((s) => s.transactions);
  const lookup = useLookups();
  const periods = usePeriods();
  const [periodId, setPeriodId] = useState('this');
  const period = periods.find((p) => p.id === periodId)!;
  const today = todayISO();

  const report = useMemo(() => {
    const { start, end } = period;
    const keys = monthsIn(start, end);
    // A single month gets six months of context in the trend charts
    const trendKeys = keys.length > 1 ? keys : lastNMonths(keys[0], 6);
    const inPeriod = transactions.filter((t) => t.date >= start && t.date <= end);
    // Spending as income and spending see it, without money lent, borrowed or paid back
    const counted = countedTransactions(inPeriod);
    // Weekday habits: leave out outsized one-off bills (rent, EMIs) that would swamp everyday spending
    const amounts = counted
      .filter((t) => t.type === 'expense')
      .map((t) => t.amount)
      .sort((a, b) => a - b);
    const billCap = (amounts[Math.floor(amounts.length / 2)] ?? 0) * 5;
    const everyday = counted.filter((t) => t.type !== 'expense' || t.amount < billCap);
    return {
      totals: periodTotals(transactions, start, end),
      expenses: foldBreakdown(categoryBreakdown(transactions, { type: 'expense', start, end }), 6),
      income: foldBreakdown(categoryBreakdown(transactions, { type: 'income', start, end }), 6),
      trend: monthlySeries(transactions, trendKeys),
      weekdays: weekdayAverages(everyday, start, end < today ? end : today),
      billCap,
      largest: counted
        .filter((t) => t.type === 'expense')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
      inPeriod,
    };
  }, [transactions, period, today]);

  const { totals } = report;
  const exportCsv = () => {
    downloadCSV(`fintrack-${period.start}-to-${period.end}.csv`, transactionsToCSV(report.inPeriod, lookup));
    toast(`Exported ${report.inPeriod.length} transactions`);
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Charts and trends for any period"
        actions={
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!report.inPeriod.length}>
            Export CSV
          </Button>
        }
      />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {periods.map((p) => (
          <Chip key={p.id} selected={p.id === periodId} onClick={() => setPeriodId(p.id)}>
            {p.label}
          </Chip>
        ))}
      </div>

      {report.inPeriod.length === 0 ? (
        <Card>
          <EmptyState icon={ChartPie} title="Nothing to report for this period" description="Pick another period or add transactions." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4 lg:gap-5">
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Income</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-income sm:text-2xl">+{formatINR(totals.income)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Expenses</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-expense sm:text-2xl">−{formatINR(totals.expense)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Net</p>
              <p className={cn('mt-1.5 text-xl font-bold tracking-tight sm:text-2xl', totals.net < 0 ? 'text-expense' : 'text-ink')}>
                {formatINR(totals.net, { sign: true })}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Savings rate</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {totals.savingsRate !== null ? formatPercent(totals.savingsRate) : '—'}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader title="Expenses by category" subtitle={period.label} />
            {report.expenses.length ? (
              <SpendingDonut
                items={report.expenses}
                categories={lookup.categories}
                total={totals.expense}
                linkRange={{ from: period.start, to: period.end }}
              />
            ) : (
              <p className="text-sm text-muted">No expenses in this period.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Income by source" subtitle={period.label} />
            {report.income.length ? (
              <SpendingDonut
                items={report.income}
                categories={lookup.categories}
                total={totals.income}
                centerLabel="Earned"
                linkRange={{ from: period.start, to: period.end }}
              />
            ) : (
              <p className="text-sm text-muted">No income in this period.</p>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Income vs expenses" subtitle={report.trend.length > 1 ? 'Month by month' : 'This month'} />
            <IncomeExpenseChart months={report.trend} />
          </Card>

          <Card>
            <CardHeader title="Spending trend" subtitle="Total spent each month" />
            <MonthlyTrendChart months={report.trend} />
          </Card>

          <Card>
            <CardHeader
              title="Spending by weekday"
              subtitle={`Average per day, excluding bills over ${formatINR(Math.round(report.billCap))} · peak highlighted`}
            />
            <WeekdayChart days={report.weekdays} />
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Largest expenses" subtitle={period.label} />
            <div className="divide-y divide-line/70">
              {report.largest.map((t) => (
                <TransactionRow key={t.id} t={t} lookup={lookup} showDate />
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
