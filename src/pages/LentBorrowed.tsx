import { Bell, Download, HandCoins, MessageCircle, Pencil, Phone, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CorrectionForm, EntryForm, PaymentForm } from '@/components/forms/LentBorrowedForms';
import { LendingDue } from '@/components/lending/LendingDue';
import { EmptyState } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Chip, Input } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/Progress';
import { todayISO } from '@/lib/dates';
import { downloadCSV } from '@/lib/download';
import { formatDate, formatINR, round2 } from '@/lib/format';
import {
  entrySummary,
  filterEntries,
  lendingOverview,
  lendingToCSV,
  whatsappReminder,
  type LendingFilter,
  type PaymentKind,
} from '@/lib/lending';
import type { LentBorrowed, LentBorrowedPayment } from '@/lib/types';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';

const FILTERS: { value: LendingFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'lent', label: 'I lent' },
  { value: 'borrowed', label: 'I borrowed' },
  { value: 'interest', label: 'With interest' },
  { value: 'no-interest', label: 'No interest' },
  { value: 'due-soon', label: 'Due soon' },
];

const PAYMENT_LABEL: Record<LentBorrowedPayment['type'], string> = {
  interest: 'Interest',
  principal: 'Money back',
  mixed: 'Interest + money back',
  settlement: 'Settled',
  correction: 'Correction',
};

function HistoryRow({ entry, payment, onDelete }: { entry: LentBorrowed; payment: LentBorrowedPayment; onDelete: () => void }) {
  const parts =
    payment.type === 'correction'
      ? [
          payment.principalPortion >= 0
            ? `${formatINR(payment.principalPortion)} less owed`
            : `${formatINR(-payment.principalPortion)} more owed`,
        ]
      : [
          payment.interestPortion > 0 && `${formatINR(payment.interestPortion)} interest`,
          payment.principalPortion > 0 && `${formatINR(payment.principalPortion)} back`,
          payment.waived && `${formatINR(payment.waived)} interest let go`,
        ].filter(Boolean);
  const origin = payment.linkedTransactionId ? (payment.addedTransaction ? 'added to your transactions' : 'linked transaction') : '';
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {PAYMENT_LABEL[payment.type]} <span className="font-normal text-muted">· {formatDate(payment.date, 'short')}</span>
        </p>
        <p className="truncate text-xs text-muted">{[parts.join(' · '), origin, payment.note].filter(Boolean).join(' · ')}</p>
      </div>
      <IconButton
        label={`Delete ${PAYMENT_LABEL[payment.type].toLowerCase()} of ${formatDate(payment.date, 'short')} for ${entry.person}`}
        onClick={onDelete}
        className="text-muted hover:text-expense"
      >
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

function PersonCard({
  entry,
  today,
  onEdit,
  onPay,
  onDeletePayment,
}: {
  entry: LentBorrowed;
  today: string;
  onEdit: () => void;
  onPay: (kind: PaymentKind) => void;
  onDeletePayment: (payment: LentBorrowedPayment) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const s = entrySummary(entry, today);
  const lent = entry.direction === 'lent';
  const back = round2(Math.max(entry.principal - s.owed, 0));
  const whatsapp = whatsappReminder(entry, today);
  const titleId = `lb-${entry.id}-title`;
  const historyId = `lb-${entry.id}-history`;
  const yearly = round2(entry.interestRate * 12);
  const history = [...entry.payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card aria-labelledby={titleId} className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-1.5 truncate text-base font-semibold text-ink">
            <span className="truncate">{entry.person}</span>
            {entry.remind && <Bell className="size-3.5 shrink-0 text-muted" aria-label="Reminders on" />}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={
                lent
                  ? 'rounded-full bg-income-soft px-2 py-0.5 text-[11px] font-semibold text-income'
                  : 'rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning'
              }
            >
              {lent ? 'You lent' : 'You borrowed'}
            </span>
            <LendingDue s={s} />
          </div>
        </div>
        <IconButton label={`Edit ${entry.person}`} onClick={onEdit} className="-mt-1 -mr-2">
          <Pencil className="size-4" />
        </IconButton>
      </div>
      {(entry.phone || entry.note) && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {entry.phone && (
            <a href={`tel:${entry.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="size-3.5" aria-hidden />
              {entry.phone}
            </a>
          )}
          {entry.note && <span className="min-w-0 truncate">{entry.note}</span>}
        </p>
      )}

      <div className="mt-4">
        <p className="text-ink">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{formatINR(s.owed)}</span>{' '}
          <span className="text-sm text-muted">still owed of {formatINR(entry.principal)}</span>
        </p>
        <ProgressBar
          value={entry.principal > 0 ? back / entry.principal : 0}
          color="var(--income-mark)"
          label={`${entry.person}: paid back`}
          className="mt-2.5 h-2.5"
        />
        <p className="mt-1.5 text-xs text-muted">
          <span className="font-semibold text-ink">{formatINR(back)}</span> paid back
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted">Interest</dt>
          <dd className="font-semibold text-ink">
            {entry.interestType === 'none' ? (
              'No interest'
            ) : (
              <>
                {entry.interestRate}% a month <span className="font-normal whitespace-nowrap text-muted">({yearly}% a year)</span>
              </>
            )}
          </dd>
        </div>
        {entry.interestType !== 'none' && (
          <div>
            <dt className="text-xs text-muted">{entry.interestType === 'monthly' ? 'This month' : 'So far'}</dt>
            <dd className="font-semibold text-ink">
              {entry.interestType === 'monthly' ? formatINR(s.interest.perMonth) : `about ${formatINR(Math.round(s.interest.charged))}`}
            </dd>
          </div>
        )}
        {entry.interestType !== 'none' && s.interest.pending > 0.5 && (
          <div>
            <dt className="text-xs text-muted">Interest pending</dt>
            <dd className={s.due && s.due.days < 0 ? 'font-semibold text-expense' : 'font-semibold text-warning'}>
              {formatINR(s.interest.pending)}
            </dd>
          </div>
        )}
        {entry.dueDate && (
          <div>
            <dt className="text-xs text-muted">Money back by</dt>
            <dd className="font-semibold text-ink">{formatDate(entry.dueDate)}</dd>
          </div>
        )}
      </dl>

      {!s.settled && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="soft"
            size="sm"
            onClick={() => onPay(entry.interestType !== 'none' && s.interest.pending > 0.5 ? 'interest' : 'money')}
            className="flex-1 sm:flex-none"
          >
            Record payment
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onPay('settle')}>
            Settle
          </Button>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-subtle"
            >
              <MessageCircle className="size-4" aria-hidden />
              Remind on WhatsApp
            </a>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        {history.length ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3"
              aria-expanded={showHistory}
              aria-controls={historyId}
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? 'Hide history' : `History (${history.length})`}
            </Button>
            {showHistory && (
              <ul id={historyId} className="divide-y divide-line/70">
                {history.map((p) => (
                  <HistoryRow key={p.id} entry={entry} payment={p} onDelete={() => onDeletePayment(p)} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted">No payments yet.</p>
        )}
      </div>
    </Card>
  );
}

function BalanceNote() {
  return (
    <Card className="flex gap-3 lg:col-span-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-ink-2" aria-hidden>
        <Wallet className="size-[18px]" />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-ink">Your balance stays the same</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Money people owe you isn’t added to it. Money lent, borrowed or paid back isn’t counted as income or spending — only interest is.
        </p>
      </div>
    </Card>
  );
}

export default function LentBorrowed() {
  const entries = useFinance((s) => s.lentBorrowed);
  const deleteLentBorrowedPayment = useFinance((s) => s.deleteLentBorrowedPayment);
  const today = todayISO();
  const [filter, setFilter] = useState<LendingFilter>('all');
  const [query, setQuery] = useState('');
  const [showSettled, setShowSettled] = useState(false);
  const [editing, setEditing] = useState<LentBorrowed | 'new' | null>(null);
  const [paying, setPaying] = useState<{ entry: LentBorrowed; kind: PaymentKind } | null>(null);
  const [correcting, setCorrecting] = useState<LentBorrowed | null>(null);
  const [deleting, setDeleting] = useState<{ entry: LentBorrowed; payment: LentBorrowedPayment } | null>(null);

  const overview = useMemo(() => lendingOverview(entries, today), [entries, today]);
  const visible = useMemo(
    () => filterEntries(entries, { filter, query, showSettled }, today),
    [entries, filter, query, showSettled, today],
  );

  const exportCsv = () => {
    downloadCSV(`lent-borrowed-${today}.csv`, lendingToCSV(visible, today));
    toast(`Exported ${visible.length} ${visible.length === 1 ? 'person' : 'people'}`);
  };

  return (
    <>
      <PageHeader
        title="Lent & Borrowed"
        subtitle="Money you’ve lent to people and borrowed from them"
        actions={
          <>
            {entries.length > 0 && (
              <Button variant="secondary" icon={Download} onClick={exportCsv}>
                Export
              </Button>
            )}
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add
            </Button>
          </>
        }
      />

      {entries.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <Card className="lg:col-span-2">
            <EmptyState
              icon={HandCoins}
              title="No one yet"
              description="Add money you’ve lent to someone or borrowed from them to see what’s owed, interest and what’s due."
              action={
                <Button icon={Plus} onClick={() => setEditing('new')}>
                  Add someone
                </Button>
              }
            />
          </Card>
          <BalanceNote />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-4 lg:gap-5">
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Net position</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(Math.abs(overview.net))}</p>
              <p className="mt-0.5 text-xs text-muted">
                {overview.net > 0 ? 'owed to you overall' : overview.net < 0 ? 'you owe overall' : 'all square'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Owed to you</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(overview.owedToYou)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">You owe</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(overview.youOwe)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Interest this month</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(overview.interestThisMonth)}</p>
              <p className="mt-0.5 text-xs text-muted">
                {overview.pendingToYou > 0 ? `${formatINR(overview.pendingToYou)} pending` : 'received'}
              </p>
            </Card>
          </div>

          <div className="space-y-3 lg:col-span-2">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                type="search"
                aria-label="Search by name or note"
                placeholder="Search by name or note"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
                  {f.label}
                </Chip>
              ))}
              <label className="ml-auto inline-flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={showSettled}
                  onChange={(e) => setShowSettled(e.target.checked)}
                  className="size-4 accent-[var(--primary-fill)]"
                />
                Show settled
              </label>
            </div>
          </div>

          {visible.length ? (
            visible.map((entry) => (
              <PersonCard
                key={entry.id}
                entry={entry}
                today={today}
                onEdit={() => setEditing(entry)}
                onPay={(kind) => setPaying({ entry, kind })}
                onDeletePayment={(payment) => setDeleting({ entry, payment })}
              />
            ))
          ) : (
            <Card className="lg:col-span-2">
              <EmptyState
                icon={Search}
                title="No one matches"
                description={showSettled ? 'Try another search or filter.' : 'Try another search or filter, or show settled entries.'}
                action={
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      setFilter('all');
                      setQuery('');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </Card>
          )}

          <BalanceNote />
        </div>
      )}

      <EntryForm
        open={editing !== null}
        onClose={() => setEditing(null)}
        entry={editing && editing !== 'new' ? editing : undefined}
        onCorrect={
          editing && editing !== 'new'
            ? () => {
                setCorrecting(editing);
                setEditing(null);
              }
            : undefined
        }
      />
      <PaymentForm entry={paying?.entry ?? null} kind={paying?.kind ?? 'interest'} onClose={() => setPaying(null)} />
      <CorrectionForm entry={correcting} onClose={() => setCorrecting(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this from the history?"
        message={
          deleting &&
          (deleting.payment.linkedTransactionId
            ? deleting.payment.addedTransaction
              ? 'The transaction added for it is removed too.'
              : 'The linked transaction stays and counts as normal income or spending again.'
            : 'What’s owed and the interest pending are worked out again without it.')
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (!deleting) return;
          deleteLentBorrowedPayment(deleting.entry.id, deleting.payment.id);
          toast('Deleted from the history');
        }}
      />
    </>
  );
}
