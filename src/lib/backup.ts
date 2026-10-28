import type { Account, Budget, Category, ColorKey, FinanceData, Goal, Loan, Transaction } from './types';

/**
 * JSON backup / restore. Data never leaves the device, so this file is the
 * user's only safety net — restore validates every record and copies known
 * fields only, rejecting the whole file rather than importing half of it.
 */

const APP_ID = 'fintrack';
const VERSION = 1;

type Raw = Record<string, unknown>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const COLORS: ColorKey[] = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red', 'slate'];

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown): v is string => str(v) && ISO_DATE.test(v);
const oneOf = <T extends string>(v: unknown, options: readonly T[]): v is T => options.includes(v as T);

const parsers: { [K in keyof FinanceData]: (r: Raw) => FinanceData[K][number] | null } = {
  transactions: (r): Transaction | null =>
    str(r.id) &&
    oneOf(r.type, ['income', 'expense', 'transfer'] as const) &&
    num(r.amount) &&
    r.amount > 0 &&
    date(r.date) &&
    str(r.category) &&
    str(r.account) &&
    (r.toAccount === undefined || str(r.toAccount)) &&
    str(r.note)
      ? {
          id: r.id,
          type: r.type,
          amount: r.amount,
          date: r.date,
          category: r.category,
          account: r.account,
          note: r.note,
          ...(str(r.toAccount) ? { toAccount: r.toAccount } : {}),
        }
      : null,
  accounts: (r): Account | null =>
    str(r.id) && str(r.name) && oneOf(r.type, ['cash', 'bank', 'upi'] as const) && num(r.balance)
      ? { id: r.id, name: r.name, type: r.type, balance: r.balance }
      : null,
  categories: (r): Category | null =>
    str(r.id) && str(r.name) && str(r.icon) && oneOf(r.color, COLORS) && oneOf(r.type, ['income', 'expense'] as const)
      ? { id: r.id, name: r.name, icon: r.icon, color: r.color, type: r.type }
      : null,
  budgets: (r): Budget | null =>
    str(r.id) && str(r.category) && str(r.month) && MONTH.test(r.month) && num(r.limit) && r.limit >= 0
      ? { id: r.id, category: r.category, month: r.month, limit: r.limit }
      : null,
  goals: (r): Goal | null =>
    str(r.id) && str(r.name) && num(r.target) && num(r.current) && date(r.deadline)
      ? { id: r.id, name: r.name, target: r.target, current: r.current, deadline: r.deadline }
      : null,
  loans: (r): Loan | null =>
    str(r.id) &&
    str(r.name) &&
    num(r.principal) &&
    num(r.emi) &&
    num(r.interestRate) &&
    num(r.remainingTenure) &&
    date(r.nextDue)
      ? {
          id: r.id,
          name: r.name,
          principal: r.principal,
          emi: r.emi,
          interestRate: r.interestRate,
          remainingTenure: r.remainingTenure,
          nextDue: r.nextDue,
        }
      : null,
};

const LABELS: Record<keyof FinanceData, string> = {
  transactions: 'Transaction',
  accounts: 'Account',
  categories: 'Category',
  budgets: 'Budget',
  goals: 'Goal',
  loans: 'Loan',
};

export function createBackup(data: FinanceData, exportedAt: string): string {
  return JSON.stringify({ app: APP_ID, version: VERSION, exportedAt, data }, null, 2);
}

export type BackupResult = { ok: true; data: FinanceData } | { ok: false; error: string };

export function parseBackup(text: string): BackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON.' };
  }
  const root = parsed as Raw | null;
  if (!root || root.app !== APP_ID || typeof root.data !== 'object' || root.data === null) {
    return { ok: false, error: 'This doesn’t look like a FinTrack backup file.' };
  }
  const source = root.data as Raw;
  const data = {} as Record<keyof FinanceData, unknown[]>;
  for (const key of Object.keys(parsers) as (keyof FinanceData)[]) {
    const items = source[key] ?? [];
    if (!Array.isArray(items)) return { ok: false, error: `The ${LABELS[key].toLowerCase()} list in this backup is damaged.` };
    const clean: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const value = item && typeof item === 'object' ? parsers[key](item as Raw) : null;
      if (!value) return { ok: false, error: `${LABELS[key]} #${i + 1} in this backup is invalid.` };
      clean.push(value);
    }
    data[key] = clean;
  }
  return { ok: true, data: data as unknown as FinanceData };
}
