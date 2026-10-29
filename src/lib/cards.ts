import { daysBetween } from './dates';
import { round2 } from './format';
import type { CreditCard, Transaction } from './types';

/*
 * Credit cards are tracked like loans: you enter the numbers, and the card's payments are the transactions you already
 * have — typed in or imported from a bank statement. Nothing here creates a transaction; it only works out which
 * existing ones belong to which card, so a payment is never counted twice.
 */

/** 'linked': tied to the card by hand or by recording a payment; 'matched': recognised from its note. */
export type CardMatch = 'linked' | 'matched';
export type CardStatus = 'overdue' | 'due-soon' | 'upcoming' | 'minimum-paid' | 'clear';
export type UsageLevel = 'ok' | 'warning' | 'over';

export const DUE_SOON_DAYS = 7;
/** Keeping usage under 30% of the limit is the usual credit-score advice. */
export const USAGE_WARNING = 0.3;
export const USAGE_CRITICAL = 0.7;

/** Last 4 digits written as part of a masked card number: ••4417, XXXX4417, **4417, "ending 4417", "card 4417". */
const MASKED_LAST4 = /(?:•{2,}|[x*]{2,}|\bending(?:\s+in)?\s+|\bcard\s+(?:no\.?\s*)?)(\d{4})(?!\d)/gi;
const CARD_PAYMENT = /\bcredit\s*card\b|\bcc\s*(?:bill|payment|pmt|autopay)\b|\bcard\s*(?:bill|payment|dues?|autopay)\b/i;
const LAST4 = /^\d{4}$/;
/** Shorter names ("HDFC", "SBI") would match far too much. */
const MIN_NAME_LENGTH = 5;
const CANDIDATE_DAYS = 5;

/** "HDFC Millennia ••4417", or just the name. */
export const cardLabel = (card: Pick<CreditCard, 'name' | 'last4'>) => (card.last4 ? `${card.name} ••${card.last4}` : card.name);

/** A note that reads like paying a credit card bill, without saying which card. */
export const isCardPayment = (note: string) => CARD_PAYMENT.test(note);

const onlyOne = (cards: CreditCard[]) => (cards.length === 1 ? cards[0] : null);

/**
 * The card a transaction belongs to, if any: a link made by hand wins; "not a card payment" means none; otherwise the
 * note's masked last 4, then the card's full name, then — with a single card — any generic card payment.
 */
export function cardFor(t: Pick<Transaction, 'note' | 'creditCardId'>, cards: CreditCard[]): CreditCard | null {
  if (t.creditCardId === null) return null;
  const linked = t.creditCardId ? cards.find((c) => c.id === t.creditCardId) : undefined;
  if (linked) return linked;

  const mentioned = new Set([...t.note.matchAll(MASKED_LAST4)].map((m) => m[1]));
  const byLast4 = cards.filter((c) => c.last4 && mentioned.has(c.last4));
  if (byLast4.length) return onlyOne(byLast4);

  const note = t.note.toLowerCase();
  const byName = cards.filter((c) => c.name.trim().length >= MIN_NAME_LENGTH && note.includes(c.name.trim().toLowerCase()));
  if (byName.length) return onlyOne(byName);

  return isCardPayment(t.note) ? onlyOne(cards) : null;
}

const newestFirst = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date);

/** The card's transactions, newest first. */
export function cardActivity(
  card: CreditCard,
  cards: CreditCard[],
  transactions: Transaction[],
): { transaction: Transaction; match: CardMatch }[] {
  return transactions
    .filter((t) => cardFor(t, cards)?.id === card.id)
    .sort(newestFirst)
    .map((transaction) => ({ transaction, match: transaction.creditCardId === card.id ? 'linked' : 'matched' }));
}

/**
 * Card payments no card claims and not marked "not a card payment" — only possible with two or more cards — newest
 * first, to link by hand.
 */
export function unmatchedCardPayments(cards: CreditCard[], transactions: Transaction[]): Transaction[] {
  if (cards.length < 2) return [];
  return transactions.filter((t) => t.creditCardId !== null && isCardPayment(t.note) && cardFor(t, cards) === null).sort(newestFirst);
}

/**
 * Transactions that may already be this payment: expenses of about the same amount (₹1 or 1%) within 5 days that
 * aren't another card's, marked "not a card payment", or already linked to this card. Best match first.
 */
export function paymentCandidates(
  card: CreditCard,
  cards: CreditCard[],
  payment: { amount: number; date: string },
  transactions: Transaction[],
): Transaction[] {
  const tolerance = Math.max(1, payment.amount * 0.01);
  return transactions
    .filter((t) => {
      if (t.type !== 'expense' || t.creditCardId === null || t.creditCardId === card.id) return false;
      if (Math.abs(t.amount - payment.amount) > tolerance + 1e-9) return false;
      if (Math.abs(daysBetween(payment.date, t.date)) > CANDIDATE_DAYS) return false;
      const owner = cardFor(t, cards);
      return owner === null || owner.id === card.id;
    })
    .map((t) => ({
      t,
      ours: cardFor(t, cards)?.id === card.id ? 0 : 1,
      amountGap: Math.abs(t.amount - payment.amount),
      dayGap: Math.abs(daysBetween(payment.date, t.date)),
    }))
    .sort((a, b) => a.ours - b.ours || a.amountGap - b.amountGap || a.dayGap - b.dayGap)
    .map(({ t }) => t);
}

/**
 * Expenses you could link to the card by hand: any not already under it, newest first. A search matches the note or
 * the amount ("23,480" and "₹23480" both find 23480).
 */
export function linkCandidates(card: CreditCard, cards: CreditCard[], transactions: Transaction[], query: string): Transaction[] {
  const text = query.trim().toLowerCase();
  const digits = text.replace(/[^\d.]/g, '');
  return transactions
    .filter((t) => t.type === 'expense' && cardFor(t, cards)?.id !== card.id)
    .filter((t) => !text || t.note.toLowerCase().includes(text) || (digits !== '' && String(t.amount).includes(digits)))
    .sort(newestFirst);
}

/** The add/edit card form's fields, as typed. */
export interface CardFormValues {
  name: string;
  last4: string;
  limit: string;
  outstanding: string;
  minDue: string;
  dueDate: string;
  interestRate: string;
}

export type CardFormResult =
  { ok: true; draft: Omit<CreditCard, 'id'> } | { ok: false; errors: Partial<Record<keyof CardFormValues, string>> };

/** More than 60% a year (5% a month) is almost certainly a typo. */
const MAX_INTEREST = 60;

const amountOf = (raw: string) => (raw.trim() === '' ? NaN : Number(raw));

export function checkCardForm(values: CardFormValues): CardFormResult {
  const name = values.name.trim();
  const last4 = values.last4.trim();
  const limit = amountOf(values.limit);
  const outstanding = amountOf(values.outstanding);
  const minDue = amountOf(values.minDue);
  const interestRate = amountOf(values.interestRate);

  const errors: Partial<Record<keyof CardFormValues, string>> = {};
  if (!name) errors.name = 'Name the card, e.g. “HDFC Millennia”';
  if (last4 && !LAST4.test(last4)) errors.last4 = 'Enter exactly 4 digits, or leave it empty';
  if (!(limit > 0)) errors.limit = 'Enter the credit limit';
  if (!(outstanding >= 0)) errors.outstanding = 'Enter what you owe now (0 if nothing)';
  if (!(minDue >= 0)) errors.minDue = 'Enter the minimum due (0 if it’s paid)';
  else if (outstanding >= 0 && minDue > outstanding) errors.minDue = 'The minimum due can’t be more than what you owe';
  if (!values.dueDate) errors.dueDate = 'Pick the due date';
  if (!(interestRate >= 0 && interestRate <= MAX_INTEREST)) errors.interestRate = `Enter the yearly rate, from 0 to ${MAX_INTEREST}%`;
  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    draft: {
      name,
      ...(last4 ? { last4 } : {}),
      limit: round2(limit),
      outstanding: round2(outstanding),
      minDue: round2(minDue),
      dueDate: values.dueDate,
      interestRate,
    },
  };
}

export interface CardSummary {
  /** Outstanding ÷ limit (can pass 1 when over the limit) */
  usage: number;
  available: number;
  /** Negative once the due date has passed */
  daysUntilDue: number;
  status: CardStatus;
  /** Interest per month, in percent */
  monthlyRate: number;
  /** About what a month's interest costs if only the minimum is paid (banks charge from each purchase date) */
  minimumOnlyInterest: number;
}

export function cardSummary(card: CreditCard, today: string): CardSummary {
  const daysUntilDue = daysBetween(today, card.dueDate);
  let status: CardStatus;
  if (card.outstanding <= 0) status = 'clear';
  else if (card.minDue <= 0) status = 'minimum-paid';
  else if (daysUntilDue < 0) status = 'overdue';
  else if (daysUntilDue <= DUE_SOON_DAYS) status = 'due-soon';
  else status = 'upcoming';
  return {
    usage: card.limit > 0 ? card.outstanding / card.limit : 0,
    available: round2(Math.max(card.limit - card.outstanding, 0)),
    daysUntilDue,
    status,
    monthlyRate: round2(card.interestRate / 12),
    minimumOnlyInterest: round2((Math.max(card.outstanding - card.minDue, 0) * card.interestRate) / 12 / 100),
  };
}

export interface CardsOverview {
  owed: number;
  limit: number;
  usage: number;
  /** The earliest due date among cards that still have a minimum to pay */
  next: CreditCard | null;
}

export function cardsOverview(cards: CreditCard[]): CardsOverview {
  const owed = round2(cards.reduce((sum, c) => sum + c.outstanding, 0));
  const limit = round2(cards.reduce((sum, c) => sum + c.limit, 0));
  const next = cards.filter((c) => c.minDue > 0 && c.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  return { owed, limit, usage: limit > 0 ? owed / limit : 0, next };
}

export const usageLevel = (usage: number): UsageLevel => (usage >= USAGE_CRITICAL ? 'over' : usage >= USAGE_WARNING ? 'warning' : 'ok');
