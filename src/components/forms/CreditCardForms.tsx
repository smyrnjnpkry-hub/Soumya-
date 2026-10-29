import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cardFor, cardLabel, checkCardForm, linkCandidates, paymentCandidates, type CardFormValues } from '@/lib/cards';
import { todayISO } from '@/lib/dates';
import { formatDate, formatINR, round2 } from '@/lib/format';
import type { CreditCard } from '@/lib/types';
import { cardPaymentCategory, useFinance, useLookups, type CardPayment } from '@/store/finance';
import { toast } from '@/store/toast';
import { describe } from '../transactions/TransactionRow';
import { Amount, CategoryIcon } from '../ui/Bits';
import { Button } from '../ui/Button';
import { Chip, Field, Input, MoneyInput, sanitizeAmount, Select } from '../ui/Form';
import { ConfirmDialog, Modal } from '../ui/Modal';

export function CardForm({ open, onClose, card }: { open: boolean; onClose: () => void; card?: CreditCard }) {
  return (
    <Modal open={open} onClose={onClose} title={card ? 'Edit card' : 'Add a card'}>
      <CardFields onClose={onClose} card={card} />
    </Modal>
  );
}

function CardFields({ onClose, card }: { onClose: () => void; card?: CreditCard }) {
  const addCreditCard = useFinance((s) => s.addCreditCard);
  const updateCreditCard = useFinance((s) => s.updateCreditCard);
  const deleteCreditCard = useFinance((s) => s.deleteCreditCard);
  const [values, setValues] = useState<CardFormValues>({
    name: card?.name ?? '',
    last4: card?.last4 ?? '',
    limit: card ? String(card.limit) : '',
    outstanding: card ? String(card.outstanding) : '',
    minDue: card ? String(card.minDue) : '',
    dueDate: card?.dueDate ?? '',
    interestRate: card ? String(card.interestRate) : '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CardFormValues, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Editing a field clears its error, so a fixed field stops showing one
  const set = (key: keyof CardFormValues) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const yearly = Number(values.interestRate);

  const save = () => {
    const result = checkCardForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (card) updateCreditCard(card.id, result.draft);
    else addCreditCard(result.draft);
    toast(card ? 'Card updated' : 'Card added');
    onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Card name" htmlFor="card-name" error={errors.name}>
        <Input
          id="card-name"
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
          placeholder="e.g. HDFC Millennia"
          maxLength={40}
          autoFocus
        />
      </Field>
      <Field
        label="Last 4 digits (optional)"
        htmlFor="card-last4"
        error={errors.last4}
        hint={`Matches payments like “Credit card bill ••${values.last4.length === 4 ? values.last4 : '4417'}” to this card.`}
      >
        <Input
          id="card-last4"
          inputMode="numeric"
          autoComplete="off"
          value={values.last4}
          onChange={(e) => set('last4')(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4417"
          className="w-32 tracking-widest"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Credit limit" htmlFor="card-limit" error={errors.limit}>
          <MoneyInput id="card-limit" value={values.limit} onChange={set('limit')} placeholder="0" />
        </Field>
        <Field label="Amount owed" htmlFor="card-owed" error={errors.outstanding}>
          <MoneyInput id="card-owed" value={values.outstanding} onChange={set('outstanding')} placeholder="0" />
        </Field>
        <Field label="Minimum due" htmlFor="card-min" error={errors.minDue}>
          <MoneyInput id="card-min" value={values.minDue} onChange={set('minDue')} placeholder="0" />
        </Field>
        <Field label="Due date" htmlFor="card-due" error={errors.dueDate}>
          <Input id="card-due" type="date" value={values.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
        </Field>
      </div>
      <Field
        label="Interest (% a year)"
        htmlFor="card-rate"
        error={errors.interestRate}
        hint={
          values.interestRate && yearly > 0
            ? `${yearly}% a year is ${round2(yearly / 12)}% a month.`
            : 'Card papers often show it per month: 3.5% a month is 42% a year.'
        }
      >
        <Input
          id="card-rate"
          inputMode="decimal"
          value={values.interestRate}
          onChange={(e) => set('interestRate')(sanitizeAmount(e.target.value))}
          placeholder="e.g. 42"
          className="w-32"
        />
      </Field>
      <div className="flex gap-2 pt-2">
        {card && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {card ? 'Save' : 'Add card'}
        </Button>
      </div>

      {card && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete “${card.name}”?`}
          message="Its payments stay in your transactions. They just won’t be shown under a card any more."
          confirmLabel="Delete card"
          danger
          onConfirm={() => {
            deleteCreditCard(card.id);
            toast('Card deleted');
            onClose();
          }}
        />
      )}
    </form>
  );
}

export function RecordPaymentForm({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  return (
    <Modal open={card !== null} onClose={onClose} title="Record a payment">
      {card && <PaymentFields card={card} onClose={onClose} />}
    </Modal>
  );
}

/** 'tx:<id>' links that transaction; 'new' adds an expense; 'card-only' just updates the card. */
type PaymentChoice = `tx:${string}` | 'new' | 'card-only';

const radioRow =
  'flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 transition has-[:checked]:border-primary has-[:checked]:bg-primary-soft/50';
const radio = 'mt-0.5 size-4 shrink-0 accent-[var(--primary-fill)]';

function PaymentFields({ card, onClose }: { card: CreditCard; onClose: () => void }) {
  const cards = useFinance((s) => s.creditCards);
  const transactions = useFinance((s) => s.transactions);
  const accounts = useFinance((s) => s.accounts);
  const payCreditCard = useFinance((s) => s.payCreditCard);
  const undoCardPayment = useFinance((s) => s.undoCardPayment);
  const lookup = useLookups();
  const [amount, setAmount] = useState(card.outstanding > 0 ? String(card.outstanding) : '');
  const [date, setDate] = useState(todayISO());
  const [account, setAccount] = useState(accounts.find((a) => a.type === 'bank')?.id ?? accounts[0]?.id ?? '');
  const [picked, setPicked] = useState<PaymentChoice | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  const value = Number(amount);
  const candidates = useMemo(
    () => (value > 0 && date ? paymentCandidates(card, cards, { amount: value, date }, transactions).slice(0, 3) : []),
    [card, cards, transactions, value, date],
  );
  // Until you pick, the best match is chosen; a pick that no longer fits the amount or date falls back the same way
  const available = (c: PaymentChoice | null): c is PaymentChoice =>
    c === 'card-only' || (c === 'new' ? accounts.length > 0 : c !== null && candidates.some((t) => `tx:${t.id}` === c));
  const choice: PaymentChoice = available(picked)
    ? picked
    : candidates.length
      ? `tx:${candidates[0].id}`
      : accounts.length
        ? 'new'
        : 'card-only';
  const accountName = accounts.find((a) => a.id === account)?.name ?? 'your account';
  const category = cardPaymentCategory(Object.values(lookup.categories));

  const submit = () => {
    const found: typeof errors = {};
    if (!(value > 0)) found.amount = 'Enter the amount you paid';
    if (!date) found.date = 'Pick the date you paid';
    setErrors(found);
    if (Object.keys(found).length) return;
    const payment: CardPayment = { amount: round2(value), date };
    if (choice.startsWith('tx:')) payment.transactionId = choice.slice(3);
    else if (choice === 'new') payment.accountId = account;
    const receipt = payCreditCard(card.id, payment);
    if (!receipt) return;
    const message = receipt.linked
      ? 'Payment linked — nothing new added'
      : receipt.addedId
        ? 'Payment recorded as an expense'
        : 'Card updated';
    toast(message, { label: 'Undo', onClick: () => undoCardPayment(receipt) });
    onClose();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-ink-2">
        {cardLabel(card)} · <span className="font-semibold text-ink">{formatINR(card.outstanding)}</span> owed
        {card.minDue > 0 && (
          <>
            {' '}
            · {formatINR(card.minDue)} minimum due {formatDate(card.dueDate, 'short')}
          </>
        )}
      </p>

      <Field label="Amount" htmlFor="pay-amount" error={errors.amount}>
        <MoneyInput id="pay-amount" value={amount} onChange={setAmount} placeholder="0" autoFocus />
      </Field>
      {(card.minDue > 0 || card.outstanding > 0) && (
        <div className="-mt-2 flex flex-wrap gap-2">
          {card.minDue > 0 && (
            <Chip selected={value === card.minDue} onClick={() => setAmount(String(card.minDue))}>
              Minimum {formatINR(card.minDue)}
            </Chip>
          )}
          {card.outstanding > 0 && (
            <Chip selected={value === card.outstanding} onClick={() => setAmount(String(card.outstanding))}>
              Full {formatINR(card.outstanding)}
            </Chip>
          )}
        </div>
      )}
      <Field label="Paid on" htmlFor="pay-date" error={errors.date}>
        <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="label">Already in your transactions?</legend>
        <p className="text-xs text-muted">Linking uses the payment you already have, so it’s only counted once.</p>
        {candidates.map((t, i) => (
          <label key={t.id} className={radioRow}>
            <input
              type="radio"
              name="pay-choice"
              className={radio}
              checked={choice === `tx:${t.id}`}
              onChange={() => setPicked(`tx:${t.id}`)}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-ink">{describe(t, lookup).title}</span>
                <Amount value={t.amount} type={t.type} />
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                {formatDate(t.date, 'short')} · {lookup.accounts[t.account]?.name ?? 'Deleted account'}
                {i === 0 && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-income">
                    <Check className="size-3" aria-hidden />
                    Best match
                  </span>
                )}
              </span>
            </span>
          </label>
        ))}
        {!candidates.length && value > 0 && (
          <p className="rounded-xl bg-subtle px-3 py-2.5 text-[13px] text-ink-2">
            No payment of {formatINR(value)} within 5 days of that date yet.
          </p>
        )}
        {accounts.length > 0 && (
          <label className={radioRow}>
            <input type="radio" name="pay-choice" className={radio} checked={choice === 'new'} onChange={() => setPicked('new')} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-medium text-ink">Add it as a new expense</span>
              <span className="block text-xs text-muted">
                From {accountName}
                {category ? ` · ${category.name}` : ''}
              </span>
            </span>
          </label>
        )}
        {choice === 'new' && accounts.length > 1 && (
          <Field label="Paid from" htmlFor="pay-account">
            <Select id="pay-account" value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <label className={radioRow}>
          <input
            type="radio"
            name="pay-choice"
            className={radio}
            checked={choice === 'card-only'}
            onChange={() => setPicked('card-only')}
          />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium text-ink">Just update the card</span>
            <span className="block text-xs text-muted">If you’ll import the payment from a statement later</span>
          </span>
        </label>
      </fieldset>

      <Button type="submit" className="w-full">
        Record payment
      </Button>
    </form>
  );
}

export function LinkTransactionPicker({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  return (
    <Modal open={card !== null} onClose={onClose} title="Link a transaction">
      {card && <LinkFields card={card} onClose={onClose} />}
    </Modal>
  );
}

/** Long lists are cut short; searching narrows them down. */
const LINK_LIST_MAX = 30;

function LinkFields({ card, onClose }: { card: CreditCard; onClose: () => void }) {
  const cards = useFinance((s) => s.creditCards);
  const transactions = useFinance((s) => s.transactions);
  const linkCardTransaction = useFinance((s) => s.linkCardTransaction);
  const lookup = useLookups();
  const [query, setQuery] = useState('');
  const results = useMemo(() => linkCandidates(card, cards, transactions, query), [card, cards, transactions, query]);
  const shown = results.slice(0, LINK_LIST_MAX);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">Pick a payment to show it under {cardLabel(card)}. Your totals don’t change.</p>
      <Field label="Search expenses" htmlFor="link-search">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            id="link-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Note or amount"
            className="pl-10"
            autoFocus
          />
        </div>
      </Field>
      {shown.length ? (
        <ul className="divide-y divide-line/70" aria-label="Expenses you can link">
          {shown.map((t) => {
            const owner = cardFor(t, cards);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    const previous = linkCardTransaction(t.id, card.id);
                    toast(`Linked to ${card.name}`, { label: 'Undo', onClick: () => linkCardTransaction(t.id, previous) });
                    onClose();
                  }}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-subtle"
                >
                  <CategoryIcon category={lookup.categories[t.category]} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{describe(t, lookup).title}</span>
                    <span className="block truncate text-xs text-muted">
                      {formatDate(t.date, 'short')}
                      {owner ? ` · now under ${owner.name}` : ''}
                    </span>
                  </span>
                  <Amount value={t.amount} type={t.type} className="text-sm" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted">
          {query.trim() ? 'No expenses match that search.' : 'No expenses to link yet.'}
        </p>
      )}
      {results.length > shown.length && (
        <p className="text-center text-xs text-muted">
          Showing the latest {shown.length} of {results.length}. Search to find older ones.
        </p>
      )}
    </div>
  );
}
