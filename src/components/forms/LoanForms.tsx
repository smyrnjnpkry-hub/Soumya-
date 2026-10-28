import { Calculator } from 'lucide-react';
import { useState } from 'react';
import { addMonthsToDate, todayISO } from '@/lib/dates';
import { formatDate, formatINR, round2 } from '@/lib/format';
import { calculateEmi } from '@/lib/loans';
import type { Loan } from '@/lib/types';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';
import { Button } from '../ui/Button';
import { Field, Input, MoneyInput, sanitizeAmount, Select } from '../ui/Form';
import { Modal } from '../ui/Modal';

export function LoanForm({ open, onClose, loan }: { open: boolean; onClose: () => void; loan?: Loan }) {
  return (
    <Modal open={open} onClose={onClose} title={loan ? 'Edit loan' : 'Add a loan'}>
      <LoanFields onClose={onClose} loan={loan} />
    </Modal>
  );
}

function LoanFields({ onClose, loan }: { onClose: () => void; loan?: Loan }) {
  const addLoan = useFinance((s) => s.addLoan);
  const updateLoan = useFinance((s) => s.updateLoan);
  const deleteLoan = useFinance((s) => s.deleteLoan);
  const [name, setName] = useState(loan?.name ?? '');
  const [principal, setPrincipal] = useState(loan ? String(loan.principal) : '');
  const [rate, setRate] = useState(loan ? String(loan.interestRate) : '');
  const [emi, setEmi] = useState(loan ? String(loan.emi) : '');
  const [tenure, setTenure] = useState(loan ? String(loan.remainingTenure) : '');
  const [nextDue, setNextDue] = useState(loan?.nextDue ?? addMonthsToDate(todayISO(), 1));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const suggestedEmi = calculateEmi(Number(principal), Number(rate) || 0, Number(tenure));

  const save = () => {
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = 'Name the loan, e.g. “Home loan”';
    if (!(Number(principal) > 0)) found.principal = 'Enter the amount borrowed';
    if (!(Number(rate) >= 0) || rate === '') found.rate = 'Enter the yearly rate (0 for interest-free)';
    if (!(Number(emi) > 0)) found.emi = 'Enter the EMI';
    if (!Number.isInteger(Number(tenure)) || Number(tenure) < 0 || tenure === '') found.tenure = 'Whole number of EMIs left';
    if (!nextDue) found.nextDue = 'Pick the next due date';
    setErrors(found);
    if (Object.keys(found).length) return;
    const draft = {
      name: name.trim(),
      principal: round2(Number(principal)),
      interestRate: Number(rate),
      emi: round2(Number(emi)),
      remainingTenure: Number(tenure),
      nextDue,
    };
    if (loan) updateLoan(loan.id, draft);
    else addLoan(draft);
    toast(loan ? 'Loan updated' : 'Loan added');
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
      <Field label="Loan name" htmlFor="loan-name" error={errors.name}>
        <Input
          id="loan-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Home loan, Car loan, Phone EMI"
          maxLength={40}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount borrowed" htmlFor="loan-principal" error={errors.principal}>
          <MoneyInput id="loan-principal" value={principal} onChange={setPrincipal} placeholder="0" />
        </Field>
        <Field label="Interest (% / year)" htmlFor="loan-rate" error={errors.rate}>
          <Input
            id="loan-rate"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(sanitizeAmount(e.target.value))}
            placeholder="e.g. 9.5"
          />
        </Field>
        <Field label="EMIs left" htmlFor="loan-tenure" error={errors.tenure}>
          <Input
            id="loan-tenure"
            inputMode="numeric"
            value={tenure}
            onChange={(e) => setTenure(e.target.value.replace(/\D/g, ''))}
            placeholder="months"
          />
        </Field>
        <Field label="Monthly EMI" htmlFor="loan-emi" error={errors.emi}>
          <MoneyInput id="loan-emi" value={emi} onChange={setEmi} placeholder="0" />
        </Field>
      </div>
      {suggestedEmi > 0 && Math.abs(suggestedEmi - Number(emi)) >= 1 && (
        <button
          type="button"
          onClick={() => setEmi(String(Math.round(suggestedEmi)))}
          className="flex w-full items-center gap-2 rounded-xl bg-subtle px-3 py-2.5 text-left text-[13px] text-ink-2 transition hover:bg-primary-soft"
        >
          <Calculator className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            For a new loan of {formatINR(Number(principal))} over {tenure} months, the EMI would be{' '}
            <span className="font-semibold text-ink">{formatINR(Math.round(suggestedEmi))}</span>. Tap to use it.
          </span>
        </button>
      )}
      <Field label="Next EMI due" htmlFor="loan-due" error={errors.nextDue}>
        <Input id="loan-due" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
      </Field>
      <div className="flex gap-2 pt-2">
        {loan && (
          <Button
            variant="danger"
            onClick={() => {
              deleteLoan(loan.id);
              toast('Loan removed');
              onClose();
            }}
          >
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {loan ? 'Save' : 'Add loan'}
        </Button>
      </div>
    </form>
  );
}

export function PayEmiForm({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  return (
    <Modal open={loan !== null} onClose={onClose} title="Mark EMI as paid">
      {loan && <PayEmiFields loan={loan} onClose={onClose} />}
    </Modal>
  );
}

function PayEmiFields({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const accounts = useFinance((s) => s.accounts);
  const payEmi = useFinance((s) => s.payEmi);
  const [record, setRecord] = useState(true);
  const [account, setAccount] = useState(accounts.find((a) => a.type === 'bank')?.id ?? accounts[0]?.id ?? '');
  const today = todayISO();
  const [date, setDate] = useState(loan.nextDue < today ? loan.nextDue : today);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        payEmi(loan.id, record && account ? { accountId: account, date } : undefined);
        toast(loan.remainingTenure === 1 ? `${loan.name} fully repaid 🎉` : `${loan.name} EMI marked as paid`);
        onClose();
      }}
    >
      <p className="text-sm text-ink-2">
        {loan.name} · <span className="font-semibold text-ink">{formatINR(loan.emi)}</span> due {formatDate(loan.nextDue)}.{' '}
        {loan.remainingTenure - 1} {loan.remainingTenure - 1 === 1 ? 'EMI' : 'EMIs'} will be left.
      </p>
      <label className="flex items-start gap-3 rounded-xl border border-line p-3">
        <input
          type="checkbox"
          checked={record}
          onChange={(e) => setRecord(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--primary-fill)]"
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Also record it as an expense</span>
          <span className="block text-xs text-muted">Adds a transaction under “EMI & Loans” so your balance stays right.</span>
        </span>
      </label>
      {record && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid from" htmlFor="emi-account">
            <Select id="emi-account" value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid on" htmlFor="emi-date">
            <Input id="emi-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      )}
      <Button type="submit" className="w-full">
        Mark as paid
      </Button>
    </form>
  );
}
