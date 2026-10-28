import { Link } from 'react-router';
import { formatDate } from '@/lib/format';
import type { Lookup } from '@/lib/transactions';
import type { Transaction } from '@/lib/types';
import { Amount, CategoryIcon } from '../ui/Bits';

/** Title + subtitle for a transaction: the note when there is one, else the category. */
export function describe(t: Transaction, { categories, accounts }: Lookup) {
  const accountName = (id?: string) => (id ? (accounts[id]?.name ?? 'Deleted account') : '');
  if (t.type === 'transfer') {
    return {
      title: t.note || 'Transfer',
      subtitle: `${accountName(t.account)} → ${accountName(t.toAccount)}`,
    };
  }
  const category = categories[t.category]?.name ?? 'Uncategorized';
  return t.note
    ? { title: t.note, subtitle: `${category} · ${accountName(t.account)}` }
    : { title: category, subtitle: accountName(t.account) };
}

export function TransactionRow({ t, lookup, showDate }: { t: Transaction; lookup: Lookup; showDate?: boolean }) {
  const { title, subtitle } = describe(t, lookup);
  return (
    <Link
      to={`/transactions/${t.id}/edit`}
      className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-subtle focus-visible:bg-subtle"
    >
      <CategoryIcon category={lookup.categories[t.category]} transfer={t.type === 'transfer'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink">{title}</div>
        <div className="truncate text-[13px] text-muted">
          {showDate ? `${formatDate(t.date, 'short')} · ${subtitle}` : subtitle}
        </div>
      </div>
      <Amount value={t.amount} type={t.type} className="text-[15px]" />
    </Link>
  );
}
