import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { todayISO } from '@/lib/dates';
import { formatDate, formatINR, round2 } from '@/lib/format';
import {
  checkEntryForm,
  checkPaymentForm,
  interestState,
  isBeforeTracking,
  owedOn,
  paymentDefaults,
  paymentFlow,
  startFlow,
  transactionCandidates,
  type EntryFormValues,
  type Flow,
  type PaymentKind,
} from '@/lib/lending';
import type { Account, LentBorrowed, Transaction } from '@/lib/types';
import { useFinance, useLookups, type TransactionChoice } from '@/store/finance';
import { toast } from '@/store/toast';
import { describe } from '../transactions/TransactionRow';
import { Amount } from '../ui/Bits';
import { Button } from '../ui/Button';
import { choiceRadio, choiceRow, Field, Input, MoneyInput, sanitizeAmount, Segmented, Select } from '../ui/Form';
import { ConfirmDialog, Modal } from '../ui/Modal';

/** 'tx:<id>' links that transaction; 'add' adds one; 'none' leaves your transactions alone. */
type BooksPick = `tx:${string}` | 'add' | 'none';

const MAX_CANDIDATES = 3;

/** The best match if there is one; else nothing for money from before your first transaction; else add it. */
function defaultPick(candidates: Transaction[], date: string, transactions: Transaction[], accounts: Account[]): BooksPick {
  if (candidates.length) return `tx:${candidates[0].id}`;
  if (!accounts.length || isBeforeTracking(date, transactions)) return 'none';
  return 'add';
}

/** Where some Lent & Borrowed money goes in your books. Until you pick, the default above is used. */
function useBooks(flow: Flow, amount: number, date: string) {
  const transactions = useFinance((s) => s.transactions);
  const entries = useFinance((s) => s.lentBorrowed);
  const accounts = useFinance((s) => s.accounts);
  const [picked, setPicked] = useState<BooksPick | null>(null);
  const [account, setAccount] = useState(accounts.find((a) => a.type === 'bank')?.id ?? accounts[0]?.id ?? '');
  const candidates = useMemo(
    () => (amount > 0 && date ? transactionCandidates(transactions, entries, { flow, amount, date }).slice(0, MAX_CANDIDATES) : []),
    [transactions, entries, flow, amount, date],
  );
  const fits = (p: BooksPick | null): p is BooksPick =>
    p === 'none' || (p === 'add' ? accounts.length > 0 : p !== null && candidates.some((t) => `tx:${t.id}` === p));
  const pick = fits(picked) ? picked : defaultPick(candidates, date, transactions, accounts);
  const choice: TransactionChoice = pick === 'none' ? null : pick === 'add' ? { accountId: account } : { transactionId: pick.slice(3) };
  const accountName = accounts.find((a) => a.id === account)?.name ?? 'your account';
  return { candidates, pick, setPick: setPicked, account, setAccount, accounts, accountName, choice };
}

function BooksChoice({
  books,
  flow,
  addNote,
  noneNote,
}: {
  books: ReturnType<typeof useBooks>;
  flow: Flow;
  addNote: string;
  noneNote: string;
}) {
  const lookup = useLookups();
  const { candidates, pick, setPick, account, setAccount, accounts } = books;
  const name = `books-${flow}`;
  return (
    <fieldset className="space-y-2">
      <legend className="label">In your transactions</legend>
      <p className="text-xs text-muted">Linking uses what’s already there, so nothing is counted twice.</p>
      {candidates.map((t, i) => (
        <label key={t.id} className={choiceRow}>
          <input type="radio" name={name} className={choiceRadio} checked={pick === `tx:${t.id}`} onChange={() => setPick(`tx:${t.id}`)} />
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
      {accounts.length > 0 && (
        <label className={choiceRow}>
          <input type="radio" name={name} className={choiceRadio} checked={pick === 'add'} onChange={() => setPick('add')} />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium text-ink">Add it as a transaction</span>
            <span className="block text-xs text-muted">{addNote}</span>
          </span>
        </label>
      )}
      {pick === 'add' && accounts.length > 1 && (
        <Field label={flow === 'out' ? 'Paid from' : 'Paid into'} htmlFor={`${name}-account`}>
          <Select id={`${name}-account`} value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <label className={choiceRow}>
        <input type="radio" name={name} className={choiceRadio} checked={pick === 'none'} onChange={() => setPick('none')} />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-medium text-ink">Don’t add</span>
          <span className="block text-xs text-muted">{noneNote}</span>
        </span>
      </label>
    </fieldset>
  );
}

const valuesOf = (entry?: LentBorrowed): EntryFormValues => ({
  person: entry?.person ?? '',
  phone: entry?.phone ?? '',
  note: entry?.note ?? '',
  direction: entry?.direction ?? 'lent',
  principal: entry ? String(entry.principal) : '',
  startDate: entry?.startDate ?? todayISO(),
  interestType: entry?.interestType ?? 'none',
  interestRate: entry && entry.interestType !== 'none' ? String(entry.interestRate) : '',
  dueDay: entry?.dueDay ? String(entry.dueDay) : '',
  dueDate: entry?.dueDate ?? '',
  remind: entry?.remind ?? true,
});

export function EntryForm({
  open,
  onClose,
  entry,
  onCorrect,
}: {
  open: boolean;
  onClose: () => void;
  entry?: LentBorrowed;
  /** Opens "Correct what's still owed" for this entry */
  onCorrect?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={entry ? 'Edit' : 'Add someone'}>
      <EntryFields onClose={onClose} entry={entry} onCorrect={onCorrect} />
    </Modal>
  );
}

function EntryFields({ onClose, entry, onCorrect }: { onClose: () => void; entry?: LentBorrowed; onCorrect?: () => void }) {
  const addLentBorrowed = useFinance((s) => s.addLentBorrowed);
  const updateLentBorrowed = useFinance((s) => s.updateLentBorrowed);
  const deleteLentBorrowed = useFinance((s) => s.deleteLentBorrowed);
  const [values, setValues] = useState(() => valuesOf(entry));
  const [errors, setErrors] = useState<Partial<Record<keyof EntryFormValues, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Editing a field clears its error, so a fixed field stops showing one
  const set =
    <K extends keyof EntryFormValues>(key: K) =>
    (value: EntryFormValues[K]) => {
      setValues((v) => ({ ...v, [key]: value }));
      setErrors((e) => ({ ...e, [key]: undefined }));
    };
  const books = useBooks(startFlow(values.direction), Number(values.principal), values.startDate);
  const locked = !!entry && entry.payments.length > 0;
  const lent = values.direction === 'lent';
  const rate = Number(values.interestRate);
  const principal = Number(values.principal);
  const person = values.person.trim() || 'them';

  const save = () => {
    const result = checkEntryForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (entry) updateLentBorrowed(entry.id, result.draft);
    else addLentBorrowed(result.draft, books.choice);
    toast(entry ? 'Saved' : `${result.draft.person} added`);
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
      <Field label="Name" htmlFor="lb-person" error={errors.person}>
        <Input
          id="lb-person"
          value={values.person}
          onChange={(e) => set('person')(e.target.value)}
          placeholder="e.g. Ramesh"
          maxLength={40}
          autoFocus
        />
      </Field>
      {locked ? (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">{lent ? 'You lent' : 'You borrowed'}</span> — this can’t change once there’s history.
        </p>
      ) : (
        <Segmented
          label="Lent or borrowed"
          value={values.direction}
          onChange={set('direction')}
          options={[
            { value: 'lent', label: 'I lent' },
            { value: 'borrowed', label: 'I borrowed' },
          ]}
          className="w-full"
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" htmlFor="lb-amount" error={errors.principal}>
          <MoneyInput id="lb-amount" value={values.principal} onChange={set('principal')} placeholder="0" />
        </Field>
        <Field label={lent ? 'Lent on' : 'Borrowed on'} htmlFor="lb-date" error={errors.startDate}>
          <Input id="lb-date" type="date" value={values.startDate} onChange={(e) => set('startDate')(e.target.value)} />
        </Field>
      </div>

      <div>
        <p className="label">Interest</p>
        <Segmented
          label="Interest"
          value={values.interestType}
          onChange={set('interestType')}
          options={[
            { value: 'none', label: 'No interest' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'end', label: 'At the end' },
          ]}
          className="w-full"
        />
        <p className="mt-1.5 text-xs text-muted">
          {values.interestType === 'monthly'
            ? 'Interest paid every month; the money comes back later.'
            : values.interestType === 'end'
              ? 'Interest builds up and is paid back with the money.'
              : 'Just the money back.'}
        </p>
      </div>
      {values.interestType !== 'none' && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Rate (% a month)"
            htmlFor="lb-rate"
            error={errors.interestRate}
            hint={
              rate > 0
                ? `${round2(rate * 12)}% a year${principal > 0 ? ` · ${formatINR(round2((principal * rate) / 100))} a month` : ''}`
                : '₹2 per ₹100 a month is 2'
            }
          >
            <Input
              id="lb-rate"
              inputMode="decimal"
              value={values.interestRate}
              onChange={(e) => set('interestRate')(sanitizeAmount(e.target.value))}
              placeholder="e.g. 2"
            />
          </Field>
          {values.interestType === 'monthly' && (
            <Field label="Due day" htmlFor="lb-dueday" error={errors.dueDay} hint="Day of the month">
              <Input
                id="lb-dueday"
                inputMode="numeric"
                value={values.dueDay}
                onChange={(e) => set('dueDay')(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder={values.startDate ? String(Number(values.startDate.slice(8, 10))) : '1'}
              />
            </Field>
          )}
        </div>
      )}
      <Field label="Money back by (optional)" htmlFor="lb-duedate" error={errors.dueDate}>
        <Input id="lb-duedate" type="date" value={values.dueDate} onChange={(e) => set('dueDate')(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone (optional)" htmlFor="lb-phone" error={errors.phone} hint={lent ? 'For WhatsApp reminders' : undefined}>
          <Input
            id="lb-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={values.phone}
            onChange={(e) => set('phone')(e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16))}
            placeholder="98765 43210"
          />
        </Field>
        <Field label="Note (optional)" htmlFor="lb-note">
          <Input
            id="lb-note"
            value={values.note}
            onChange={(e) => set('note')(e.target.value)}
            placeholder="e.g. For his shop"
            maxLength={80}
          />
        </Field>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-line p-3">
        <input
          type="checkbox"
          checked={values.remind}
          onChange={(e) => set('remind')(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--primary-fill)]"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Remind me</span>
          <span className="block text-xs text-muted">Show on the dashboard and in tips when something is due.</span>
        </span>
      </label>

      {!entry && (
        <BooksChoice
          books={books}
          flow={startFlow(values.direction)}
          addNote={
            lent
              ? `From ${books.accountName} as “Lent to ${person}”, not counted as spending`
              : `Into ${books.accountName} as “Borrowed from ${person}”, not counted as income`
          }
          noneNote="For money from before you used FinTrack, or that didn’t go through your accounts"
        />
      )}

      {entry && onCorrect && (
        <Button variant="secondary" className="w-full" onClick={onCorrect}>
          Correct what’s still owed
        </Button>
      )}
      <div className="flex gap-2 pt-1">
        {entry && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {entry ? 'Save' : 'Add'}
        </Button>
      </div>

      {entry && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete ${entry.person}?`}
          message={deleteMessage(entry)}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            deleteLentBorrowed(entry.id);
            toast(`${entry.person} deleted`);
            onClose();
          }}
        />
      )}
    </form>
  );
}

const transactionsWord = (n: number) => `${n} ${n === 1 ? 'transaction' : 'transactions'}`;

function deleteMessage(entry: LentBorrowed) {
  const links = [
    { id: entry.startTransactionId, added: entry.addedStartTransaction },
    ...entry.payments.map((p) => ({ id: p.linkedTransactionId, added: p.addedTransaction })),
  ].filter((l) => l.id);
  const added = links.filter((l) => l.added).length;
  const linked = links.length - added;
  return [
    `This removes ${entry.person} and their history.`,
    added ? `The ${transactionsWord(added)} added here ${added === 1 ? 'is' : 'are'} removed too.` : '',
    linked
      ? `${transactionsWord(linked)} you linked ${linked === 1 ? 'stays' : 'stay'} and counts as normal income or spending again.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function PaymentForm({ entry, kind, onClose }: { entry: LentBorrowed | null; kind: PaymentKind; onClose: () => void }) {
  return (
    <Modal open={entry !== null} onClose={onClose} title="Record a payment">
      {entry && <PaymentFields entry={entry} initialKind={kind} onClose={onClose} />}
    </Modal>
  );
}

function PaymentFields({ entry, initialKind, onClose }: { entry: LentBorrowed; initialKind: PaymentKind; onClose: () => void }) {
  const recordLentBorrowedPayment = useFinance((s) => s.recordLentBorrowedPayment);
  const deleteLentBorrowedPayment = useFinance((s) => s.deleteLentBorrowedPayment);
  const today = todayISO();
  const hasInterest = entry.interestType !== 'none';
  const firstKind: PaymentKind = !hasInterest && initialKind === 'interest' ? 'money' : initialKind;
  const amountsFor = (kind: PaymentKind, date: string) => {
    const p = paymentDefaults(entry, kind, date || today);
    return {
      interest: p.interestPortion ? String(p.interestPortion) : '',
      principal: p.principalPortion ? String(p.principalPortion) : '',
    };
  };
  const [kind, setKind] = useState<PaymentKind>(firstKind);
  const [date, setDate] = useState(today);
  const [amounts, setAmounts] = useState(() => amountsFor(firstKind, today));
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'amount' | 'interest' | 'principal' | 'date', string>>>({});

  const on = date || today;
  const owed = owedOn(entry, on);
  const pending = Math.max(interestState(entry, on).pending, 0);
  const interest = Number(amounts.interest) || 0;
  const principal = kind === 'settle' ? owed : Number(amounts.principal) || 0;
  const total = round2(interest + principal);
  const waived = kind === 'settle' ? round2(Math.max(pending - interest, 0)) : 0;
  const flow = paymentFlow(entry.direction);
  const books = useBooks(flow, total, date);
  const lent = entry.direction === 'lent';

  const choose = (next: PaymentKind) => {
    setKind(next);
    setAmounts(amountsFor(next, date));
    setErrors({});
  };
  const submit = () => {
    const result = checkPaymentForm(entry, { kind, interest: amounts.interest, principal: amounts.principal, date });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const receipt = recordLentBorrowedPayment(entry.id, { kind, date, ...result.payment, note, record: total > 0 ? books.choice : null });
    if (!receipt) return;
    const message =
      kind === 'settle'
        ? `${entry.person} settled`
        : books.pick.startsWith('tx:')
          ? 'Payment linked — nothing new added'
          : books.pick === 'add'
            ? 'Payment recorded and added to your transactions'
            : 'Payment recorded';
    toast(message, { label: 'Undo', onClick: () => deleteLentBorrowedPayment(receipt.id, receipt.paymentId) });
    onClose();
  };

  const counts = [
    interest > 0 && `the interest counts as ${lent ? 'income' : 'spending'}`,
    principal > 0 && 'the money back doesn’t',
  ].filter(Boolean);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-ink-2">
        <span className="font-semibold text-ink">{entry.person}</span> · {lent ? 'owes you' : 'you owe'}{' '}
        <span className="font-semibold text-ink">{formatINR(owed)}</span>
        {hasInterest && <> · {formatINR(pending)} interest pending</>}
      </p>
      <Segmented
        label="What was paid"
        value={kind}
        onChange={choose}
        options={[
          ...(hasInterest ? [{ value: 'interest' as const, label: 'Interest' }] : []),
          { value: 'money', label: 'Money back' },
          { value: 'settle', label: 'Settle in full' },
        ]}
        className="w-full"
      />

      <div className={hasInterest ? 'grid grid-cols-2 gap-3' : ''}>
        {hasInterest && (
          <Field label="Interest" htmlFor="pay-interest" error={errors.interest}>
            <MoneyInput
              id="pay-interest"
              value={amounts.interest}
              onChange={(v) => setAmounts((a) => ({ ...a, interest: v }))}
              placeholder="0"
            />
          </Field>
        )}
        {kind === 'settle' ? (
          <div>
            <p className="label">Money back</p>
            <p className="flex h-[46px] items-center rounded-xl bg-subtle px-3.5 text-[15px] font-semibold text-ink tabular-nums">
              {formatINR(owed)}
            </p>
          </div>
        ) : (
          <Field label="Money back" htmlFor="pay-principal" error={errors.principal}>
            <MoneyInput
              id="pay-principal"
              value={amounts.principal}
              onChange={(v) => setAmounts((a) => ({ ...a, principal: v }))}
              placeholder="0"
            />
          </Field>
        )}
      </div>
      {errors.amount && (
        <p className="-mt-2 text-xs font-medium text-expense" role="alert">
          {errors.amount}
        </p>
      )}
      {kind === 'money' && hasInterest && pending > 0.5 && interest === 0 && (
        <p className="-mt-2 text-xs text-muted">
          {formatINR(pending)} interest is pending — put part of this under Interest if it covers some.
        </p>
      )}
      {waived > 0 && (
        <p className="-mt-2 text-xs font-medium text-warning">
          {formatINR(waived)} interest will be let go. Raise Interest above if it was paid.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Paid on" htmlFor="pay-date" error={errors.date}>
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="pay-note">
          <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
        </Field>
      </div>

      {total > 0 && (
        <BooksChoice
          books={books}
          flow={flow}
          addNote={`${lent ? 'Into' : 'From'} ${books.accountName}${counts.length ? ` · ${counts.join(', ')}` : ''}`}
          noneNote="Only Lent & Borrowed changes"
        />
      )}

      <Button type="submit" className="w-full">
        {kind === 'settle' ? `Settle${total > 0 ? ` · ${formatINR(total)}` : ''}` : `Record ${formatINR(total)}`}
      </Button>
    </form>
  );
}

export function CorrectionForm({ entry, onClose }: { entry: LentBorrowed | null; onClose: () => void }) {
  return (
    <Modal open={entry !== null} onClose={onClose} title="Correct what’s still owed">
      {entry && <CorrectionFields entry={entry} onClose={onClose} />}
    </Modal>
  );
}

function CorrectionFields({ entry, onClose }: { entry: LentBorrowed; onClose: () => void }) {
  const adjustRemaining = useFinance((s) => s.adjustRemaining);
  const deleteLentBorrowedPayment = useFinance((s) => s.deleteLentBorrowedPayment);
  const today = todayISO();
  const [owed, setOwed] = useState(String(owedOn(entry, today)));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ owed?: string; date?: string }>({});

  const submit = () => {
    const value = owed.trim() === '' ? NaN : Number(owed);
    const found: typeof errors = {};
    if (!(value >= 0)) found.owed = 'Enter what’s owed now, or 0';
    if (!date) found.date = 'Pick the date';
    setErrors(found);
    if (Object.keys(found).length) return;
    const id = adjustRemaining(entry.id, { owed: round2(value), date, note });
    if (id) toast('Corrected', { label: 'Undo', onClick: () => deleteLentBorrowedPayment(entry.id, id) });
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
        For changes that weren’t a payment — you lent {entry.person} a little more, or let some of it go. It shows in the history, and
        interest from that date uses the new amount.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Still owed" htmlFor="fix-owed" error={errors.owed}>
          <MoneyInput id="fix-owed" value={owed} onChange={setOwed} placeholder="0" autoFocus />
        </Field>
        <Field label="From" htmlFor="fix-date" error={errors.date}>
          <Input id="fix-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="fix-note">
        <Input id="fix-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lent ₹2,000 more" maxLength={80} />
      </Field>
      <Button type="submit" className="w-full">
        Save correction
      </Button>
    </form>
  );
}
