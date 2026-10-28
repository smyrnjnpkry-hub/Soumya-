import { addDays as addDaysFns, addMonths, differenceInCalendarDays, differenceInCalendarMonths, format, getDaysInMonth } from 'date-fns';

/**
 * All dates in the app are local calendar dates ('YYYY-MM-DD') and months are
 * 'YYYY-MM' keys. Parsing goes through `parseLocal` because `new Date('2026-10-01')`
 * is UTC midnight, which is the previous day in negative-offset timezones.
 */
export function parseLocal(iso: string): Date {
  const [y, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const toISODate = (date: Date): string => format(date, 'yyyy-MM-dd');

export const todayISO = (): string => toISODate(new Date());

export const monthKey = (iso: string): string => iso.slice(0, 7);

export const addMonthsToKey = (key: string, n: number): string => format(addMonths(parseLocal(key), n), 'yyyy-MM');

/** The `n` months ending at `key`, oldest first. */
export const lastNMonths = (key: string, n: number): string[] => Array.from({ length: n }, (_, i) => addMonthsToKey(key, i - n + 1));

export const daysInMonth = (key: string): number => getDaysInMonth(parseLocal(key));

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Inclusive first and last day of a month. */
export const monthBounds = (key: string) => ({
  start: `${key}-01`,
  end: `${key}-${pad2(daysInMonth(key))}`,
});

/** Day 1 to the same day-of-month last month (clamped), for fair month-to-date comparisons. */
export function samePeriodLastMonth(iso: string) {
  const prevKey = addMonthsToKey(monthKey(iso), -1);
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(prevKey));
  return { start: `${prevKey}-01`, end: `${prevKey}-${pad2(day)}` };
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number => differenceInCalendarDays(parseLocal(to), parseLocal(from));

export const addDays = (iso: string, n: number): string => toISODate(addDaysFns(parseLocal(iso), n));

/** Adds months, clamping to the end of shorter months (31 Jan + 1 → 28 Feb). */
export const addMonthsToDate = (iso: string, n: number): string => toISODate(addMonths(parseLocal(iso), n));

/** Whole calendar months from `from` to `to`. */
export const monthsBetween = (from: string, to: string): number => differenceInCalendarMonths(parseLocal(to), parseLocal(from));
