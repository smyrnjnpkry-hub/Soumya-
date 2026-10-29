import { FileUp, Plus, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { TransactionRow } from '@/components/transactions/TransactionRow';
import { EmptyState } from '@/components/ui/Bits';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Chip, Field, Input, Select } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { addMonthsToKey, monthBounds, monthKey, todayISO } from '@/lib/dates';
import { dayLabel, formatDate, formatINR } from '@/lib/format';
import { filterTransactions, groupByDay, incomeAndSpending, type TransactionFilters } from '@/lib/transactions';
import type { TransactionType } from '@/lib/types';
import { useFinance, useLookups } from '@/store/finance';

const TYPES: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfers' },
];

const PAGE = 60;

function usePeriods() {
  const key = monthKey(todayISO());
  const last = addMonthsToKey(key, -1);
  return [
    { id: 'this', label: 'This month', ...monthBounds(key) },
    { id: 'last', label: 'Last month', ...monthBounds(last) },
    { id: '3m', label: 'Last 3 months', start: monthBounds(addMonthsToKey(key, -2)).start, end: monthBounds(key).end },
  ];
}

export default function Transactions() {
  const transactions = useFinance((s) => s.transactions);
  const categories = useFinance((s) => s.categories);
  const accounts = useFinance((s) => s.accounts);
  const lookup = useLookups();
  const periods = usePeriods();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = todayISO();

  const paramsKey = params.toString();
  const filters = useMemo<TransactionFilters>(() => {
    const p = new URLSearchParams(paramsKey);
    return {
      query: p.get('q') ?? '',
      type: (p.get('type') as TransactionFilters['type']) ?? 'all',
      categoryId: p.get('category') ?? undefined,
      accountId: p.get('account') ?? undefined,
      from: p.get('from') ?? undefined,
      to: p.get('to') ?? undefined,
    };
  }, [paramsKey]);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
    setLimit(PAGE);
  };

  const filtered = useMemo(() => filterTransactions(transactions, filters, lookup), [transactions, filters, lookup]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const totals = useMemo(() => incomeAndSpending(filtered), [filtered]);

  // Render whole days until the row limit is reached
  const visible: typeof groups = [];
  let rows = 0;
  for (const g of groups) {
    if (rows >= limit) break;
    visible.push(g);
    rows += g.items.length;
  }

  const activePeriod = periods.find((p) => p.start === filters.from && p.end === filters.to);
  const customRange = !activePeriod && (filters.from || filters.to);
  const category = filters.categoryId ? lookup.categories[filters.categoryId] : undefined;
  const account = filters.accountId ? lookup.accounts[filters.accountId] : undefined;
  const advancedCount = [filters.categoryId, filters.accountId, customRange].filter(Boolean).length;
  const anyFilter = Boolean(
    filters.query || filters.type !== 'all' || filters.categoryId || filters.accountId || filters.from || filters.to,
  );

  const advancedFilters = (
    <>
      <Field label="Category" htmlFor="f-category">
        <Select id="f-category" value={filters.categoryId ?? ''} onChange={(e) => update({ category: e.target.value || undefined })}>
          <option value="">All categories</option>
          <optgroup label="Expense">
            {categories
              .filter((c) => c.type === 'expense')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Income">
            {categories
              .filter((c) => c.type === 'income')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
        </Select>
      </Field>
      <Field label="Account" htmlFor="f-account">
        <Select id="f-account" value={filters.accountId ?? ''} onChange={(e) => update({ account: e.target.value || undefined })}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="From" htmlFor="f-from">
        <Input
          id="f-from"
          type="date"
          value={filters.from ?? ''}
          max={filters.to}
          onChange={(e) => update({ from: e.target.value || undefined })}
        />
      </Field>
      <Field label="To" htmlFor="f-to">
        <Input
          id="f-to"
          type="date"
          value={filters.to ?? ''}
          min={filters.from}
          onChange={(e) => update({ to: e.target.value || undefined })}
        />
      </Field>
    </>
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`}
        actions={
          <ButtonLink to="/import" variant="secondary" size="sm" icon={FileUp}>
            Import statement
          </ButtonLink>
        }
      />

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search transactions</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              className="field pl-10"
              placeholder="Search transactions"
              value={filters.query}
              onChange={(e) => update({ q: e.target.value || undefined })}
            />
          </label>
          <Button
            variant="secondary"
            size="lg"
            className="relative px-3.5 lg:hidden"
            onClick={() => setFiltersOpen(true)}
            aria-label="More filters"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {advancedCount > 0 && (
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary-fill text-[11px] text-white">
                {advancedCount}
              </span>
            )}
          </Button>
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
          {TYPES.map((t) => (
            <Chip
              key={t.value}
              selected={filters.type === t.value}
              onClick={() => update({ type: t.value === 'all' ? undefined : t.value })}
            >
              {t.label}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
          {periods.map((p) => (
            <Chip
              key={p.id}
              selected={activePeriod?.id === p.id}
              onClick={() =>
                activePeriod?.id === p.id ? update({ from: undefined, to: undefined }) : update({ from: p.start, to: p.end })
              }
            >
              {p.label}
            </Chip>
          ))}
        </div>

        <div className="hidden gap-3 lg:grid lg:grid-cols-4">{advancedFilters}</div>

        {(category || account || customRange) && (
          <div className="flex flex-wrap gap-2">
            {category && (
              <Chip selected onClick={() => update({ category: undefined })} aria-label={`Remove filter ${category.name}`}>
                {category.name} <X className="size-3.5" aria-hidden />
              </Chip>
            )}
            {account && (
              <Chip selected onClick={() => update({ account: undefined })} aria-label={`Remove filter ${account.name}`}>
                {account.name} <X className="size-3.5" aria-hidden />
              </Chip>
            )}
            {customRange && (
              <Chip selected onClick={() => update({ from: undefined, to: undefined })} aria-label="Remove date filter">
                {filters.from ? formatDate(filters.from, 'short') : 'Start'} – {filters.to ? formatDate(filters.to, 'short') : 'Today'}
                <X className="size-3.5" aria-hidden />
              </Chip>
            )}
          </div>
        )}
      </div>

      {/* Totals for what's shown */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface p-3 text-center shadow-card sm:p-4">
        <div>
          <p className="text-xs text-muted">Money in</p>
          <p className="mt-0.5 font-semibold text-income tabular-nums">+{formatINR(totals.income)}</p>
        </div>
        <div className="border-x border-line">
          <p className="text-xs text-muted">Money out</p>
          <p className="mt-0.5 font-semibold text-expense tabular-nums">−{formatINR(totals.expense)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Net</p>
          <p className="mt-0.5 font-semibold text-ink tabular-nums">{formatINR(totals.income - totals.expense, { sign: true })}</p>
        </div>
      </div>

      {/* List */}
      <div className="mt-5 space-y-4">
        {visible.map((g) => (
          <section key={g.date} aria-label={dayLabel(g.date, today)}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-semibold text-ink-2">{dayLabel(g.date, today)}</h2>
              <span className="text-xs text-muted tabular-nums">
                {g.expense > 0 && <>−{formatINR(g.expense)}</>}
                {g.expense > 0 && g.income > 0 && ' · '}
                {g.income > 0 && <span className="text-income">+{formatINR(g.income)}</span>}
              </span>
            </div>
            <div className="card divide-y divide-line/70 px-4 py-1">
              {g.items.map((t) => (
                <TransactionRow key={t.id} t={t} lookup={lookup} />
              ))}
            </div>
          </section>
        ))}

        {rows < filtered.length && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
              Show more
            </Button>
          </div>
        )}

        {!filtered.length && (
          <Card>
            {transactions.length ? (
              <EmptyState
                icon={SearchX}
                title="No matching transactions"
                description="Try a different search or clear the filters."
                action={
                  anyFilter && (
                    <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>
                      Clear filters
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState
                icon={Plus}
                title="No transactions yet"
                description="Add your first income or expense — it takes a few seconds."
                action={
                  <ButtonLink to="/transactions/new" icon={Plus}>
                    Add transaction
                  </ButtonLink>
                }
              />
            )}
          </Card>
        )}
      </div>

      {/* Floating add button (phones use the raised + in the bottom bar) */}
      <Link
        to="/transactions/new"
        aria-label="Add transaction"
        className="fixed right-8 bottom-8 z-30 hidden size-14 place-items-center rounded-full bg-primary-fill text-white shadow-pop transition hover:scale-105 hover:bg-primary-fill-hover lg:grid"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </Link>

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => update({ category: undefined, account: undefined, from: undefined, to: undefined })}
            >
              Reset
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Show {filtered.length} results
            </Button>
          </>
        }
      >
        <div className="grid gap-4">{advancedFilters}</div>
      </Modal>
    </>
  );
}
