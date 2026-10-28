import { format } from 'date-fns';
import { daysBetween, parseLocal } from './dates';

const MINUS = '−';

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Rounds to paise, nudging by EPSILON so 1.005 → 1.01 rather than 1.00. */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * ₹ with Indian digit grouping (₹12,34,567). Paise appear only when present.
 * `compact` gives ₹15K / ₹1.5L / ₹1.3Cr; `sign` prefixes + for positive deltas.
 */
export function formatINR(amount: number, { compact = false, sign = false } = {}): string {
  const value = round2(amount);
  const abs = Math.abs(value);
  const body =
    compact && abs >= 1000 ? inrCompact.format(abs) : (Number.isInteger(abs) ? inrWhole : inrPaise).format(abs);
  if (value < 0) return MINUS + body;
  if (sign && value > 0) return `+${body}`;
  return body;
}

/** 0.183 → "18%". */
export function formatPercent(ratio: number, { sign = false } = {}): string {
  const pct = Math.round(ratio * 100);
  if (pct < 0) return `${MINUS}${Math.abs(pct)}%`;
  if (sign && pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

export function formatDate(iso: string, style: 'long' | 'short' = 'long'): string {
  return format(parseLocal(iso), style === 'long' ? 'd MMM yyyy' : 'd MMM');
}

const MONTH_PATTERNS = { long: 'MMMM yyyy', medium: 'MMM yyyy', short: 'MMM' } as const;

export function formatMonth(key: string, style: keyof typeof MONTH_PATTERNS = 'long'): string {
  return format(parseLocal(key), MONTH_PATTERNS[style]);
}

/** Section heading for a day in a transaction list. */
export function dayLabel(iso: string, today: string): string {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return format(parseLocal(iso), iso.slice(0, 4) === today.slice(0, 4) ? 'EEE, d MMM' : 'EEE, d MMM yyyy');
}
