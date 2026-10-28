import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IncomeExpenseChart, NetFlowChart } from '@/components/charts/Charts';
import { EmptyState } from '@/components/ui/Bits';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Form';
import { lastNMonths, monthKey, todayISO } from '@/lib/dates';
import { monthlySeries, savingsRate } from '@/lib/finance';
import { formatINR, formatMonth, formatPercent } from '@/lib/format';
import { cn } from '@/lib/ui';
import { useFinance } from '@/store/finance';

type Range = '6' | '12';

export default function CashFlow() {
  const transactions = useFinance((s) => s.transactions);
  const [range, setRange] = useState<Range>('6');
  const currentKey = monthKey(todayISO());

  const months = useMemo(() => monthlySeries(transactions, lastNMonths(currentKey, Number(range))), [transactions, currentKey, range]);
  const totals = months.reduce((acc, m) => ({ income: acc.income + m.income, expense: acc.expense + m.expense }), {
    income: 0,
    expense: 0,
  });
  const net = totals.income - totals.expense;
  const rate = savingsRate(totals.income, totals.expense);
  const active = months.filter((m) => m.income > 0 || m.expense > 0);
  const positive = active.filter((m) => m.net > 0).length;
  const best = [...active].sort((a, b) => b.net - a.net)[0];
  const worst = [...active].sort((a, b) => a.net - b.net)[0];

  return (
    <>
      <PageHeader
        title="Cash flow"
        subtitle="Money coming in vs money going out"
        actions={
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6 months' },
              { value: '12', label: '12 months' },
            ]}
          />
        }
      />

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={Activity}
            title="No cash flow yet"
            description="Add income and expenses to see how money moves month to month."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-5">
          <div className="grid grid-cols-2 gap-4 lg:col-span-4 lg:grid-cols-4 lg:gap-5">
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Money in</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-income sm:text-2xl">+{formatINR(totals.income)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Money out</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-expense sm:text-2xl">−{formatINR(totals.expense)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Net cash flow</p>
              <p className={cn('mt-1.5 text-xl font-bold tracking-tight sm:text-2xl', net >= 0 ? 'text-ink' : 'text-expense')}>
                {formatINR(net, { sign: true })}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Savings rate</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{rate !== null ? formatPercent(rate) : '—'}</p>
            </Card>
          </div>

          <Card className="lg:col-span-4">
            <CardHeader title="Income vs expenses" subtitle={`Last ${range} months · ${formatMonth(currentKey, 'short')} so far`} />
            <IncomeExpenseChart months={months} height={280} />
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader title="Net cash flow" subtitle="What was left after expenses each month" />
            <NetFlowChart months={months} />
          </Card>

          <Card>
            <CardHeader title="Summary" />
            <ul className="space-y-4 text-sm">
              <li>
                <p className="text-muted">Positive months</p>
                <p className="mt-0.5 font-semibold text-ink">
                  {positive} of {active.length}
                </p>
              </li>
              {best && (
                <li>
                  <p className="text-muted">Best month</p>
                  <p className="mt-0.5 font-semibold text-ink">
                    {formatMonth(best.key)} · <span className="text-income">{formatINR(best.net, { sign: true })}</span>
                  </p>
                </li>
              )}
              {worst && worst !== best && (
                <li>
                  <p className="text-muted">Toughest month</p>
                  <p className="mt-0.5 font-semibold text-ink">
                    {formatMonth(worst.key)} ·{' '}
                    <span className={worst.net < 0 ? 'text-expense' : 'text-ink'}>{formatINR(worst.net, { sign: true })}</span>
                  </p>
                </li>
              )}
              <li>
                <p className="text-muted">Average saved per month</p>
                <p className="mt-0.5 font-semibold text-ink">{formatINR(Math.round(net / active.length), { sign: true })}</p>
              </li>
            </ul>
          </Card>

          <Card className="lg:col-span-4">
            <CardHeader title="Month by month" />
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium sm:px-5">Month</th>
                    <th className="px-4 py-2 text-right font-medium">Income</th>
                    <th className="px-4 py-2 text-right font-medium">Expenses</th>
                    <th className="px-4 py-2 text-right font-medium">Net</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Saved</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {[...months].reverse().map((m) => {
                    const r = savingsRate(m.income, m.expense);
                    return (
                      <tr key={m.key} className="border-b border-line/60 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-ink sm:px-5">
                          {formatMonth(m.key)}
                          {m.key === currentKey && <span className="ml-1.5 text-xs font-normal text-muted">so far</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-2">{formatINR(m.income)}</td>
                        <td className="px-4 py-2.5 text-right text-ink-2">{formatINR(m.expense)}</td>
                        <td className={cn('px-4 py-2.5 text-right font-semibold', m.net < 0 ? 'text-expense' : 'text-ink')}>
                          {formatINR(m.net, { sign: true })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-2 sm:px-5">{r !== null ? formatPercent(r) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
