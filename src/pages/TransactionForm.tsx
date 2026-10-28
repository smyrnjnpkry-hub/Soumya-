import { ArrowLeft, Check, SearchX, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { ACCOUNT_ICONS } from '@/components/meta';
import { CategoryIcon, EmptyState } from '@/components/ui/Bits';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Chip, Field, Input, sanitizeAmount, Segmented } from '@/components/ui/Form';
import { addDays, daysBetween, todayISO } from '@/lib/dates';
import { round2 } from '@/lib/format';
import type { Transaction, TransactionType } from '@/lib/types';
import { cn } from '@/lib/ui';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const isType = (v: string | null): v is TransactionType => v === 'expense' || v === 'income' || v === 'transfer';

export default function TransactionForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const transactions = useFinance((s) => s.transactions);
  const categories = useFinance((s) => s.categories);
  const accounts = useFinance((s) => s.accounts);
  const addTransaction = useFinance((s) => s.addTransaction);
  const updateTransaction = useFinance((s) => s.updateTransaction);
  const deleteTransaction = useFinance((s) => s.deleteTransaction);
  const restoreTransaction = useFinance((s) => s.restoreTransaction);

  // Snapshot the transaction being edited so deleting it doesn't flash "not found"
  const [existing] = useState(() => (id ? transactions.find((t) => t.id === id) : undefined));
  const today = todayISO();
  const amountRef = useRef<HTMLInputElement>(null);

  const lastAccountFor = (type: TransactionType) => transactions.find((t) => t.type === type)?.account ?? accounts[0]?.id ?? '';

  const initialType: TransactionType = existing?.type ?? (isType(params.get('type')) ? (params.get('type') as TransactionType) : 'expense');
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [account, setAccount] = useState(existing?.account ?? lastAccountFor(initialType));
  const [toAccount, setToAccount] = useState(existing?.toAccount ?? accounts.find((a) => a.id !== account)?.id ?? '');
  const [date, setDate] = useState(existing?.date ?? today);
  const [note, setNote] = useState(existing?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Most-used categories first, so common entries take one tap
  const choices = useMemo(() => {
    const since = addDays(today, -90);
    const uses = new Map<string, number>();
    for (const t of transactions) if (t.type === type && t.date >= since) uses.set(t.category, (uses.get(t.category) ?? 0) + 1);
    return categories
      .filter((c) => c.type === type)
      .map((c, index) => ({ c, index, uses: uses.get(c.id) ?? 0 }))
      .sort((a, b) => b.uses - a.uses || a.index - b.index)
      .map((x) => x.c);
  }, [categories, transactions, type, today]);

  if (id && !existing) {
    return (
      <div className="pt-10">
        <EmptyState
          icon={SearchX}
          title="Transaction not found"
          description="It may have been deleted."
          action={<ButtonLink to="/transactions">Back to transactions</ButtonLink>}
        />
      </div>
    );
  }

  const goBack = () => {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate('/transactions', { replace: true });
  };

  const changeType = (next: TransactionType) => {
    setType(next);
    if (categories.find((c) => c.id === category)?.type !== next) setCategory('');
    if (!existing) setAccount(lastAccountFor(next));
    setErrors({});
  };

  const validate = () => {
    const found: Record<string, string> = {};
    const value = Number(amount);
    if (!amount || !Number.isFinite(value) || value <= 0) found.amount = 'Enter an amount greater than zero';
    else if (value > 1e10) found.amount = 'That amount looks too large';
    if (type !== 'transfer' && !category) found.category = 'Pick a category';
    if (!account) found.account = 'Pick an account';
    if (type === 'transfer') {
      if (!toAccount) found.toAccount = 'Pick where the money goes';
      else if (toAccount === account) found.toAccount = 'Choose a different account';
    }
    if (!date) found.date = 'Pick a date';
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const draft = (): Omit<Transaction, 'id'> => ({
    type,
    amount: round2(Number(amount)),
    date,
    category: type === 'transfer' ? '' : category,
    account,
    note: note.trim(),
    ...(type === 'transfer' ? { toAccount } : {}),
  });

  const save = (addAnother: boolean) => {
    if (!validate()) return;
    if (existing) {
      updateTransaction(existing.id, draft());
      toast('Transaction updated');
      goBack();
      return;
    }
    addTransaction(draft());
    if (addAnother) {
      toast('Saved — add the next one');
      setAmount('');
      setNote('');
      amountRef.current?.focus();
    } else {
      toast('Transaction added');
      goBack();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save(false);
  };

  const remove = () => {
    if (!existing) return;
    const removed = deleteTransaction(existing.id);
    if (removed) toast('Transaction deleted', { label: 'Undo', onClick: () => restoreTransaction(removed) });
    goBack();
  };

  const typeColor = type === 'income' ? 'text-income' : type === 'expense' ? 'text-expense' : 'text-primary';
  const accountChips = (selected: string, onSelect: (id: string) => void, exclude?: string) =>
    accounts
      .filter((a) => a.id !== exclude)
      .map((a) => {
        const Icon = ACCOUNT_ICONS[a.type];
        return (
          <Chip key={a.id} selected={selected === a.id} onClick={() => onSelect(a.id)} className="h-10 px-3.5">
            <Icon className="size-4" aria-hidden />
            {a.name}
          </Chip>
        );
      });

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl lg:card lg:mt-2 lg:p-8" noValidate>
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-canvas/90 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur-md lg:static lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <IconButton label="Back" onClick={goBack} className="-ml-2">
          <ArrowLeft className="size-5" />
        </IconButton>
        <h1 className="flex-1 text-lg font-semibold text-ink">{existing ? 'Edit transaction' : 'Add transaction'}</h1>
        {existing && (
          <IconButton label="Delete transaction" onClick={remove} className="text-expense hover:bg-expense-soft hover:text-expense">
            <Trash2 className="size-5" />
          </IconButton>
        )}
      </div>

      <div className="mt-3 space-y-6">
        <Segmented
          label="Transaction type"
          value={type}
          onChange={changeType}
          options={TYPE_OPTIONS}
          className="flex w-full"
          activeClass={{ expense: 'text-expense', income: 'text-income', transfer: 'text-primary' }}
        />

        {/* Amount */}
        <div className="text-center">
          <label htmlFor="amount" className="text-[13px] font-medium text-muted">
            Amount
          </label>
          <div className="mt-1 flex items-center justify-center gap-1">
            <span className={cn('text-3xl font-semibold', typeColor)}>₹</span>
            <input
              id="amount"
              ref={amountRef}
              inputMode="decimal"
              autoComplete="off"
              autoFocus={!existing}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'amount-error' : undefined}
              // Grow with the digits (tabular figures are exactly 1ch wide) so ₹ stays beside the number
              style={{ width: `${Math.max(amount.length, 1) + 0.25}ch` }}
              className={cn('max-w-full bg-transparent text-5xl font-bold tracking-tight tabular-nums outline-none placeholder:text-line', typeColor)}
            />
          </div>
          {errors.amount && (
            <p id="amount-error" role="alert" className="mt-1 text-xs font-medium text-expense">
              {errors.amount}
            </p>
          )}
        </div>

        {/* Category or transfer accounts */}
        {type === 'transfer' ? (
          <>
            <fieldset>
              <legend className="label">From</legend>
              <div className="flex flex-wrap gap-2">{accountChips(account, setAccount)}</div>
              {errors.account && <p className="mt-1.5 text-xs font-medium text-expense">{errors.account}</p>}
            </fieldset>
            <fieldset>
              <legend className="label">To</legend>
              <div className="flex flex-wrap gap-2">{accountChips(toAccount, setToAccount, account)}</div>
              {errors.toAccount && <p className="mt-1.5 text-xs font-medium text-expense">{errors.toAccount}</p>}
            </fieldset>
          </>
        ) : (
          <>
            <fieldset>
              <legend className="label">Category</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {choices.map((c) => {
                  const selected = c.id === category;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setCategory(c.id);
                        setErrors((e) => ({ ...e, category: '' }));
                      }}
                      className={cn(
                        'relative flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-center transition',
                        selected ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-subtle',
                      )}
                    >
                      <CategoryIcon category={c} />
                      <span className="line-clamp-2 text-[11px] leading-tight font-medium text-ink-2">{c.name}</span>
                      {selected && (
                        <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-primary-fill text-white">
                          <Check className="size-3" strokeWidth={3} aria-hidden />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {errors.category && <p className="mt-1.5 text-xs font-medium text-expense">{errors.category}</p>}
            </fieldset>
            <fieldset>
              <legend className="label">{type === 'income' ? 'Received in' : 'Paid from'}</legend>
              <div className="flex flex-wrap gap-2">{accountChips(account, setAccount)}</div>
              {errors.account && <p className="mt-1.5 text-xs font-medium text-expense">{errors.account}</p>}
            </fieldset>
          </>
        )}

        {/* Date */}
        <fieldset>
          <legend className="label">Date</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Chip selected={date === today} onClick={() => setDate(today)} className="h-10 px-4">
              Today
            </Chip>
            <Chip selected={date === addDays(today, -1)} onClick={() => setDate(addDays(today, -1))} className="h-10 px-4">
              Yesterday
            </Chip>
            <Input
              type="date"
              aria-label="Pick a date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 w-auto flex-1 py-0 sm:max-w-48"
            />
          </div>
          {date > today && <p className="mt-1.5 text-xs text-muted">Scheduled {daysBetween(today, date)} days ahead.</p>}
        </fieldset>

        <Field label="Note (optional)" htmlFor="note">
          <Input
            id="note"
            placeholder={type === 'income' ? 'e.g. October salary' : type === 'transfer' ? 'e.g. ATM withdrawal' : 'e.g. Lunch with team'}
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {/* Actions — sticky on phones so Save is always reachable */}
      <div className="sticky bottom-0 -mx-4 mt-8 flex gap-2 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        {!existing && (
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => save(true)}>
            Save & add another
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-1">
          {existing ? 'Save changes' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
