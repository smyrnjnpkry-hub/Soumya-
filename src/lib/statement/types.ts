/** A piece of text on a PDF page, in PDF user space (points; y grows upwards). */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface StatementPage {
  items: TextItem[];
}

export type Direction = 'debit' | 'credit';

export interface StatementRow {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Narration exactly as the bank wrote it, with wrapped lines re-joined */
  narration: string;
  ref: string;
  /** Always positive; `direction` says which way the money moved */
  amount: number;
  direction: Direction;
  /** Closing balance after this row, when the statement has a balance column */
  balance: number | null;
}

export interface StatementSummary {
  openingBalance?: number;
  closingBalance?: number;
  debitCount?: number;
  creditCount?: number;
  debitTotal?: number;
  creditTotal?: number;
}

export interface ParsedStatement {
  bank: string | null;
  /** Last four digits only — the full number is never kept */
  accountLast4: string | null;
  period: { from: string | null; to: string | null };
  rows: StatementRow[];
  summary: StatementSummary | null;
  checks: {
    /** Rows agree with the bank's own summary (null when the PDF has none) */
    summaryMatches: boolean | null;
    /** Rows whose closing balance doesn't follow from the previous one */
    balanceBreaks: number;
  };
}

/** Stands in for the statement's account in imported rows until that account exists. */
export const STATEMENT_ACCOUNT = '__statement__';

export class StatementError extends Error {
  constructor(
    message: string,
    readonly code: 'no-text' | 'no-table' | 'no-rows' | 'password' | 'bad-password' | 'unreadable',
  ) {
    super(message);
    this.name = 'StatementError';
  }
}
