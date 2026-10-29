import { round2 } from '../format';
import type { Transaction } from '../types';
import type { Direction } from './types';

type Flow = 'in' | 'out';

const key = (date: string, amount: number, flow: Flow) => `${date}|${round2(amount)}|${flow}`;

/** Which way a saved transaction moved money for this account, if it touched it at all. */
function flowFor(t: Transaction, accountId: string): Flow | null {
  if (t.account === accountId) return t.type === 'income' ? 'in' : 'out';
  return t.type === 'transfer' && t.toAccount === accountId ? 'in' : null;
}

/**
 * Marks statement rows that are already recorded for the account: same date, amount and direction. Each saved
 * transaction accounts for one row only, so two identical ₹10 payments on a day with one recorded leave one new.
 */
export function markDuplicates(
  rows: { date: string; amount: number; direction: Direction }[],
  existing: Transaction[],
  accountId: string,
): boolean[] {
  const counts = new Map<string, number>();
  for (const t of existing) {
    const flow = flowFor(t, accountId);
    if (!flow) continue;
    const k = key(t.date, t.amount, flow);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return rows.map((row) => {
    const k = key(row.date, row.amount, row.direction === 'credit' ? 'in' : 'out');
    const left = counts.get(k) ?? 0;
    if (left) counts.set(k, left - 1);
    return left > 0;
  });
}
