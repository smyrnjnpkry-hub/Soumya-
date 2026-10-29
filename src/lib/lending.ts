import { safeText, toCSV } from './csv';
import { addMonthsToKey, daysBetween, daysInMonth, monthKey } from './dates';
import { formatDate, formatINR, round2 } from './format';
import type { InterestType, LentBorrowed, LentBorrowedType, Transaction } from './types';

/*
 * Lent & Borrowed: money lent to people and borrowed from them. Like loans and cards, you enter the facts; what's still
 * owed, the interest pending and whether an entry is settled are always worked out from its history, so they can't drift.
 */

export const DUE_SOON_DAYS = 7;
/** More than 10% a month is almost certainly a yearly rate typed in by mistake. */
export const MAX_MONTHLY_RATE = 10;
const MATCH_DAYS = 5;
/** Less than this left counts as nothing (paise and rounding). */
const NOTHING = 0.5;
/** Interest paid at the end builds up by the day, counting 30 days to a month. */
const DAYS_PER_MONTH = 30;

export type Draft = Omit<LentBorrowed, 'id' | 'payments' | 'startTransactionId' | 'addedStartTransaction'>;
export type Flow = 'in' | 'out';

/** Lending sends money out and brings repayments in; borrowing is the other way round. */
export const startFlow = (direction: LentBorrowedType): Flow => (direction === 'lent' ? 'out' : 'in');
export const paymentFlow = (direction: LentBorrowedType): Flow => (direction === 'lent' ? 'in' : 'out');

const paidBack = (entry: LentBorrowed, counts: (date: string) => boolean) =>
  entry.payments.reduce((sum, p) => (counts(p.date) ? sum + p.principalPortion : sum), 0);

/** What's still owed at the end of a day: the amount less money paid back and corrections up to then. */
export const owedOn = (entry: LentBorrowed, date: string): number =>
  round2(Math.max(entry.principal - paidBack(entry, (d) => d <= date), 0));

/** What was owed just before a day's payments. */
const owedBefore = (entry: LentBorrowed, date: string): number => round2(Math.max(entry.principal - paidBack(entry, (d) => d < date), 0));

const dueDay = (entry: LentBorrowed) => entry.dueDay ?? Number(entry.startDate.slice(8, 10));
const dueDateIn = (entry: LentBorrowed, key: string) => `${key}-${String(Math.min(dueDay(entry), daysInMonth(key))).padStart(2, '0')}`;
const firstDueMonth = (entry: LentBorrowed) => addMonthsToKey(monthKey(entry.startDate), 1);

/** Monthly interest due dates: the due day of each month after the one the money changed hands in, up to `until`. */
export function interestDueDates(entry: LentBorrowed, until: string): string[] {
  const dates: string[] = [];
  for (let key = firstDueMonth(entry); ; key = addMonthsToKey(key, 1)) {
    const date = dueDateIn(entry, key);
    if (date > until) return dates;
    dates.push(date);
  }
}

export interface InterestState {
  /** Interest added on due dates (monthly) or built up by the day (at the end) */
  charged: number;
  received: number;
  waived: number;
  /** charged − received − waived; negative when paid ahead */
  pending: number;
  /** Monthly: the oldest due date whose interest isn't fully paid */
  overdueSince: string | null;
  /** Monthly: the next due date after today, while something is owed */
  nextDue: string | null;
  /** A month's interest on what's owed today */
  perMonth: number;
}

export function interestState(entry: LentBorrowed, today: string): InterestState {
  const received = round2(entry.payments.reduce((sum, p) => sum + p.interestPortion, 0));
  const waived = round2(entry.payments.reduce((sum, p) => sum + (p.waived ?? 0), 0));
  const owed = owedOn(entry, today);
  const rate = entry.interestRate / 100;
  if (entry.interestType === 'none') return { charged: 0, received, waived, pending: 0, overdueSince: null, nextDue: null, perMonth: 0 };
  const perMonth = round2(owed * rate);

  if (entry.interestType === 'end') {
    // By the day on what was owed between one change and the next
    const changes = [...new Set(entry.payments.filter((p) => p.principalPortion !== 0 && p.date <= today).map((p) => p.date))].sort();
    let built = 0;
    let from = entry.startDate;
    for (const to of [...changes, today]) {
      if (to <= from) continue;
      built += (owedBefore(entry, to) * rate * daysBetween(from, to)) / DAYS_PER_MONTH;
      from = to;
    }
    const charged = round2(built);
    return { charged, received, waived, pending: round2(charged - received - waived), overdueSince: null, nextDue: null, perMonth };
  }

  const charges = interestDueDates(entry, today).map((date) => ({ date, amount: round2(owedBefore(entry, date) * rate) }));
  const charged = round2(charges.reduce((sum, c) => sum + c.amount, 0));
  // Interest received clears the oldest month first
  let left = received + waived;
  let overdueSince: string | null = null;
  for (const charge of charges) {
    if (left + NOTHING >= charge.amount) left -= charge.amount;
    else {
      overdueSince = charge.date;
      break;
    }
  }
  let key = monthKey(today) < firstDueMonth(entry) ? firstDueMonth(entry) : monthKey(today);
  if (dueDateIn(entry, key) <= today) key = addMonthsToKey(key, 1);
  return {
    charged,
    received,
    waived,
    pending: round2(charged - received - waived),
    overdueSince,
    nextDue: owed > 0 ? dueDateIn(entry, key) : null,
    perMonth,
  };
}

/** What's due next: interest (monthly) or the money back. `days` is negative once overdue. */
export interface DueBadge {
  kind: 'interest' | 'money';
  date: string;
  days: number;
  amount: number;
}

export interface EntrySummary {
  owed: number;
  interest: InterestState;
  settled: boolean;
  /** The most urgent thing due */
  due: DueBadge | null;
  /** Overdue or due within a week, with reminders on */
  dueSoon: boolean;
}

export function entrySummary(entry: LentBorrowed, today: string): EntrySummary {
  const owed = owedOn(entry, today);
  const interest = interestState(entry, today);
  const settled = owed <= NOTHING && interest.pending <= NOTHING;
  const options: DueBadge[] = [];
  if (!settled && entry.interestType === 'monthly') {
    if (interest.overdueSince)
      options.push({
        kind: 'interest',
        date: interest.overdueSince,
        days: daysBetween(today, interest.overdueSince),
        amount: interest.pending,
      });
    else if (interest.nextDue)
      options.push({ kind: 'interest', date: interest.nextDue, days: daysBetween(today, interest.nextDue), amount: interest.perMonth });
  }
  if (!settled && entry.dueDate && owed > NOTHING) {
    const withInterest = entry.interestType === 'end' ? Math.max(interest.pending, 0) : 0;
    options.push({ kind: 'money', date: entry.dueDate, days: daysBetween(today, entry.dueDate), amount: round2(owed + withInterest) });
  }
  const due = options.sort((a, b) => a.days - b.days)[0] ?? null;
  return { owed, interest, settled, due, dueSoon: entry.remind && due !== null && due.days <= DUE_SOON_DAYS };
}

export interface LendingOverview {
  owedToYou: number;
  youOwe: number;
  /** owedToYou − youOwe */
  net: number;
  /** Interest received on money you lent, this calendar month */
  interestThisMonth: number;
  /** Interest pending on money you lent */
  pendingToYou: number;
}

export function lendingOverview(entries: LentBorrowed[], today: string): LendingOverview {
  const month = monthKey(today);
  let owedToYou = 0;
  let youOwe = 0;
  let interestThisMonth = 0;
  let pendingToYou = 0;
  for (const entry of entries) {
    const owed = owedOn(entry, today);
    if (entry.direction === 'borrowed') {
      youOwe += owed;
      continue;
    }
    owedToYou += owed;
    pendingToYou += Math.max(interestState(entry, today).pending, 0);
    interestThisMonth += entry.payments.filter((p) => monthKey(p.date) === month).reduce((sum, p) => sum + p.interestPortion, 0);
  }
  return {
    owedToYou: round2(owedToYou),
    youOwe: round2(youOwe),
    net: round2(owedToYou - youOwe),
    interestThisMonth: round2(interestThisMonth),
    pendingToYou: round2(pendingToYou),
  };
}

/** Transactions an entry already uses, as its start or for a payment. */
export function linkedTransactionIds(entries: LentBorrowed[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.startTransactionId) ids.add(entry.startTransactionId);
    for (const p of entry.payments) if (p.linkedTransactionId) ids.add(p.linkedTransactionId);
  }
  return ids;
}

/**
 * Transactions that may already be this money moving: money in or out (never a transfer) of about the same amount (₹1
 * or 1%) within 5 days, not used by any entry or linked to a credit card. Closest amount first, then closest date.
 */
export function transactionCandidates(
  transactions: Transaction[],
  entries: LentBorrowed[],
  money: { flow: Flow; amount: number; date: string },
): Transaction[] {
  const used = linkedTransactionIds(entries);
  const type = money.flow === 'in' ? 'income' : 'expense';
  const tolerance = Math.max(1, money.amount * 0.01);
  return transactions
    .filter((t) => t.type === type && !used.has(t.id) && typeof t.creditCardId !== 'string')
    .map((t) => ({ t, amountGap: Math.abs(t.amount - money.amount), dayGap: Math.abs(daysBetween(money.date, t.date)) }))
    .filter(({ amountGap, dayGap }) => amountGap <= tolerance + 1e-9 && dayGap <= MATCH_DAYS)
    .sort((a, b) => a.amountGap - b.amountGap || a.dayGap - b.dayGap)
    .map(({ t }) => t);
}

export type LendingFilter = 'all' | 'lent' | 'borrowed' | 'interest' | 'no-interest' | 'due-soon';

/** Overdue and due soon first, then by next due date, then by name; settled entries last, and only when asked. */
export function filterEntries(
  entries: LentBorrowed[],
  { filter, query, showSettled }: { filter: LendingFilter; query: string; showSettled: boolean },
  today: string,
): LentBorrowed[] {
  const search = query.trim().toLowerCase();
  const matches = (entry: LentBorrowed, s: EntrySummary) => {
    if (s.settled && !showSettled) return false;
    if (search && !entry.person.toLowerCase().includes(search) && !(entry.note ?? '').toLowerCase().includes(search)) return false;
    switch (filter) {
      case 'lent':
      case 'borrowed':
        return entry.direction === filter;
      case 'interest':
        return entry.interestType !== 'none';
      case 'no-interest':
        return entry.interestType === 'none';
      case 'due-soon':
        return s.dueSoon;
      default:
        return true;
    }
  };
  return entries
    .map((entry) => ({ entry, s: entrySummary(entry, today) }))
    .filter(({ entry, s }) => matches(entry, s))
    .sort(
      (a, b) =>
        Number(a.s.settled) - Number(b.s.settled) ||
        (a.s.due?.days ?? Infinity) - (b.s.due?.days ?? Infinity) ||
        a.entry.person.localeCompare(b.entry.person),
    )
    .map(({ entry }) => entry);
}

const DIRECTION_LABEL: Record<LentBorrowedType, string> = { lent: 'Lent', borrowed: 'Borrowed' };
export const INTEREST_LABEL: Record<InterestType, string> = { none: 'None', monthly: 'Monthly', end: 'At the end' };
const CSV_HEADER = [
  'Person',
  'Phone',
  'Direction',
  'Amount',
  'Still owed',
  'Interest',
  'Rate (% a month)',
  'Interest pending',
  'Start date',
  'Money back by',
  'Due day',
  'Status',
  'Note',
];

export function lendingToCSV(entries: LentBorrowed[], today: string): string {
  const rows = entries.map((entry) => {
    const s = entrySummary(entry, today);
    return [
      safeText(entry.person),
      safeText(entry.phone ?? ''),
      DIRECTION_LABEL[entry.direction],
      String(entry.principal),
      String(s.owed),
      INTEREST_LABEL[entry.interestType],
      String(entry.interestRate),
      String(Math.max(s.interest.pending, 0)),
      entry.startDate,
      entry.dueDate ?? '',
      entry.interestType === 'monthly' ? String(dueDay(entry)) : '',
      s.settled ? 'Settled' : 'Open',
      safeText(entry.note ?? ''),
    ];
  });
  return toCSV([CSV_HEADER, ...rows]);
}

/** An Indian mobile number as WhatsApp wants it: country code first, digits only. */
function whatsappNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

const firstName = (person: string) => person.trim().split(/[\s(]/)[0] || person.trim();

/** A wa.me link with a ready reminder for someone who owes you, when something is due; you send it yourself. */
export function whatsappReminder(entry: LentBorrowed, today: string): string | null {
  if (entry.direction !== 'lent' || !entry.phone) return null;
  const number = whatsappNumber(entry.phone);
  const { due } = entrySummary(entry, today);
  if (!number || !due) return null;
  const amount = formatINR(Math.round(due.amount));
  const date = formatDate(due.date, 'short');
  const reminder =
    due.kind === 'interest'
      ? due.days <= 0
        ? `about the ${amount} interest pending`
        : `that ${amount} interest is due on ${date}`
      : `that ${amount} ${due.days < 0 ? 'was' : 'is'} due back on ${date}`;
  const text = `Hi ${firstName(entry.person)}, just a reminder ${reminder}. Thanks!`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The add/edit form's fields, as typed. */
export interface EntryFormValues {
  person: string;
  phone: string;
  note: string;
  direction: LentBorrowedType;
  principal: string;
  startDate: string;
  interestType: InterestType;
  interestRate: string;
  dueDay: string;
  dueDate: string;
  remind: boolean;
}

export type EntryFormResult = { ok: true; draft: Draft } | { ok: false; errors: Partial<Record<keyof EntryFormValues, string>> };

const amountOf = (raw: string) => (raw.trim() === '' ? NaN : Number(raw));

export function checkEntryForm(values: EntryFormValues): EntryFormResult {
  const person = values.person.trim();
  const phone = values.phone.trim();
  const note = values.note.trim();
  const principal = amountOf(values.principal);
  const rate = amountOf(values.interestRate);
  const day = values.dueDay.trim() === '' ? undefined : Number(values.dueDay);
  const monthly = values.interestType === 'monthly';

  const errors: Partial<Record<keyof EntryFormValues, string>> = {};
  if (!person) errors.person = 'Enter their name';
  if (phone && !whatsappNumber(phone)) errors.phone = 'Enter a 10-digit mobile number, or leave it empty';
  if (!(principal > 0)) errors.principal = 'Enter the amount';
  if (!values.startDate) errors.startDate = 'Pick the date';
  if (values.interestType !== 'none' && !(rate > 0 && rate <= MAX_MONTHLY_RATE))
    errors.interestRate = `Enter the rate a month, up to ${MAX_MONTHLY_RATE}%`;
  if (monthly && day !== undefined && !(Number.isInteger(day) && day >= 1 && day <= 31)) errors.dueDay = 'Enter a day from 1 to 31';
  if (values.dueDate && values.startDate && values.dueDate < values.startDate) errors.dueDate = 'Can’t be before the money changed hands';
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    draft: {
      person,
      ...(phone ? { phone } : {}),
      ...(note ? { note } : {}),
      direction: values.direction,
      principal: round2(principal),
      startDate: values.startDate,
      interestType: values.interestType,
      interestRate: values.interestType === 'none' ? 0 : rate,
      ...(monthly && day !== undefined ? { dueDay: day } : {}),
      ...(values.dueDate ? { dueDate: values.dueDate } : {}),
      remind: values.remind,
    },
  };
}

export type PaymentKind = 'interest' | 'money' | 'settle';
export interface PaymentPortions {
  interestPortion: number;
  principalPortion: number;
}

/** What the payment form starts with: interest pending (or a month's worth), nothing, or everything to settle. */
export function paymentDefaults(entry: LentBorrowed, kind: PaymentKind, today: string): PaymentPortions {
  const interest = interestState(entry, today);
  const pending = Math.max(interest.pending, 0);
  if (kind === 'interest') return { interestPortion: pending > NOTHING ? pending : interest.perMonth, principalPortion: 0 };
  if (kind === 'settle') return { interestPortion: pending, principalPortion: owedOn(entry, today) };
  return { interestPortion: 0, principalPortion: 0 };
}

export interface PaymentFormValues {
  kind: PaymentKind;
  interest: string;
  principal: string;
  date: string;
}

export type PaymentFormResult =
  { ok: true; payment: PaymentPortions } | { ok: false; errors: Partial<Record<'amount' | 'interest' | 'principal' | 'date', string>> };

/** Settling pays back everything owed on that date; anything else can't pay back more than is owed. */
export function checkPaymentForm(entry: LentBorrowed, values: PaymentFormValues): PaymentFormResult {
  const interest = values.interest.trim() === '' ? 0 : Number(values.interest);
  const typed = values.principal.trim() === '' ? 0 : Number(values.principal);
  const owed = values.date ? owedOn(entry, values.date) : entry.principal;
  const principal = values.kind === 'settle' ? owed : typed;

  const errors: Partial<Record<'amount' | 'interest' | 'principal' | 'date', string>> = {};
  if (!values.date) errors.date = 'Pick the date';
  if (!(interest >= 0)) errors.interest = 'Enter the interest, or 0';
  if (!(principal >= 0)) errors.principal = 'Enter the money back, or 0';
  else if (values.kind !== 'settle' && principal > owed + NOTHING) errors.principal = `More than the ${formatINR(owed)} still owed`;
  if (values.kind !== 'settle' && !errors.principal && !errors.interest && !(interest + principal > 0))
    errors.amount = 'Enter what was paid';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, payment: { interestPortion: round2(interest), principalPortion: round2(principal) } };
}
