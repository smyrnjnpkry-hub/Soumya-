import { useState } from 'react';
import { round2 } from '@/lib/format';
import type { Account, AccountType } from '@/lib/types';
import { useFinance } from '@/store/finance';
import { toast } from '@/store/toast';
import { Button } from '../ui/Button';
import { Field, Input, Segmented } from '../ui/Form';
import { Modal } from '../ui/Modal';

export function AccountForm({ open, onClose, account }: { open: boolean; onClose: () => void; account?: Account }) {
  return (
    <Modal open={open} onClose={onClose} title={account ? 'Edit account' : 'New account'}>
      <AccountFields onClose={onClose} account={account} />
    </Modal>
  );
}

function AccountFields({ onClose, account }: { onClose: () => void; account?: Account }) {
  const addAccount = useFinance((s) => s.addAccount);
  const updateAccount = useFinance((s) => s.updateAccount);
  const deleteAccount = useFinance((s) => s.deleteAccount);
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [balance, setBalance] = useState(account ? String(account.balance) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = () => {
    const opening = balance.trim() === '' ? 0 : Number(balance);
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = 'Name the account, e.g. “SBI Savings”';
    if (!Number.isFinite(opening)) found.balance = 'Enter a number';
    setErrors(found);
    if (Object.keys(found).length) return;
    const draft = { name: name.trim(), type, balance: round2(opening) };
    if (account) updateAccount(account.id, draft);
    else addAccount(draft);
    toast(account ? 'Account updated' : 'Account added');
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
      <Segmented
        label="Account type"
        value={type}
        onChange={setType}
        options={[
          { value: 'bank', label: 'Bank' },
          { value: 'upi', label: 'UPI / Wallet' },
          { value: 'cash', label: 'Cash' },
        ]}
        className="flex w-full"
      />
      <Field label="Name" htmlFor="account-name" error={errors.name}>
        <Input
          id="account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. SBI Savings, Paytm, Wallet cash"
          maxLength={32}
          autoFocus
        />
      </Field>
      <Field
        label="Opening balance"
        htmlFor="account-balance"
        hint="What the account held when you started tracking. Can be negative."
        error={errors.balance}
      >
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">₹</span>
          <Input
            id="account-balance"
            inputMode="decimal"
            className="pl-8 tabular-nums"
            value={balance}
            onChange={(e) => setBalance(e.target.value.replace(/[^\d.-]/g, ''))}
            placeholder="0"
          />
        </div>
      </Field>
      <div className="flex gap-2 pt-2">
        {account && (
          <Button
            variant="danger"
            onClick={() => {
              if (deleteAccount(account.id)) {
                toast('Account deleted');
                onClose();
              } else {
                setErrors({ balance: 'This account has transactions. Delete or move them first.' });
              }
            }}
          >
            Delete
          </Button>
        )}
        <Button type="submit" className="flex-1">
          {account ? 'Save' : 'Add account'}
        </Button>
      </div>
    </form>
  );
}
