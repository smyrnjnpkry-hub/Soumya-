import type { Category, Transaction, TransactionType } from '../types';
import { describeNarration, learnCategories, suggestCategory } from './categorize';
import { markDuplicates } from './match';
import { STATEMENT_ACCOUNT, type Direction, type ParsedStatement, type StatementRow } from './types';

/** How a row will be saved: an expense or income category, or a transfer with the Cash account. */
export type Choice = `expense:${string}` | `income:${string}` | 'transfer';

export interface ReviewRow {
  id: number;
  date: string;
  amount: number;
  direction: Direction;
  narration: string;
  note: string;
  choice: Choice;
  /** Already saved for this account (same date, amount and direction) */
  duplicate: boolean;
  selected: boolean;
  /** The category was picked by hand */
  touched: boolean;
}

interface ReviewContext {
  categories: Category[];
  /** Saved transactions: for duplicates and for categories chosen before */
  transactions: Transaction[];
  /** The account being imported into; null for a new one */
  accountId: string | null;
  /** Whether there's a Cash account for ATM withdrawals and deposits */
  cash: boolean;
}

/** A category of the right type that still exists, falling back to "Other". */
function categoryChoice(type: 'expense' | 'income', id: string, categories: Category[]): Choice {
  const ofType = categories.filter((c) => c.type === type);
  const category = ofType.find((c) => c.id === id) ?? ofType.find((c) => c.id === `other-${type}`) ?? ofType.at(-1);
  return `${type}:${category?.id ?? ''}`;
}

export function withDuplicates(rows: ReviewRow[], transactions: Transaction[], accountId: string | null): ReviewRow[] {
  const duplicates = accountId ? markDuplicates(rows, transactions, accountId) : rows.map(() => false);
  return rows.map((row, i) => ({ ...row, duplicate: duplicates[i], selected: !duplicates[i] }));
}

/** Statement rows ready to review: a description, a suggested category, and duplicates unticked. */
export function buildReview(rows: StatementRow[], { categories, transactions, accountId, cash }: ReviewContext): ReviewRow[] {
  const learned = learnCategories(transactions);
  const review = rows.map((row, id): ReviewRow => {
    const suggestion = suggestCategory(row.narration, row.direction, learned);
    const type = row.direction === 'debit' ? 'expense' : 'income';
    const choice = suggestion.type === 'transfer' && cash ? 'transfer' : categoryChoice(type, suggestion.category, categories);
    return {
      id,
      date: row.date,
      amount: row.amount,
      direction: row.direction,
      narration: row.narration,
      note: describeNarration(row.narration),
      choice,
      duplicate: false,
      selected: true,
      touched: false,
    };
  });
  return withDuplicates(review, transactions, accountId);
}

/** The ticked rows as transactions on the statement account (STATEMENT_ACCOUNT until it exists). */
export function planTransactions(rows: ReviewRow[], cashAccountId: string | null): Omit<Transaction, 'id'>[] {
  return rows
    .filter((row) => row.selected)
    .map((row) => {
      const base = { amount: row.amount, date: row.date, note: row.note };
      if (row.choice === 'transfer' && cashAccountId) {
        const [from, to] = row.direction === 'debit' ? [STATEMENT_ACCOUNT, cashAccountId] : [cashAccountId, STATEMENT_ACCOUNT];
        return { type: 'transfer' as const, ...base, category: '', account: from, toAccount: to };
      }
      const [type, category] = row.choice === 'transfer' ? [row.direction === 'debit' ? 'expense' : 'income', ''] : row.choice.split(':');
      return { type: type as TransactionType, ...base, category, account: STATEMENT_ACCOUNT };
    });
}

/**
 * Sets a row's category by hand and ticks it. Other rows with the same description and direction follow along — pay
 * the same person ten times and you categorise them once — unless they were set by hand too.
 */
export function applyChoice(rows: ReviewRow[], id: number, choice: Choice): { rows: ReviewRow[]; alsoChanged: number } {
  const picked = rows.find((row) => row.id === id);
  if (!picked) return { rows, alsoChanged: 0 };
  let alsoChanged = 0;
  const next = rows.map((row) => {
    if (row.id === id) return { ...row, choice, touched: true, selected: true };
    if (row.touched || row.note !== picked.note || row.direction !== picked.direction || row.choice === choice) return row;
    alsoChanged++;
    return { ...row, choice };
  });
  return { rows: next, alsoChanged };
}

/** "HDFC Bank ••5678" */
export function statementAccountName({ bank, accountLast4 }: Pick<ParsedStatement, 'bank' | 'accountLast4'>): string {
  return accountLast4 ? `${bank ?? 'Bank account'} ••${accountLast4}` : (bank ?? 'Bank account');
}
