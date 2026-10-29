import type {
  Account,
  Budget,
  Category,
  ColorKey,
  CreditCard,
  FinanceData,
  Goal,
  LentBorrowed,
  LentBorrowedPayment,
  Loan,
  Transaction,
} from './types';

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
const LAST4 = /^\d{4}$/;
const COLORS: ColorKey[] = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red', 'slate'];

const str = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const date = (v: unknown): v is string => str(v) && ISO_DATE.test(v);
const atLeast0 = (v: unknown): v is number => num(v) && v >= 0;
const oneOf = <T extends string>(v: unknown, options: readonly T[]): v is T => options.includes(v as T);
const optional = <T>(v: unknown, check: (v: unknown) => v is T): v is T | undefined => v === undefined || check(v);
const bool = (v: unknown): v is boolean => typeof v === 'boolean';

const PAYMENT_TYPES = ['interest', 'principal', 'mixed', 'settlement', 'correction'] as const;

/** Corrections can raise what's owed, so their money-back part may be negative. */
const parsePayment = (r: Raw): LentBorrowedPayment | null =>
  str(r.id) &&
  date(r.date) &&
  oneOf(r.type, PAYMENT_TYPES) &&
  atLeast0(r.interestPortion) &&
  num(r.principalPortion) &&
  optional(r.waived, atLeast0) &&
  optional(r.note, str) &&
  optional(r.linkedTransactionId, str) &&
  optional(r.addedTransaction, bool)
    ? {
        id: r.id,
        date: r.date,
        type: r.type,
        interestPortion: r.interestPortion,
        principalPortion: r.principalPortion,
        ...(atLeast0(r.waived) && r.waived > 0 ? { waived: r.waived } : {}),
        ...(str(r.note) ? { note: r.note } : {}),
        ...(str(r.linkedTransactionId) ? { linkedTransactionId: r.linkedTransactionId } : {}),
        ...(r.addedTransaction === true ? { addedTransaction: true } : {}),
      }
    : null;

function parseLentBorrowed(r: Raw): LentBorrowed | null {
  const valid =
    str(r.id) &&
    str(r.person) &&
    optional(r.phone, str) &&
    optional(r.note, str) &&
    oneOf(r.direction, ['lent', 'borrowed'] as const) &&
    num(r.principal) &&
    r.principal > 0 &&
    oneOf(r.interestType, ['none', 'monthly', 'end'] as const) &&
    atLeast0(r.interestRate) &&
    date(r.startDate) &&
    (r.dueDay === undefined || (Number.isInteger(r.dueDay) && (r.dueDay as number) >= 1 && (r.dueDay as number) <= 31)) &&
    optional(r.dueDate, date) &&
    bool(r.remind) &&
    Array.isArray(r.payments) &&
    optional(r.startTransactionId, str) &&
    optional(r.addedStartTransaction, bool);
  if (!valid) return null;
  const payments = (r.payments as unknown[]).map((p) => (p && typeof p === 'object' ? parsePayment(p as Raw) : null));
  if (payments.some((p) => p === null)) return null;
  return {
    id: r.id as string,
    person: r.person as string,
    ...(str(r.phone) ? { phone: r.phone } : {}),
    ...(str(r.note) ? { note: r.note } : {}),
    direction: r.direction as LentBorrowed['direction'],
    principal: r.principal as number,
    interestType: r.interestType as LentBorrowed['interestType'],
    interestRate: r.interestRate as number,
    startDate: r.startDate as string,
    ...(r.dueDay !== undefined ? { dueDay: r.dueDay as number } : {}),
    ...(str(r.dueDate) ? { dueDate: r.dueDate } : {}),
    remind: r.remind as boolean,
    payments: payments as LentBorrowedPayment[],
    ...(str(r.startTransactionId) ? { startTransactionId: r.startTransactionId } : {}),
    ...(r.addedStartTransaction === true ? { addedStartTransaction: true } : {}),
  };
}

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
    (r.creditCardId === undefined || r.creditCardId === null || str(r.creditCardId)) &&
    (r.principalPart === undefined || (atLeast0(r.principalPart) && r.principalPart <= (r.amount as number))) &&
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
          ...(r.creditCardId === null || str(r.creditCardId) ? { creditCardId: r.creditCardId } : {}),
          ...(atLeast0(r.principalPart) && r.principalPart > 0 ? { principalPart: r.principalPart } : {}),
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
    str(r.id) && str(r.name) && num(r.principal) && num(r.emi) && num(r.interestRate) && num(r.remainingTenure) && date(r.nextDue)
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
  creditCards: (r): CreditCard | null =>
    str(r.id) &&
    str(r.name) &&
    atLeast0(r.limit) &&
    atLeast0(r.outstanding) &&
    atLeast0(r.minDue) &&
    date(r.dueDate) &&
    atLeast0(r.interestRate) &&
    (r.last4 === undefined || (str(r.last4) && LAST4.test(r.last4)))
      ? {
          id: r.id,
          name: r.name,
          limit: r.limit,
          outstanding: r.outstanding,
          minDue: r.minDue,
          dueDate: r.dueDate,
          interestRate: r.interestRate,
          ...(str(r.last4) ? { last4: r.last4 } : {}),
        }
      : null,
  lentBorrowed: parseLentBorrowed,
};

const LABELS: Record<keyof FinanceData, string> = {
  transactions: 'Transaction',
  accounts: 'Account',
  categories: 'Category',
  budgets: 'Budget',
  goals: 'Goal',
  loans: 'Loan',
  creditCards: 'Credit card',
  lentBorrowed: 'Lent & borrowed entry',
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
