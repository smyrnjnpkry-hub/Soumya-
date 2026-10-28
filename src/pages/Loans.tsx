import { CalendarClock, CircleAlert, CircleCheck, Landmark, OctagonAlert, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LoanForm, PayEmiForm } from '@/components/forms/LoanForms';
import { EmptyState, StatusPill } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Field, Input, MoneyInput, sanitizeAmount } from '@/components/ui/Form';
import { ProgressBar } from '@/components/ui/Progress';
import { todayISO } from '@/lib/dates';
import { formatDate, formatINR, formatMonth, formatPercent } from '@/lib/format';
import { calculateEmi, loanSummary } from '@/lib/loans';
import type { Loan } from '@/lib/types';
import { useFinance } from '@/store/finance';

function DueStatus({ days, closed }: { days: number; closed: boolean }) {
  if (closed)
    return (
      <StatusPill icon={CircleCheck} tone="ok">
        Repaid
      </StatusPill>
    );
  if (days < 0)
    return (
      <StatusPill icon={OctagonAlert} tone="danger">
        Overdue by {-days} {days === -1 ? 'day' : 'days'}
      </StatusPill>
    );
  if (days <= 7)
    return (
      <StatusPill icon={CircleAlert} tone="warning">
        {days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`}
      </StatusPill>
    );
  return (
    <StatusPill icon={CalendarClock} tone="info">
      Due in {days} days
    </StatusPill>
  );
}

function EmiCalculator() {
  const [principal, setPrincipal] = useState('500000');
  const [rate, setRate] = useState('9.5');
  const [years, setYears] = useState('5');
  const months = Math.round(Number(years) * 12);
  const emi = calculateEmi(Number(principal), Number(rate) || 0, months);
  const total = emi * months;
  const interest = Math.max(total - Number(principal), 0);
  return (
    <Card>
      <CardHeader title="EMI calculator" subtitle="Plan a new loan before you take it" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Amount" htmlFor="calc-principal">
          <MoneyInput id="calc-principal" value={principal} onChange={setPrincipal} />
        </Field>
        <Field label="Rate %" htmlFor="calc-rate">
          <Input id="calc-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(sanitizeAmount(e.target.value))} />
        </Field>
        <Field label="Years" htmlFor="calc-years">
          <Input id="calc-years" inputMode="decimal" value={years} onChange={(e) => setYears(sanitizeAmount(e.target.value))} />
        </Field>
      </div>
      <div className="mt-4 rounded-2xl bg-primary-soft p-4">
        <p className="text-xs font-medium text-primary-ink">Monthly EMI</p>
        <p className="text-3xl font-bold tracking-tight text-ink">{emi > 0 ? formatINR(Math.round(emi)) : '—'}</p>
        {emi > 0 && (
          <p className="mt-1 text-[13px] text-ink-2">
            Total interest <span className="font-semibold text-ink">{formatINR(Math.round(interest))}</span> · total paid{' '}
            <span className="font-semibold text-ink">{formatINR(Math.round(total))}</span>
          </p>
        )}
      </div>
    </Card>
  );
}

export default function Loans() {
  const loans = useFinance((s) => s.loans);
  const today = todayISO();
  const [editing, setEditing] = useState<Loan | 'new' | null>(null);
  const [paying, setPaying] = useState<Loan | null>(null);

  const rows = useMemo(
    () =>
      loans
        .map((loan) => ({ loan, s: loanSummary(loan, today) }))
        .sort((a, b) => Number(a.s.isClosed) - Number(b.s.isClosed) || a.loan.nextDue.localeCompare(b.loan.nextDue)),
    [loans, today],
  );
  const active = rows.filter((r) => !r.s.isClosed);
  const outstanding = active.reduce((sum, r) => sum + r.s.outstanding, 0);
  const monthlyEmi = active.reduce((sum, r) => sum + r.loan.emi, 0);
  const interestLeft = active.reduce((sum, r) => sum + r.s.remainingInterest, 0);
  const next = active[0];

  return (
    <>
      <PageHeader
        title="Loans & EMI"
        subtitle="Track EMIs, interest and when you’ll be debt-free"
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add loan
          </Button>
        }
      />

      {loans.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <Card>
            <EmptyState
              icon={Landmark}
              title="No loans tracked"
              description="Add a home, car, education or personal loan to see your EMIs, interest left and payoff date."
              action={
                <Button icon={Plus} onClick={() => setEditing('new')}>
                  Add a loan
                </Button>
              }
            />
          </Card>
          <EmiCalculator />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4 lg:gap-5">
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Outstanding</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(Math.round(outstanding))}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">EMIs per month</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(monthlyEmi)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Interest left</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(Math.round(interestLeft))}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Next EMI</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {next ? formatDate(next.loan.nextDue, 'short') : '—'}
              </p>
              {next && <p className="mt-0.5 truncate text-xs text-muted">{next.loan.name}</p>}
            </Card>
          </div>

          {rows.map(({ loan, s }) => (
            <Card key={loan.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-ink">{loan.name}</h2>
                  <p className="text-[13px] text-muted">
                    {formatINR(loan.principal)} at {loan.interestRate}% a year
                  </p>
                </div>
                <IconButton label={`Edit ${loan.name}`} onClick={() => setEditing(loan)} className="-mt-1 -mr-2">
                  <Pencil className="size-4" />
                </IconButton>
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span className="font-medium text-ink">{formatPercent(s.progress)} repaid</span>
                  <span className="text-xs text-muted tabular-nums">
                    {formatINR(Math.round(s.paidPrincipal))} of {formatINR(loan.principal)}
                  </span>
                </div>
                <ProgressBar
                  value={s.progress}
                  color={s.isClosed ? 'var(--income-mark)' : 'var(--primary)'}
                  label={`${loan.name} repaid`}
                  className="h-2.5"
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">EMI</dt>
                  <dd className="font-semibold text-ink">{formatINR(loan.emi)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Outstanding</dt>
                  <dd className="font-semibold text-ink">{formatINR(Math.round(s.outstanding))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">EMIs left</dt>
                  <dd className="font-semibold text-ink">{loan.remainingTenure}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Interest left</dt>
                  <dd className="font-semibold text-ink">{formatINR(Math.round(s.remainingInterest))}</dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                <div className="space-y-1">
                  <DueStatus days={s.daysUntilDue} closed={s.isClosed} />
                  <p className="text-xs text-muted">
                    {s.isClosed
                      ? 'No EMIs left'
                      : `Next on ${formatDate(loan.nextDue)} · debt-free by ${formatMonth(s.payoffDate!.slice(0, 7))}`}
                  </p>
                </div>
                {!s.isClosed && (
                  <Button variant="soft" size="sm" onClick={() => setPaying(loan)}>
                    Mark EMI paid
                  </Button>
                )}
              </div>
            </Card>
          ))}

          <EmiCalculator />
        </div>
      )}

      <LoanForm open={editing !== null} onClose={() => setEditing(null)} loan={editing && editing !== 'new' ? editing : undefined} />
      <PayEmiForm loan={paying} onClose={() => setPaying(null)} />
    </>
  );
}
