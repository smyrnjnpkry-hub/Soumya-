import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Copy,
  FileText,
  FileUp,
  Info,
  Loader2,
  Lock,
  ScanLine,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Chip, Field, Input, Select } from '@/components/ui/Form';
import { StatusPill } from '@/components/ui/Bits';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/lib/defaults';
import { formatDate, formatINR, formatMonth, round2 } from '@/lib/format';
import { isSampleTransaction } from '@/lib/seed';
import { monthKey } from '@/lib/dates';
import { openingBalanceOf, parseStatement } from '@/lib/statement/parse';
import { extractPages, loadPdfjs } from '@/lib/statement/pdf';
import {
  applyChoice,
  buildReview,
  planTransactions,
  statementAccountName,
  withDuplicates,
  type Choice,
  type ReviewRow,
} from '@/lib/statement/plan';
import { StatementError, type ParsedStatement } from '@/lib/statement/types';
import type { Category } from '@/lib/types';
import { cn } from '@/lib/ui';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';

type Stage =
  | { name: 'pick'; error?: string }
  | { name: 'reading'; fileName: string }
  | { name: 'password'; fileName: string; data: Uint8Array; sample: boolean; error?: string }
  | { name: 'review'; fileName: string; statement: ParsedStatement; sample: boolean };

const SAMPLE_FILE = 'sample-statement.pdf';

export default function ImportStatement() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ name: 'pick' });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's heading so screen readers follow along
  useEffect(() => headingRef.current?.focus(), [stage.name]);

  const goBack = () => {
    if (stage.name !== 'pick') setStage({ name: 'pick' });
    else if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
    else navigate('/transactions', { replace: true });
  };

  const read = async (fileName: string, data: Uint8Array, sample: boolean, password?: string) => {
    setStage({ name: 'reading', fileName });
    try {
      const pdfjs = await loadPdfjs().catch(() => {
        throw new StatementError('Couldn’t load the PDF reader. Check your internet connection and try again.', 'unreadable');
      });
      const statement = parseStatement(await extractPages(pdfjs, data, password));
      setStage({ name: 'review', fileName, statement, sample });
    } catch (error) {
      if (error instanceof StatementError && (error.code === 'password' || error.code === 'bad-password')) {
        setStage({ name: 'password', fileName, data, sample, error: error.code === 'bad-password' ? error.message : undefined });
      } else {
        setStage({
          name: 'pick',
          error: error instanceof StatementError ? error.message : 'Something went wrong reading this file. Try downloading it again.',
        });
      }
    }
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      setStage({ name: 'pick', error: `“${file.name}” isn’t a PDF. Choose the PDF statement from your bank.` });
      return;
    }
    await read(file.name, new Uint8Array(await file.arrayBuffer()), false);
  };

  const openSample = async () => {
    setStage({ name: 'reading', fileName: SAMPLE_FILE });
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${SAMPLE_FILE}`);
      if (!response.ok) throw new Error(String(response.status));
      await read(SAMPLE_FILE, new Uint8Array(await response.arrayBuffer()), true);
    } catch {
      setStage({ name: 'pick', error: 'Couldn’t load the sample statement. Check your internet connection and try again.' });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-canvas/90 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mb-4 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <IconButton label="Back" onClick={goBack} className="-ml-2">
          <ArrowLeft className="size-5" />
        </IconButton>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="flex-1 truncate text-lg font-semibold text-ink outline-none lg:text-2xl lg:font-bold lg:tracking-tight"
        >
          {stage.name === 'review' ? 'Review transactions' : 'Import statement'}
        </h1>
      </div>

      <div className="mt-3 lg:mt-0">
        {stage.name === 'pick' && (
          <PickFile error={stage.error} onFile={(file) => void openFile(file)} onSample={() => void openSample()} />
        )}
        {stage.name === 'reading' && <Reading fileName={stage.fileName} />}
        {stage.name === 'password' && (
          <PasswordPrompt
            fileName={stage.fileName}
            error={stage.error}
            onCancel={() => setStage({ name: 'pick' })}
            onSubmit={(password) => void read(stage.fileName, stage.data, stage.sample, password)}
          />
        )}
        {stage.name === 'review' && (
          <Review key={stage.fileName} statement={stage.statement} sample={stage.sample} onCancel={() => setStage({ name: 'pick' })} />
        )}
      </div>
    </div>
  );
}

function PickFile({ error, onFile, onSample }: { error?: string; onFile: (file: File | undefined) => void; onSample: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-4">
      <Card
        className={cn('border-2 border-dashed border-transparent text-center transition', dragging && 'border-primary bg-primary-soft/40')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-col items-center px-2 py-6 sm:py-10">
          <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <FileUp className="size-7" aria-hidden />
          </span>
          <h2 className="text-lg font-semibold text-ink">Add transactions from your bank statement</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted">
            Choose the PDF statement you downloaded from net banking or your bank’s app. You can check every transaction before it’s added.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button size="lg" icon={FileText} className="mt-6" onClick={() => fileRef.current?.click()}>
            Choose PDF
          </Button>
          <p className="mt-2 hidden text-xs text-muted sm:block">or drop it here</p>
          <Button variant="ghost" size="sm" icon={Sparkles} className="mt-4" onClick={onSample}>
            Try a sample statement
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="mx-auto mb-2 flex max-w-md items-start gap-2 rounded-xl bg-expense-soft px-3 py-2.5 text-left text-sm text-expense"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </Card>

      <Card>
        <ul className="space-y-3.5 text-sm">
          <Tip icon={ShieldCheck} title="Private by design">
            The PDF is read on this device. Nothing is uploaded, and the file isn’t kept.
          </Tip>
          <Tip icon={Lock} title="Password-protected PDFs work">
            You’ll be asked for the password — banks usually say what it is in the email the statement came with.
          </Tip>
          <Tip icon={FileText} title="Made for Indian bank statements">
            Tested with HDFC Bank. Most statements with Date, Narration, Withdrawal, Deposit and Balance columns work too.
          </Tip>
          <Tip icon={ScanLine} title="Not for scans or photos">
            A statement needs to be the PDF your bank generates; a scanned copy has no text to read.
          </Tip>
        </ul>
      </Card>
    </div>
  );
}

function Tip({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-ink-2">
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{children}</p>
      </div>
    </li>
  );
}

function Reading({ fileName }: { fileName: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center py-12 text-center" role="status">
        <Loader2 className="size-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
        <p className="mt-4 font-semibold text-ink">Reading your statement…</p>
        <p className="mt-1 max-w-full truncate text-sm text-muted">{fileName}</p>
      </div>
    </Card>
  );
}

function PasswordPrompt({
  fileName,
  error,
  onCancel,
  onSubmit,
}: {
  fileName: string;
  error?: string;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  return (
    <Card>
      <form
        className="mx-auto max-w-sm py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) onSubmit(password);
        }}
      >
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Lock className="size-6" aria-hidden />
        </span>
        <h2 className="text-center font-semibold text-ink">This statement is password-protected</h2>
        <p className="mt-1 truncate text-center text-sm text-muted">{fileName}</p>
        <div className="mt-5">
          <Field label="PDF password" htmlFor="pdf-password" error={error} hint="It’s only used to open the file, on this device.">
            <Input
              id="pdf-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={!password}>
            Open
          </Button>
        </div>
      </form>
    </Card>
  );
}

const NEW_ACCOUNT = '__new__';
const PAGE = 100;

type Filter = 'all' | 'out' | 'in' | 'uncategorised' | 'duplicates';

const isUncategorised = (row: ReviewRow) => row.choice === 'expense:other-expense' || row.choice === 'income:other-income';

const FILTERS: { value: Filter; label: string; test: (row: ReviewRow) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'out', label: 'Money out', test: (row) => row.direction === 'debit' },
  { value: 'in', label: 'Money in', test: (row) => row.direction === 'credit' },
  { value: 'uncategorised', label: 'Not categorised', test: isUncategorised },
  { value: 'duplicates', label: 'Already added', test: (row) => row.duplicate },
];

function Review({ statement, sample, onCancel }: { statement: ParsedStatement; sample: boolean; onCancel: () => void }) {
  const navigate = useNavigate();
  const savedAccounts = useFinance((s) => s.accounts);
  const savedTransactions = useFinance((s) => s.transactions);
  const savedCategories = useFinance((s) => s.categories);
  const isSampleData = useFinance((s) => s.isSample);
  const importStatement = useFinance((s) => s.importStatement);
  const undoImport = useFinance((s) => s.undoImport);

  // With only the demo data loaded, importing starts from a clean slate unless asked otherwise. Once you've added
  // anything of your own, clearing is still offered but never the default.
  const ownCount = isSampleData ? savedTransactions.filter((t) => !isSampleTransaction(t)).length : 0;
  const [fresh, setFresh] = useState(isSampleData && ownCount === 0);
  const accounts = fresh ? DEFAULT_ACCOUNTS : savedAccounts;
  const transactions = fresh ? [] : savedTransactions;
  const categories = fresh ? DEFAULT_CATEGORIES : savedCategories;
  const cash = accounts.find((a) => a.type === 'cash') ?? null;

  const suggestedName = statementAccountName(statement);
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.name === suggestedName)?.id ?? NEW_ACCOUNT);
  const [name, setName] = useState(suggestedName);
  const target = accountId === NEW_ACCOUNT ? null : accountId;
  const opening = openingBalanceOf(statement);
  const targetIsEmpty = target !== null && !transactions.some((t) => t.account === target || t.toAccount === target);
  const [setOpening, setSetOpening] = useState(true);

  const [rows, setRows] = useState(() => buildReview(statement.rows, { categories, transactions, accountId: target, cash: cash !== null }));
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);

  const changeAccount = (id: string) => {
    setAccountId(id);
    setRows((current) => withDuplicates(current, transactions, id === NEW_ACCOUNT ? null : id));
  };

  const changeFresh = (next: boolean) => {
    setFresh(next);
    const nextAccounts = next ? DEFAULT_ACCOUNTS : savedAccounts;
    const nextTransactions = next ? [] : savedTransactions;
    const id = nextAccounts.some((a) => a.id === accountId) ? accountId : NEW_ACCOUNT;
    setAccountId(id);
    setRows(
      buildReview(statement.rows, {
        categories: next ? DEFAULT_CATEGORIES : savedCategories,
        transactions: nextTransactions,
        accountId: id === NEW_ACCOUNT ? null : id,
        cash: nextAccounts.some((a) => a.type === 'cash'),
      }),
    );
  };

  const toggle = useCallback(
    (id: number) => setRows((current) => current.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))),
    [],
  );
  // The latest rows, so choosing a category can report how many similar rows followed without re-rendering every row
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const choose = useCallback((id: number, choice: Choice) => {
    const { rows: next, alsoChanged } = applyChoice(rowsRef.current, id, choice);
    rowsRef.current = next;
    setRows(next);
    const note = next.find((r) => r.id === id)?.note;
    if (alsoChanged) toast(`Also applied to ${alsoChanged} more “${note}” ${alsoChanged === 1 ? 'row' : 'rows'}`);
  }, []);

  const visible = useMemo(() => rows.filter(FILTERS.find((f) => f.value === filter)!.test), [rows, filter]);
  const selected = rows.filter((r) => r.selected);
  const totals = {
    in: round2(selected.reduce((sum, r) => sum + (r.direction === 'credit' ? r.amount : 0), 0)),
    out: round2(selected.reduce((sum, r) => sum + (r.direction === 'debit' ? r.amount : 0), 0)),
  };
  const duplicates = rows.filter((r) => r.duplicate).length;

  const setVisible = (value: boolean) => {
    const ids = new Set(visible.map((r) => r.id));
    setRows((current) => current.map((r) => (ids.has(r.id) ? { ...r, selected: value } : r)));
  };

  const options = useMemo(() => {
    const list = (type: Category['type']) =>
      categories.filter((c) => c.type === type).map((c) => ({ value: `${type}:${c.id}` as Choice, label: c.name }));
    const transfer = cash ? [{ value: 'transfer' as const, label: `Transfer · ${cash.name}` }] : [];
    return { debit: [...list('expense'), ...transfer], credit: [...list('income'), ...transfer] };
  }, [categories, cash]);

  const doImport = () => {
    const plan = planTransactions(rows, cash?.id ?? null);
    const receipt = importStatement({
      account: target ?? { name: name.trim() || suggestedName, type: 'bank', balance: opening ?? 0 },
      openingBalance: target && targetIsEmpty && setOpening && opening !== null ? opening : undefined,
      transactions: plan,
      fresh,
    });
    toast(`Imported ${plan.length} ${plan.length === 1 ? 'transaction' : 'transactions'}`, {
      label: 'Undo',
      onClick: () => undoImport(receipt),
    });
    navigate(`/transactions?account=${encodeURIComponent(receipt.accountId)}`, { replace: true });
  };

  return (
    <div className="space-y-4">
      {sample && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-primary-soft px-4 py-3 text-sm text-primary-ink">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          This is a made-up statement for trying out import. Import it to see how it works — you can undo right after.
        </p>
      )}

      <StatementSummaryCard statement={statement} />

      <Card>
        <CardHeader title="Add to account" />
        <div className="space-y-4">
          {isSampleData && (
            <label className="flex items-start gap-3 rounded-xl bg-subtle px-3.5 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary-fill"
                checked={fresh}
                onChange={(e) => changeFresh(e.target.checked)}
              />
              <span>
                <span className="font-medium text-ink">Clear the sample data first</span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {ownCount
                    ? `This also removes the ${ownCount} ${ownCount === 1 ? 'transaction' : 'transactions'} you’ve added alongside it.`
                    : 'FinTrack is showing demo data. Clearing it means your own numbers start clean.'}
                </span>
              </span>
            </label>
          )}
          <Field label="Account" htmlFor="import-account">
            <Select id="import-account" value={accountId} onChange={(e) => changeAccount(e.target.value)}>
              <option value={NEW_ACCOUNT}>New account: {name.trim() || suggestedName}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          {target === null ? (
            <Field
              label="New account name"
              htmlFor="import-name"
              hint={
                opening !== null
                  ? `Opens at ${formatINR(opening)}, the statement’s opening balance, so its balance matches the bank’s.`
                  : undefined
              }
            >
              <Input id="import-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </Field>
          ) : (
            targetIsEmpty &&
            opening !== null && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary-fill"
                  checked={setOpening}
                  onChange={(e) => setSetOpening(e.target.checked)}
                />
                <span className="text-ink-2">
                  Set its opening balance to <span className="font-semibold text-ink tabular-nums">{formatINR(opening)}</span> from the
                  statement, so its balance matches the bank’s
                </span>
              </label>
            )
          )}
        </div>
      </Card>

      <section className="card">
        <div className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardHeader
            title="Transactions"
            subtitle={`${selected.length} of ${rows.length} ticked · in ${formatINR(totals.in)} · out ${formatINR(totals.out)}`}
          />
          {duplicates > 0 && (
            <p className="-mt-1 mb-4 flex items-start gap-2 text-[13px] text-ink-2">
              <Copy className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              {duplicates === 1 ? '1 transaction is' : `${duplicates} transactions are`} already in FinTrack, so{' '}
              {duplicates === 1 ? 'it’s' : 'they’re'} unticked to avoid adding them twice.
            </p>
          )}
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
            {FILTERS.filter((f) => f.value !== 'duplicates' || duplicates > 0).map((f) => (
              <Chip
                key={f.value}
                selected={filter === f.value}
                onClick={() => {
                  setFilter(f.value);
                  setLimit(PAGE);
                }}
              >
                {f.label}
                <span className="text-muted tabular-nums">{rows.filter(f.test).length}</span>
              </Chip>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-1 border-b border-line pb-2 text-[13px]">
            <span className="mr-auto text-muted">{visible.length} shown</span>
            <Button variant="ghost" size="sm" onClick={() => setVisible(true)}>
              Tick all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
              Untick all
            </Button>
          </div>
        </div>

        <ReviewList rows={visible.slice(0, limit)} options={options} onToggle={toggle} onChoose={choose} />
        {visible.length > limit && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, visible.length - limit)} more
            </Button>
          </div>
        )}
        {!visible.length && <p className="px-5 py-10 text-center text-sm text-muted">Nothing here.</p>}
      </section>

      {/* Sticky on phones so Import is always reachable */}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-canvas/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2 lg:backdrop-blur-none">
        <Button variant="secondary" size="lg" className="flex-1 sm:flex-none" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="lg" icon={FileUp} className="flex-1" disabled={!selected.length} onClick={doImport}>
          Import {selected.length} {selected.length === 1 ? 'transaction' : 'transactions'}
        </Button>
      </div>
    </div>
  );
}

function StatementSummaryCard({ statement }: { statement: ParsedStatement }) {
  const { rows, summary, checks, period } = statement;
  const debits = rows.filter((r) => r.direction === 'debit');
  const credits = rows.filter((r) => r.direction === 'credit');
  const sum = (list: typeof rows) => round2(list.reduce((total, r) => total + r.amount, 0));
  const closing = summary?.closingBalance ?? rows.at(-1)?.balance ?? null;
  const hasBalances = rows.some((r) => r.balance !== null);

  let check: { tone: 'ok' | 'warning' | 'info'; icon: LucideIcon; label: string; detail: string };
  if (checks.summaryMatches === false) {
    check = {
      tone: 'warning',
      icon: CircleAlert,
      label: 'Doesn’t match the bank’s totals',
      detail: 'Some rows may have been misread. Compare them with the PDF before importing.',
    };
  } else if (checks.balanceBreaks > 0) {
    check = {
      tone: 'warning',
      icon: CircleAlert,
      label: `${checks.balanceBreaks} ${checks.balanceBreaks === 1 ? 'row doesn’t' : 'rows don’t'} add up`,
      detail: 'The running balance jumps somewhere. Compare the rows with the PDF before importing.',
    };
  } else if (checks.summaryMatches) {
    check = {
      tone: 'ok',
      icon: CircleCheck,
      label: 'Matches the bank’s totals',
      detail: 'Every transaction was read, and they add up to the bank’s own summary.',
    };
  } else if (hasBalances) {
    check = { tone: 'ok', icon: CircleCheck, label: 'Balances add up', detail: 'Each row follows from the one before it.' };
  } else {
    check = { tone: 'info', icon: Info, label: 'Nothing to check against', detail: 'This statement has no totals or running balance.' };
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-ink">{statementAccountName(statement)}</h2>
          {period.from && period.to && (
            <p className="mt-0.5 text-[13px] text-muted">
              {formatDate(period.from)} – {formatDate(period.to)}
            </p>
          )}
        </div>
        <StatusPill icon={check.icon} tone={check.tone}>
          {check.label}
        </StatusPill>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Transactions" value={String(rows.length)} />
        <Stat label={`Money in (${credits.length})`} value={formatINR(sum(credits))} className="text-income" />
        <Stat label={`Money out (${debits.length})`} value={formatINR(sum(debits))} className="text-expense" />
        {closing !== null && <Stat label="Closing balance" value={formatINR(closing)} />}
      </dl>
      <p className="mt-3 text-[13px] text-muted">{check.detail}</p>
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-subtle px-3 py-2.5">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className={cn('mt-0.5 truncate font-semibold text-ink tabular-nums', className)}>{value}</dd>
    </div>
  );
}

type Options = { debit: { value: Choice; label: string }[]; credit: { value: Choice; label: string }[] };

function ReviewList({
  rows,
  options,
  onToggle,
  onChoose,
}: {
  rows: ReviewRow[];
  options: Options;
  onToggle: (id: number) => void;
  onChoose: (id: number, choice: Choice) => void;
}) {
  // Grouped by month so the year is never in doubt
  const months: { key: string; rows: ReviewRow[] }[] = [];
  for (const row of rows) {
    const key = monthKey(row.date);
    if (months.at(-1)?.key !== key) months.push({ key, rows: [] });
    months[months.length - 1].rows.push(row);
  }
  return (
    <div>
      {months.map((month) => (
        <section key={month.key} aria-label={formatMonth(month.key)}>
          <h3 className="sticky top-[calc(3.25rem+env(safe-area-inset-top))] z-[1] bg-surface/95 px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase backdrop-blur-sm sm:px-5 lg:top-0">
            {formatMonth(month.key)}
          </h3>
          <ul className="divide-y divide-line/70 px-4 sm:px-5">
            {month.rows.map((row) => (
              <ReviewItem
                key={row.id}
                row={row}
                options={row.direction === 'debit' ? options.debit : options.credit}
                onToggle={onToggle}
                onChoose={onChoose}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const ReviewItem = memo(function ReviewItem({
  row,
  options,
  onToggle,
  onChoose,
}: {
  row: ReviewRow;
  options: { value: Choice; label: string }[];
  onToggle: (id: number) => void;
  onChoose: (id: number, choice: Choice) => void;
}) {
  const id = `import-row-${row.id}`;
  const out = row.direction === 'debit';
  return (
    <li className={cn('flex items-start gap-3 py-3', !row.selected && 'opacity-60')}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-[18px] shrink-0 accent-primary-fill"
        checked={row.selected}
        onChange={() => onToggle(row.id)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="min-w-0 truncate text-[15px] font-medium text-ink" title={row.narration}>
            {row.note}
          </label>
          <span
            className={cn(
              'shrink-0 font-semibold whitespace-nowrap tabular-nums',
              row.choice === 'transfer' ? 'text-ink' : out ? 'text-expense' : 'text-income',
            )}
          >
            {out ? '−' : '+'}
            {formatINR(row.amount)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[13px] text-muted tabular-nums">{formatDate(row.date, 'short')}</span>
          <select
            aria-label={`Category for ${row.note}`}
            value={row.choice}
            onChange={(e) => onChoose(row.id, e.target.value as Choice)}
            className="h-8 max-w-[13rem] min-w-0 truncate rounded-lg border border-line bg-surface px-2 text-[13px] text-ink-2 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {row.duplicate && (
            <StatusPill icon={Copy} tone="warning">
              Already added
            </StatusPill>
          )}
        </div>
      </div>
    </li>
  );
});
