import { ArrowDownLeft, ArrowRight, ArrowUpRight, CreditCard, HandCoins, Landmark, PiggyBank, Plus, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CardStatus } from '@/components/cards/CardStatus';
import { SpendingDonut } from '@/components/charts/Charts';
import { EntryForm, PaymentForm } from '@/components/forms/LentBorrowedForms';
import { InsightItem } from '@/components/insights/InsightItem';
import { LendingDue } from '@/components/lending/LendingDue';
import { ACCOUNT_ICONS, BUDGET_COLORS } from '@/components/meta';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import { EmptyState, StatusPill } from '@/components/ui/Bits';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { ProgressBar, ProgressRing } from '@/components/ui/Progress';
import { cardsOverview, cardSummary, usageLevel } from '@/lib/cards';
import { daysBetween, monthBounds, monthKey, todayISO } from '@/lib/dates';
import { accountBalances, budgetProgress, categoryBreakdown, foldBreakdown, monthTotals } from '@/lib/finance';
import { formatDate, formatINR, formatMonth, formatPercent } from '@/lib/format';
import { buildInsights } from '@/lib/insights';
import { entrySummary, lendingOverview, type PaymentKind } from '@/lib/lending';
import { sortByDateDesc } from '@/lib/transactions';
import type { LentBorrowed } from '@/lib/types';
import { cn } from '@/lib/ui';
import { useFinance, useFinanceData, useLookups } from '@/store/finance';

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Change vs the same days last month; `upIsGood` decides the colour. */
function Delta({ change, upIsGood }: { change: number | null; upIsGood: boolean }) {
  if (change === null || !Number.isFinite(change)) return <span className="text-xs text-muted">No data last month</span>;
  const up = change >= 0;
  const good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownLeft;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-income' : 'text-expense')}>
      <Icon className="size-3.5" aria-hidden />
      {formatPercent(Math.abs(change))}
      <span className="font-normal text-muted">&nbsp;vs last month</span>
    </span>
  );
}

function SampleBanner() {
  const startFresh = useFinance((s) => s.startFresh);
  const dismiss = useFinance((s) => s.dismissSample);
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary-soft p-4 sm:items-center">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-primary sm:mt-0" aria-hidden />
      <p className="flex-1 text-sm text-ink">
        <span className="font-semibold">You’re exploring sample data.</span>{' '}
        <span className="text-ink-2">Start fresh when you’re ready to track your own money.</span>
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={startFresh}>
          Start fresh
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Keep sample data and hide this message"
          className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-surface/60"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const data = useFinanceData();
  const lookup = useLookups();
  const isSample = useFinance((s) => s.isSample);
  const today = todayISO();
  const key = monthKey(today);
  const { start, end } = monthBounds(key);
  const [paying, setPaying] = useState<{ entry: LentBorrowed; kind: PaymentKind } | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);

  const view = useMemo(() => {
    const balances = accountBalances(data.accounts, data.transactions);
    const totals = monthTotals(data.transactions, key);
    const breakdown = categoryBreakdown(data.transactions, { type: 'expense', start, end });
    const report = buildInsights(data, today);
    const budgets = budgetProgress(data.budgets, data.transactions, key);
    const nextEmi = data.loans.filter((l) => l.remainingTenure > 0).sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
    const cards = data.creditCards.length ? cardsOverview(data.creditCards) : null;
    const people = data.lentBorrowed.map((entry) => ({ entry, s: entrySummary(entry, today) }));
    const lending = people.some(({ s }) => !s.settled)
      ? {
          overview: lendingOverview(data.lentBorrowed, today),
          dueSoon: people
            .filter(({ s }) => s.dueSoon)
            .sort((a, b) => a.s.due!.days - b.s.due!.days)
            .slice(0, 2),
        }
      : null;
    return {
      balances,
      total: Object.values(balances).reduce((s, b) => s + b, 0),
      totals,
      slices: foldBreakdown(breakdown, 6),
      report,
      budgets,
      nextEmi,
      cards,
      lending,
      recent: sortByDateDesc(data.transactions).slice(0, 6),
    };
  }, [data, key, start, end, today]);

  const { totals, report, budgets } = view;
  const rate = totals.savingsRate;
  const topBudgets = [...budgets.items].sort((a, b) => b.ratio - a.ratio).slice(0, 4);

  return (
    <>
      {isSample && <SampleBanner />}
      <PageHeader title={greeting()} subtitle={`Here’s your money in ${formatMonth(key)}`} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        {/* Balance hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f6fed] to-[#1e40af] p-5 text-white shadow-pop sm:p-6 lg:col-span-2">
          <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10" aria-hidden />
          <div className="pointer-events-none absolute -right-24 -bottom-24 size-64 rounded-full bg-white/5" aria-hidden />
          <p className="text-sm font-medium text-blue-100">Total balance</p>
          <p className="mt-1 text-[40px] leading-tight font-bold tracking-tight sm:text-5xl">{formatINR(view.total)}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[13px] font-medium">
            {totals.net >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownLeft className="size-3.5" aria-hidden />}
            {formatINR(totals.net, { sign: true })} net this month
          </p>
          <div className="relative mt-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {data.accounts.map((a) => {
              const Icon = ACCOUNT_ICONS[a.type];
              return (
                <Link
                  key={a.id}
                  to={`/transactions?account=${a.id}`}
                  className="flex min-w-[9.5rem] shrink-0 items-center gap-2.5 rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur-sm transition hover:bg-white/20"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-white/15">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-blue-100">{a.name}</span>
                    <span className="block text-sm font-semibold tabular-nums">{formatINR(view.balances[a.id] ?? 0)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Savings rate */}
        <Card className="flex flex-col">
          <CardHeader title="Savings rate" subtitle="Share of this month’s income kept" />
          <div className="flex flex-1 items-center gap-5">
            <ProgressRing
              value={rate !== null ? Math.max(rate, 0) : 0}
              color={
                rate !== null && rate >= 0.2
                  ? 'var(--income-mark)'
                  : rate !== null && rate >= 0
                    ? 'var(--warning-mark)'
                    : 'var(--critical-mark)'
              }
              label="Savings rate"
            >
              <span className="text-xl font-bold text-ink">{rate !== null ? formatPercent(rate) : '—'}</span>
            </ProgressRing>
            <div className="min-w-0 text-sm">
              {rate === null ? (
                <p className="text-muted">Add this month’s income to see your savings rate.</p>
              ) : (
                <>
                  <StatusPill icon={PiggyBank} tone={rate >= 0.2 ? 'ok' : rate >= 0 ? 'warning' : 'danger'}>
                    {rate >= 0.2 ? 'On target' : rate >= 0 ? 'Below 20% target' : 'Overspending'}
                  </StatusPill>
                  {report.savings.projected !== null && (
                    <p className="mt-2 text-ink-2">
                      {report.savings.projected >= 0 ? 'On track to save ' : 'Projected shortfall '}
                      <span className="font-semibold text-ink">{formatINR(Math.abs(Math.round(report.savings.projected)))}</span> this
                      month.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Income / expense tiles */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-3 lg:grid-cols-4 lg:gap-5">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">Income</span>
              <span className="grid size-8 place-items-center rounded-lg bg-income-soft text-income">
                <ArrowDownLeft className="size-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(totals.income)}</p>
            <div className="mt-1">
              <Delta
                change={report.income.previous > 0 ? (report.income.current - report.income.previous) / report.income.previous : null}
                upIsGood
              />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-muted">Expenses</span>
              <span className="grid size-8 place-items-center rounded-lg bg-expense-soft text-expense">
                <ArrowUpRight className="size-4" aria-hidden />
              </span>
            </div>
            <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(totals.expense)}</p>
            <div className="mt-1">
              <Delta change={report.spending.changePct} upIsGood={false} />
            </div>
          </Card>
          <Card className="p-4">
            <span className="text-[13px] font-medium text-muted">Avg. daily spend</span>
            <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(Math.round(report.spending.avgDaily))}</p>
            <p className="mt-1 text-xs text-muted">over {report.period.dayOfMonth} days</p>
          </Card>
          <Card className="p-4">
            <span className="text-[13px] font-medium text-muted">Projected spend</span>
            <p className="mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(Math.round(report.spending.projected))}</p>
            <p className="mt-1 text-xs text-muted">by {formatDate(end, 'short')}</p>
          </Card>
        </div>

        {/* Spending by category */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Spending by category"
            subtitle={formatMonth(key)}
            action={
              <Link to="/categories" className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                Details <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {view.slices.length ? (
            <SpendingDonut items={view.slices} categories={lookup.categories} total={totals.expense} linkRange={{ from: start, to: end }} />
          ) : (
            <EmptyState
              icon={PiggyBank}
              title="No spending yet this month"
              description="Expenses you add will be grouped by category here."
            />
          )}
        </Card>

        {/* Budget snapshot */}
        <Card>
          <CardHeader
            title="Budget"
            subtitle={
              budgets.items.length
                ? `${formatINR(Math.max(budgets.totalLimit - budgets.totalSpent, 0))} left of ${formatINR(budgets.totalLimit)}`
                : formatMonth(key)
            }
            action={
              <Link to="/budget" className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                Manage <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {budgets.items.length ? (
            <ul className="space-y-4">
              {topBudgets.map((b) => {
                const category = lookup.categories[b.budget.category];
                return (
                  <li key={b.budget.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-ink">{category?.name ?? 'Uncategorized'}</span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        <span className={cn('font-semibold', b.status === 'over' ? 'text-expense' : 'text-ink')}>{formatINR(b.spent)}</span>{' '}
                        / {formatINR(b.budget.limit)}
                      </span>
                    </div>
                    <ProgressBar value={b.ratio} color={BUDGET_COLORS[b.status]} label={`${category?.name ?? 'Budget'} used`} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={PiggyBank}
              title="No budgets yet"
              action={
                <ButtonLink to="/budget" variant="soft" size="sm">
                  Set a budget
                </ButtonLink>
              }
            />
          )}
        </Card>

        {/* Recent transactions */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent transactions"
            action={
              <Link to="/transactions" className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                View all <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          {view.recent.length ? (
            <div className="divide-y divide-line/70">
              {view.recent.map((t) => (
                <TransactionRow key={t.id} t={t} lookup={lookup} showDate />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Plus}
              title="No transactions yet"
              description="Add your first income or expense to get started."
              action={
                <ButtonLink to="/transactions/new" icon={Plus}>
                  Add transaction
                </ButtonLink>
              }
            />
          )}
        </Card>

        {/* Insights teaser + next EMI */}
        <div className="flex flex-col gap-4 lg:gap-5">
          <Card>
            <CardHeader
              title="Insights"
              action={
                <Link to="/insights" className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                  See all <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            {report.insights.length ? (
              <div className="space-y-4">
                {report.insights.slice(0, 3).map((i) => (
                  <InsightItem key={i.id} insight={i} compact />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Insights appear once you’ve added a few transactions.</p>
            )}
          </Card>
          {view.nextEmi && (
            <Link to="/loans" className="card flex items-center gap-3 p-4 transition hover:border-primary/40">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <Landmark className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{view.nextEmi.name} EMI</p>
                <p className="text-xs text-muted">
                  {(() => {
                    const days = daysBetween(today, view.nextEmi.nextDue);
                    return days < 0
                      ? `Overdue by ${-days} days`
                      : days === 0
                        ? 'Due today'
                        : `Due in ${days} days · ${formatDate(view.nextEmi.nextDue, 'short')}`;
                  })()}
                </p>
              </div>
              <span className="text-sm font-semibold text-ink tabular-nums">{formatINR(view.nextEmi.emi)}</span>
            </Link>
          )}
          {view.cards && (
            <Link to="/credit-cards" className="card block p-4 transition hover:border-primary/40">
              <span className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <CreditCard className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">Credit cards</span>
                  <span className="block text-xs text-muted">Not part of your balance</span>
                </span>
                <span className="text-right">
                  <span className="block text-base font-bold text-ink tabular-nums">{formatINR(view.cards.owed)}</span>
                  <span className="block text-xs text-muted">owed</span>
                </span>
              </span>
              <ProgressBar
                value={view.cards.usage}
                color={BUDGET_COLORS[usageLevel(view.cards.usage)]}
                label="All cards: limit used"
                className="mt-3.5"
              />
              <span className="mt-1.5 block text-xs text-muted">
                <span className="font-semibold text-ink">{formatPercent(view.cards.usage)}</span> of {formatINR(view.cards.limit)} limits
                used
              </span>
              {view.cards.next && (
                <span className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="min-w-0 text-[13px] text-ink-2">
                    Next: <span className="font-semibold text-ink">{view.cards.next.name}</span> · {formatINR(view.cards.next.minDue)}{' '}
                    <span className="whitespace-nowrap">by {formatDate(view.cards.next.dueDate, 'short')}</span>
                  </span>
                  <span className="shrink-0">
                    <CardStatus s={cardSummary(view.cards.next, today)} />
                  </span>
                </span>
              )}
            </Link>
          )}
          {view.lending && (
            <section aria-labelledby="dash-lending" className="card p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <HandCoins className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="dash-lending" className="truncate text-sm font-semibold text-ink">
                    Lent & Borrowed
                  </h2>
                  <p className="text-xs text-muted">Not part of your balance</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-ink tabular-nums">{formatINR(Math.abs(view.lending.overview.net))}</p>
                  <p className="text-xs text-muted">{view.lending.overview.net >= 0 ? 'owed to you' : 'you owe'}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">Owed to you</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatINR(view.lending.overview.owedToYou)}</dd>
                </div>
                <div>
                  <dt className="text-muted">You owe</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatINR(view.lending.overview.youOwe)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Interest this month</dt>
                  <dd className="font-semibold text-ink tabular-nums">{formatINR(view.lending.overview.interestThisMonth)}</dd>
                </div>
              </dl>
              {view.lending.dueSoon.length > 0 && (
                <ul className="mt-3 space-y-2.5 border-t border-line pt-3">
                  {view.lending.dueSoon.map(({ entry, s }) => (
                    <li key={entry.id} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {entry.person} · {formatINR(s.due!.amount)}
                        </p>
                        <div className="mt-0.5">
                          <LendingDue s={s} />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => setPaying({ entry, kind: s.due!.kind === 'interest' ? 'interest' : 'money' })}
                      >
                        {s.due!.kind === 'interest' ? 'Record interest' : 'Record payment'}
                        <span className="sr-only"> for {entry.person}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Plus}
                  className="-ml-3"
                  aria-label="Add to Lent & Borrowed"
                  onClick={() => setAddingPerson(true)}
                >
                  Add
                </Button>
                <Link to="/lent-borrowed" className="flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                  View all <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      <PaymentForm entry={paying?.entry ?? null} kind={paying?.kind ?? 'interest'} onClose={() => setPaying(null)} />
      <EntryForm open={addingPerson} onClose={() => setAddingPerson(false)} />
    </>
  );
}
