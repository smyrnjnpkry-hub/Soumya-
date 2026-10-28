import { ArrowLeftRight, ArrowRight, FileUp, Pencil, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AccountForm } from '@/components/forms/AccountForm';
import { ACCOUNT_ICONS, ACCOUNT_TYPE_LABELS } from '@/components/meta';
import { EmptyState } from '@/components/ui/Bits';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { monthBounds, monthKey, todayISO } from '@/lib/dates';
import { accountBalances } from '@/lib/finance';
import { formatINR, formatMonth } from '@/lib/format';
import type { Account } from '@/lib/types';
import { cn } from '@/lib/ui';
import { useFinance } from '@/store/finance';

export default function Accounts() {
  const accounts = useFinance((s) => s.accounts);
  const transactions = useFinance((s) => s.transactions);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const key = monthKey(todayISO());

  const view = useMemo(() => {
    const balances = accountBalances(accounts, transactions);
    const { start, end } = monthBounds(key);
    const flows: Record<string, { in: number; out: number; count: number }> = {};
    for (const a of accounts) flows[a.id] = { in: 0, out: 0, count: 0 };
    for (const t of transactions) {
      if (flows[t.account]) flows[t.account].count++;
      if (t.toAccount && flows[t.toAccount]) flows[t.toAccount].count++;
      if (t.date < start || t.date > end) continue;
      if (t.type === 'income' && flows[t.account]) flows[t.account].in += t.amount;
      if (t.type === 'expense' && flows[t.account]) flows[t.account].out += t.amount;
      if (t.type === 'transfer') {
        if (flows[t.account]) flows[t.account].out += t.amount;
        if (t.toAccount && flows[t.toAccount]) flows[t.toAccount].in += t.amount;
      }
    }
    return { balances, flows, total: Object.values(balances).reduce((s, b) => s + b, 0) };
  }, [accounts, transactions, key]);

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Cash, bank and UPI balances in one place"
        actions={
          <>
            <ButtonLink to="/import" variant="secondary" icon={FileUp}>
              Import statement
            </ButtonLink>
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add account
            </Button>
          </>
        }
      />

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No accounts"
            description="Add your bank, UPI wallet or cash to track balances."
            action={
              <Button icon={Plus} onClick={() => setEditing('new')}>
                Add account
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <p className="text-[13px] font-medium text-muted">Total across {accounts.length} accounts</p>
            <p className={cn('mt-1 text-4xl font-bold tracking-tight', view.total < 0 ? 'text-expense' : 'text-ink')}>
              {formatINR(view.total)}
            </p>
            <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
              <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Moved money between accounts (ATM withdrawal, UPI top-up)? Record it as a transfer so both balances stay right.
            </p>
            <ButtonLink to="/transactions/new?type=transfer" variant="soft" size="sm" className="mt-3">
              New transfer
            </ButtonLink>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 lg:gap-5">
            {accounts.map((account) => {
              const Icon = ACCOUNT_ICONS[account.type];
              const balance = view.balances[account.id] ?? 0;
              const flow = view.flows[account.id];
              return (
                <Card key={account.id} className="flex flex-col">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold text-ink">{account.name}</h2>
                      <p className="text-[13px] text-muted">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                    </div>
                    <IconButton label={`Edit ${account.name}`} onClick={() => setEditing(account)} className="-mt-1 -mr-2">
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>
                  <p className={cn('mt-4 text-2xl font-bold tracking-tight', balance < 0 ? 'text-expense' : 'text-ink')}>
                    {formatINR(balance)}
                  </p>
                  <p className="text-xs text-muted">Opening balance {formatINR(account.balance)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-subtle p-3 text-sm">
                    <div>
                      <p className="text-[11px] text-muted">In · {formatMonth(key, 'short')}</p>
                      <p className="font-semibold text-income tabular-nums">+{formatINR(flow.in)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">Out · {formatMonth(key, 'short')}</p>
                      <p className="font-semibold text-expense tabular-nums">−{formatINR(flow.out)}</p>
                    </div>
                  </div>
                  <Link
                    to={`/transactions?account=${account.id}`}
                    className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
                  >
                    {flow.count} transactions <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <AccountForm open={editing !== null} onClose={() => setEditing(null)} account={editing && editing !== 'new' ? editing : undefined} />
    </>
  );
}
