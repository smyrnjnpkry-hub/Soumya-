import type { Lookup } from './transactions';
import type { Transaction } from './types';

const NEEDS_QUOTES = /[",\r\n]/;

const escapeCell = (value: string) => (NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** RFC 4180 CSV with CRLF line endings. */
export const toCSV = (rows: string[][]): string => rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');

/** Stops spreadsheet apps from evaluating user text such as "=HYPERLINK(...)" as a formula. */
const safeText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const TYPE_LABEL: Record<Transaction['type'], string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
};

const HEADER = ['Date', 'Type', 'Category', 'Account', 'To account', 'Amount (INR)', 'Note'];

export function transactionsToCSV(transactions: Transaction[], { categories, accounts }: Lookup): string {
  const accountName = (id: string) => safeText(accounts[id]?.name ?? 'Unknown account');
  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => [
      t.date,
      TYPE_LABEL[t.type],
      t.type === 'transfer' ? '' : safeText(categories[t.category]?.name ?? 'Uncategorized'),
      accountName(t.account),
      t.toAccount ? accountName(t.toAccount) : '',
      String(t.amount),
      safeText(t.note),
    ]);
  return toCSV([HEADER, ...rows]);
}
