import { CircleAlert, CreditCard as CardIcon, Info, Link2, Pencil, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CardStatus } from '@/components/cards/CardStatus';
import { CardForm, LinkTransactionPicker, RecordPaymentForm } from '@/components/forms/CreditCardForms';
import { BUDGET_COLORS } from '@/components/meta';
import { describe } from '@/components/transactions/TransactionRow';
import { Amount, CategoryIcon, EmptyState } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Form';
import { ProgressBar } from '@/components/ui/Progress';
import { cardActivity, cardLabel, cardsOverview, cardSummary, unmatchedCardPayments, usageLevel } from '@/lib/cards';
import { todayISO } from '@/lib/dates';
import { formatDate, formatINR, formatPercent, round2, roughly } from '@/lib/format';
import type { Lookup } from '@/lib/transactions';
import type { CreditCard, Transaction } from '@/lib/types';
import { useFinance, useLookups } from '@/store/finance';
import { toast } from '@/store/toast';

const ACTIVITY_PREVIEW = 3;

/** Card bills in your transactions that don't say which card, each with a way to link it. */
function UnmatchedPayments({ payments, cards, lookup }: { payments: Transaction[]; cards: CreditCard[]; lookup: Lookup }) {
  const linkCardTransaction = useFinance((s) => s.linkCardTransaction);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const one = payments.length === 1;

  const link = (t: Transaction, cardId: string | null) => {
    const previous = linkCardTransaction(t.id, cardId);
    const card = cards.find((c) => c.id === cardId);
    toast(card ? `Linked to ${card.name}` : 'Marked as not a card payment', {
      label: 'Undo',
      onClick: () => linkCardTransaction(t.id, previous),
    });
  };

  return (
    <section aria-labelledby="unmatched-title" className="rounded-2xl border border-warning/30 bg-warning-soft p-4 sm:p-5 lg:col-span-2">
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <h2 id="unmatched-title" className="text-sm font-semibold text-ink">
            {payments.length} card {one ? 'payment isn’t' : 'payments aren’t'} matched to a card
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {one ? 'It looks like a card bill but doesn’t' : 'They look like card bills but don’t'} say which card. Link{' '}
            {one ? 'it' : 'each one'} so it shows under the right card.
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {payments.map((t) => {
          // A choice of a card deleted since falls back to the first card
          const selected = cards.some((c) => c.id === choice[t.id]) ? choice[t.id] : (cards[0]?.id ?? '');
          const { title } = describe(t, lookup);
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-surface p-3">
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium text-ink">{title}</p>
                <p className="truncate text-xs text-muted">
                  {formatDate(t.date, 'short')} · {lookup.accounts[t.account]?.name ?? 'Deleted account'}
                </p>
              </div>
              <Amount value={t.amount} type={t.type} className="text-sm" />
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                <label htmlFor={`link-${t.id}`} className="sr-only">
                  Card for {title}, {formatDate(t.date, 'short')}
                </label>
                <div className="w-full sm:w-56">
                  <Select id={`link-${t.id}`} value={selected} onChange={(e) => setChoice((c) => ({ ...c, [t.id]: e.target.value }))}>
                    {cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {cardLabel(c)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={() => link(t, selected)}>Link</Button>
                <Button size="sm" variant="ghost" onClick={() => link(t, null)}>
                  Not a card payment
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CardPanel({
  card,
  cards,
  transactions,
  lookup,
  today,
  onEdit,
  onPay,
  onLink,
}: {
  card: CreditCard;
  cards: CreditCard[];
  transactions: Transaction[];
  lookup: Lookup;
  today: string;
  onEdit: () => void;
  onPay: () => void;
  onLink: () => void;
}) {
  const linkCardTransaction = useFinance((s) => s.linkCardTransaction);
  const [showAll, setShowAll] = useState(false);
  const s = cardSummary(card, today);
  const activity = useMemo(() => cardActivity(card, cards, transactions), [card, cards, transactions]);
  const shown = showAll ? activity : activity.slice(0, ACTIVITY_PREVIEW);
  const overLimit = round2(card.outstanding - card.limit);
  const titleId = `credit-card-${card.id}-title`;

  const notThisCard = (t: Transaction) => {
    const previous = linkCardTransaction(t.id, null);
    toast(`Removed from ${card.name}`, { label: 'Undo', onClick: () => linkCardTransaction(t.id, previous) });
  };

  return (
    <Card aria-labelledby={titleId} className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-base font-semibold text-ink">
            {card.name}
            {card.last4 && <span className="ml-1.5 font-normal tracking-wide text-muted">••{card.last4}</span>}
          </h2>
          <div className="mt-1">
            <CardStatus s={s} />
          </div>
        </div>
        <IconButton label={`Edit ${card.name}`} onClick={onEdit} className="-mt-1 -mr-2">
          <Pencil className="size-4" />
        </IconButton>
      </div>

      <div className="mt-4">
        <p className="text-ink">
          <span className="text-2xl font-bold tracking-tight tabular-nums">{formatINR(card.outstanding)}</span>{' '}
          <span className="text-sm text-muted">owed of {formatINR(card.limit)}</span>
        </p>
        <ProgressBar
          value={s.usage}
          color={BUDGET_COLORS[usageLevel(s.usage)]}
          label={`${card.name}: limit used`}
          className="mt-2.5 h-2.5"
        />
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted">
          <span>
            <span className="font-semibold text-ink">{formatPercent(s.usage)}</span> of limit used
          </span>
          {overLimit > 0 ? (
            <span className="font-semibold text-expense">{formatINR(overLimit)} over the limit</span>
          ) : (
            <span className="tabular-nums">{formatINR(s.available)} available</span>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Minimum due</dt>
          <dd className="font-semibold text-ink">{card.minDue > 0 ? formatINR(card.minDue) : 'Paid'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Due date</dt>
          <dd className="font-semibold text-ink">{formatDate(card.dueDate)}</dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted">Interest</dt>
          <dd className="font-semibold text-ink">
            {card.interestRate}% a year <span className="font-normal whitespace-nowrap text-muted">({s.monthlyRate}% a month)</span>
          </dd>
        </div>
      </dl>

      {roughly(s.minimumOnlyInterest) > 0 && (
        <p className="mt-4 flex gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-[13px] text-ink-2">
          <Info className="mt-px size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {card.minDue > 0 ? 'Paying only the minimum costs about ' : 'Interest on what’s left is about '}
            <span className="font-semibold text-ink">{formatINR(roughly(s.minimumOnlyInterest))}</span>
            {card.minDue > 0 ? ' in interest next month.' : ' a month until it’s paid in full.'}
          </span>
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="soft" size="sm" onClick={onPay} className="flex-1 sm:flex-none">
          Record payment
        </Button>
        <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit} aria-label={`Edit ${card.name}`}>
          Edit
        </Button>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Activity</h3>
          {activity.length > 0 && (
            <span className="text-xs text-muted">
              {activity.length} {activity.length === 1 ? 'transaction' : 'transactions'}
            </span>
          )}
        </div>
        {activity.length ? (
          <ul className="mt-2 divide-y divide-line/70">
            {shown.map(({ transaction: t, match }) => {
              const { title } = describe(t, lookup);
              const category = lookup.categories[t.category];
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <Link
                    to={`/transactions/${t.id}/edit`}
                    className="-my-1 -ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pl-2 transition hover:bg-subtle"
                  >
                    <CategoryIcon category={category} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{title}</span>
                      <span className="block truncate text-xs text-muted">
                        {formatDate(t.date, 'short')} · {category?.name ?? 'Uncategorized'}
                        {match === 'linked' && ' · linked'}
                      </span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <Amount value={t.amount} type={t.type} className="text-sm" />
                    <button
                      type="button"
                      onClick={() => notThisCard(t)}
                      className="inline-flex min-h-6 items-center rounded-md px-1 text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
                    >
                      Not this card
                      <span className="sr-only">
                        : {title}, {formatDate(t.date, 'short')}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-muted">
            No payments found for this card yet. Bills that mention {card.last4 ? `••${card.last4} or “${card.name}”` : `“${card.name}”`}{' '}
            show up here automatically.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {activity.length > ACTIVITY_PREVIEW ? (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className="-ml-3" aria-expanded={showAll}>
              {showAll ? 'Show less' : `Show all ${activity.length}`}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" icon={Link2} onClick={onLink} className="-mr-3">
            Link a transaction
          </Button>
        </div>
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
          What you owe on cards is shown here, separately. Card bills paid from your bank are already counted once, as spending.
        </p>
      </div>
    </Card>
  );
}

export default function CreditCards() {
  const cards = useFinance((s) => s.creditCards);
  const transactions = useFinance((s) => s.transactions);
  const lookup = useLookups();
  const today = todayISO();
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null);
  const [paying, setPaying] = useState<CreditCard | null>(null);
  const [linking, setLinking] = useState<CreditCard | null>(null);

  const overview = useMemo(() => cardsOverview(cards), [cards]);
  const unmatched = useMemo(() => unmatchedCardPayments(cards, transactions), [cards, transactions]);
  // Most urgent first; cards with nothing owed go last
  const sorted = useMemo(
    () => [...cards].sort((a, b) => Number(a.outstanding <= 0) - Number(b.outstanding <= 0) || a.dueDate.localeCompare(b.dueDate)),
    [cards],
  );

  return (
    <>
      <PageHeader
        title="Credit Cards"
        subtitle="Limits, outstanding balances, due dates, and statement activity"
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add card
          </Button>
        }
      />

      {cards.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <Card className="lg:col-span-2">
            <EmptyState
              icon={CardIcon}
              title="No credit cards yet"
              description="Add a card to keep track of its limit, what you owe and when it’s due. Card bills you’ve imported or added show up under it automatically."
              action={
                <Button icon={Plus} onClick={() => setEditing('new')}>
                  Add a card
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
              <p className="text-[13px] font-medium text-muted">Owed on cards</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(overview.owed)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Total limit</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatINR(overview.limit)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Limit used</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{formatPercent(overview.usage)}</p>
              <ProgressBar
                value={overview.usage}
                color={BUDGET_COLORS[usageLevel(overview.usage)]}
                label="All cards: limit used"
                className="mt-2 h-1.5"
              />
            </Card>
            <Card className="p-4">
              <p className="text-[13px] font-medium text-muted">Next due</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {overview.next ? formatDate(overview.next.dueDate, 'short') : '—'}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {overview.next ? `${overview.next.name} · ${formatINR(overview.next.minDue)}` : 'No minimum due'}
              </p>
            </Card>
          </div>

          {unmatched.length > 0 && <UnmatchedPayments payments={unmatched} cards={cards} lookup={lookup} />}

          {sorted.map((card) => (
            <CardPanel
              key={card.id}
              card={card}
              cards={cards}
              transactions={transactions}
              lookup={lookup}
              today={today}
              onEdit={() => setEditing(card)}
              onPay={() => setPaying(card)}
              onLink={() => setLinking(card)}
            />
          ))}

          <BalanceNote />
        </div>
      )}

      <CardForm open={editing !== null} onClose={() => setEditing(null)} card={editing && editing !== 'new' ? editing : undefined} />
      <RecordPaymentForm card={paying} onClose={() => setPaying(null)} />
      <LinkTransactionPicker card={linking} onClose={() => setLinking(null)} />
    </>
  );
}
