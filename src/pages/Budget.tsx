import { CircleAlert, CircleCheck, Copy, Gauge, OctagonAlert, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BudgetForm } from '@/components/forms/BudgetForm';
import { BUDGET_COLORS } from '@/components/meta';
import { CategoryIcon, EmptyState, MonthSwitcher, StatusPill } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/Progress';
import { addMonthsToKey, daysInMonth, monthBounds, monthKey, todayISO } from '@/lib/dates';
import { budgetProgress, categoryBreakdown, type BudgetProgress } from '@/lib/finance';
import { formatINR, formatMonth, formatPercent } from '@/lib/format';
import type { Budget as BudgetType } from '@/lib/types';
import { cn } from '@/lib/ui';
import { useFinance, useLookups } from '@/store/finance';
import { toast } from '@/store/toast';

const STATUS = {
  ok: { icon: CircleCheck, tone: 'ok', label: 'On track' },
  warning: { icon: CircleAlert, tone: 'warning', label: 'Almost used' },
  over: { icon: OctagonAlert, tone: 'danger', label: 'Over budget' },
} as const;

type FormState = { budget?: BudgetType; presetCategory?: string } | null;

export default function Budget() {
  const budgets = useFinance((s) => s.budgets);
  const transactions = useFinance((s) => s.transactions);
  const copyBudgets = useFinance((s) => s.copyBudgets);
  const lookup = useLookups();
  const today = todayISO();
  const currentKey = monthKey(today);
  const [month, setMonth] = useState(currentKey);
  const [form, setForm] = useState<FormState>(null);

  const { items, totalLimit, totalSpent } = useMemo(() => budgetProgress(budgets, transactions, month), [budgets, transactions, month]);
  const unbudgeted = useMemo(() => {
    const { start, end } = monthBounds(month);
    const budgeted = new Set(items.map((i) => i.budget.category));
    return categoryBreakdown(transactions, { type: 'expense', start, end }).filter(
      (i) => !budgeted.has(i.categoryId) && lookup.categories[i.categoryId],
    );
  }, [transactions, items, month, lookup]);

  const previousMonth = addMonthsToKey(month, -1);
  const canCopy = budgets.some((b) => b.month === previousMonth);
  const remaining = totalLimit - totalSpent;
  const daysLeft = month === currentKey ? daysInMonth(month) - Number(today.slice(8, 10)) + 1 : month > currentKey ? daysInMonth(month) : 0;
  const ratio = totalLimit > 0 ? totalSpent / totalLimit : 0;
  const overall = totalSpent > totalLimit ? 'over' : ratio >= 0.8 ? 'warning' : 'ok';

  const copy = () => {
    const n = copyBudgets(previousMonth, month);
    toast(n ? `Copied ${n} ${n === 1 ? 'budget' : 'budgets'} from ${formatMonth(previousMonth, 'short')}` : 'Nothing new to copy');
  };

  const sorted = [...items].sort((a, b) => b.ratio - a.ratio);

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle="Set monthly limits and see what’s left"
        actions={
          <>
            <MonthSwitcher value={month} onChange={setMonth} />
            <Button icon={Plus} onClick={() => setForm({})}>
              Add budget
            </Button>
          </>
        }
      />

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Gauge}
            title={`No budgets for ${formatMonth(month)}`}
            description="Give categories a monthly limit and FinTrack will track what’s left as you spend."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {canCopy && (
                  <Button variant="secondary" icon={Copy} onClick={copy}>
                    Copy {formatMonth(previousMonth, 'short')} budgets
                  </Button>
                )}
                <Button icon={Plus} onClick={() => setForm({})}>
                  Add budget
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          {/* Summary */}
          <Card className="lg:col-span-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-muted">{remaining >= 0 ? 'Left to spend' : 'Over budget by'}</p>
                <p className={cn('mt-1 text-4xl font-bold tracking-tight', remaining >= 0 ? 'text-ink' : 'text-expense')}>
                  {formatINR(Math.abs(remaining))}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatINR(totalSpent)} spent of {formatINR(totalLimit)} budgeted
                </p>
              </div>
              <StatusPill icon={STATUS[overall].icon} tone={STATUS[overall].tone}>
                {STATUS[overall].label} · {formatPercent(ratio)} used
              </StatusPill>
            </div>
            <ProgressBar value={ratio} color={BUDGET_COLORS[overall]} label="Total budget used" className="mt-4 h-3" />
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">Budgets</dt>
                <dd className="mt-0.5 font-semibold text-ink">{items.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Over the limit</dt>
                <dd className={cn('mt-0.5 font-semibold', items.some((i) => i.status === 'over') ? 'text-expense' : 'text-ink')}>
                  {items.filter((i) => i.status === 'over').length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Days left</dt>
                <dd className="mt-0.5 font-semibold text-ink">{daysLeft}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Safe to spend per day</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {daysLeft > 0 ? formatINR(Math.max(0, Math.floor(remaining / daysLeft))) : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          {/* Category budgets */}
          <Card className="lg:col-span-2">
            <CardHeader
              title="Category budgets"
              subtitle="Sorted by how much is used"
              action={
                canCopy && (
                  <Button variant="ghost" size="sm" icon={Copy} onClick={copy}>
                    Copy {formatMonth(previousMonth, 'short')}
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-line/70">
              {sorted.map((item) => (
                <BudgetRow key={item.budget.id} item={item} onEdit={() => setForm({ budget: item.budget })} />
              ))}
            </ul>
          </Card>

          {/* Spending without a budget */}
          <Card>
            <CardHeader title="Not budgeted" subtitle="Spending this month in categories without a limit" />
            {unbudgeted.length ? (
              <ul className="space-y-1">
                {unbudgeted.map((i) => {
                  const category = lookup.categories[i.categoryId];
                  return (
                    <li key={i.categoryId} className="flex items-center gap-3 py-1.5">
                      <CategoryIcon category={category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{category?.name}</p>
                        <p className="text-xs text-muted tabular-nums">{formatINR(i.amount)} spent</p>
                      </div>
                      <Button variant="soft" size="sm" onClick={() => setForm({ presetCategory: i.categoryId })}>
                        Set budget
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Every category you’ve spent in has a budget. Nice.</p>
            )}
          </Card>
        </div>
      )}

      <BudgetForm
        open={form !== null}
        onClose={() => setForm(null)}
        month={month}
        budget={form?.budget}
        presetCategory={form?.presetCategory}
      />
    </>
  );
}

function BudgetRow({ item, onEdit }: { item: BudgetProgress; onEdit: () => void }) {
  const lookup = useLookups();
  const category = lookup.categories[item.budget.category];
  const status = STATUS[item.status];
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-subtle"
      >
        <CategoryIcon category={category} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-medium text-ink">{category?.name ?? 'Uncategorized'}</span>
            <span className="shrink-0 text-sm text-muted tabular-nums">
              <span className={cn('font-semibold', item.status === 'over' ? 'text-expense' : 'text-ink')}>{formatINR(item.spent)}</span> /{' '}
              {formatINR(item.budget.limit)}
            </span>
          </div>
          <ProgressBar
            value={item.ratio}
            color={BUDGET_COLORS[item.status]}
            label={`${category?.name ?? 'Budget'}: ${formatPercent(item.ratio)} used`}
            className="mt-2"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <StatusPill icon={status.icon} tone={status.tone}>
              {status.label}
            </StatusPill>
            <span className={cn('text-xs font-medium tabular-nums', item.remaining < 0 ? 'text-expense' : 'text-muted')}>
              {item.remaining >= 0 ? `${formatINR(item.remaining)} left` : `${formatINR(-item.remaining)} over`}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}
