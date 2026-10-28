import { ArrowRight, Settings2, Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MonthlyTrendChart } from '@/components/charts/Charts';
import { CategoryManager } from '@/components/forms/CategoryForms';
import { describe } from '@/components/transactions/TransactionRow';
import { Amount, CategoryIcon, EmptyState } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Chip, Segmented } from '@/components/ui/Form';
import { addMonthsToKey, lastNMonths, monthBounds, monthKey, todayISO } from '@/lib/dates';
import { categoryBreakdown, type MonthPoint } from '@/lib/finance';
import { formatDate, formatINR, formatPercent } from '@/lib/format';
import type { CategoryType } from '@/lib/types';
import { cn, colorVar } from '@/lib/ui';
import { useFinance, useLookups } from '@/store/finance';

function usePeriods() {
  const key = monthKey(todayISO());
  return [
    { id: 'this', label: 'This month', start: monthBounds(key).start, end: monthBounds(key).end },
    { id: 'last', label: 'Last month', ...monthBounds(addMonthsToKey(key, -1)) },
    { id: '3m', label: '3 months', start: monthBounds(addMonthsToKey(key, -2)).start, end: monthBounds(key).end },
    { id: '6m', label: '6 months', start: monthBounds(addMonthsToKey(key, -5)).start, end: monthBounds(key).end },
  ];
}

export default function Categories() {
  const transactions = useFinance((s) => s.transactions);
  const categories = useFinance((s) => s.categories);
  const lookup = useLookups();
  const periods = usePeriods();
  const [type, setType] = useState<CategoryType>('expense');
  const [periodId, setPeriodId] = useState('this');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const period = periods.find((p) => p.id === periodId)!;

  const items = useMemo(
    () => categoryBreakdown(transactions, { type, start: period.start, end: period.end }),
    [transactions, type, period.start, period.end],
  );
  const total = items.reduce((s, i) => s + i.amount, 0);
  const max = items[0]?.amount ?? 0;
  const unused = categories.filter((c) => c.type === type && !items.some((i) => i.categoryId === c.id));
  const selected = items.find((i) => i.categoryId === selectedId) ?? items[0];
  const selectedCategory = selected ? lookup.categories[selected.categoryId] : undefined;

  const detail = useMemo(() => {
    if (!selected) return null;
    const keys = lastNMonths(monthKey(todayISO()), 6);
    const months: MonthPoint[] = keys.map((key) => {
      const { start, end } = monthBounds(key);
      const amount = transactions
        .filter((t) => t.type === type && t.category === selected.categoryId && t.date >= start && t.date <= end)
        .reduce((s, t) => s + t.amount, 0);
      return { key, income: type === 'income' ? amount : 0, expense: type === 'expense' ? amount : 0, net: 0 };
    });
    const largest = transactions
      .filter((t) => t.type === type && t.category === selected.categoryId && t.date >= period.start && t.date <= period.end)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    return { months, largest };
  }, [selected, transactions, type, period.start, period.end]);

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Where your money comes from and goes"
        actions={
          <Button variant="secondary" icon={Settings2} onClick={() => setManaging(true)}>
            Manage
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Category type"
          value={type}
          onChange={(t) => {
            setType(t);
            setSelectedId(null);
          }}
          options={[
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          {periods.map((p) => (
            <Chip key={p.id} selected={p.id === periodId} onClick={() => setPeriodId(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Shapes}
            title={`No ${type === 'expense' ? 'spending' : 'income'} in this period`}
            description="Pick a longer period or add some transactions."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
          <Card className="lg:col-span-3">
            <CardHeader
              title={type === 'expense' ? 'Spending by category' : 'Income by source'}
              subtitle={`${formatINR(total)} across ${items.length} ${items.length === 1 ? 'category' : 'categories'}`}
            />
            <ul className="space-y-1">
              {items.map((item) => {
                const category = lookup.categories[item.categoryId];
                const active = selected?.categoryId === item.categoryId;
                return (
                  <li key={item.categoryId}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(item.categoryId)}
                      className={cn(
                        '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition',
                        active ? 'bg-subtle' : 'hover:bg-subtle',
                      )}
                    >
                      <CategoryIcon category={category} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-medium text-ink">{category?.name ?? 'Uncategorized'}</span>
                          <span className="shrink-0 text-[15px] font-semibold text-ink tabular-nums">{formatINR(item.amount)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${max ? (item.amount / max) * 100 : 0}%`,
                                backgroundColor: colorVar(category?.color ?? 'slate'),
                              }}
                            />
                          </div>
                          <span className="w-24 shrink-0 text-right text-xs text-muted tabular-nums">
                            {formatPercent(item.share)} · {item.count} {item.count === 1 ? 'txn' : 'txns'}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {unused.length > 0 && (
              <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Nothing in: {unused.map((c) => c.name).join(', ')}</p>
            )}
          </Card>

          {selected && detail && (
            <Card className="lg:col-span-2 lg:self-start">
              <div className="flex items-center gap-3">
                <CategoryIcon category={selectedCategory} size="lg" />
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-ink">{selectedCategory?.name ?? 'Uncategorized'}</h2>
                  <p className="text-sm text-muted">
                    {period.label} · {formatPercent(selected.share)} of {type === 'expense' ? 'spending' : 'income'}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 rounded-2xl bg-subtle p-3 text-center">
                <div>
                  <dt className="text-[11px] text-muted">Total</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">{formatINR(selected.amount)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Transactions</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">{selected.count}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Average</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">{formatINR(Math.round(selected.amount / selected.count))}</dd>
                </div>
              </dl>
              <h3 className="mt-5 mb-2 text-[13px] font-semibold text-ink-2">Last 6 months</h3>
              <MonthlyTrendChart months={detail.months} dataKey={type} color={colorVar(selectedCategory?.color ?? 'slate')} height={160} />
              <h3 className="mt-4 mb-1 text-[13px] font-semibold text-ink-2">Largest in this period</h3>
              <ul className="divide-y divide-line/70">
                {detail.largest.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/transactions/${t.id}/edit`}
                      className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{describe(t, lookup).title}</span>
                        <span className="text-xs text-muted">{formatDate(t.date)}</span>
                      </span>
                      <Amount value={t.amount} type={t.type} />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                to={`/transactions?category=${encodeURIComponent(selected.categoryId)}&from=${period.start}&to=${period.end}`}
                className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
              >
                All transactions <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Card>
          )}
        </div>
      )}

      <CategoryManager open={managing} onClose={() => setManaging(false)} />
    </>
  );
}
