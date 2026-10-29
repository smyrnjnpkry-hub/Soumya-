import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../defaults';
import { openingBalanceOf, parseStatement } from './parse';
import { extractPages } from './pdf';
import { buildReview } from './plan';

/*
 * End to end on the bundled sample statement (public/sample-statement.pdf, drawn by scripts/make-sample-statement.py):
 * the real PDF text extraction, then parsing, against the rows the generator wrote down.
 */
const pdf = new Uint8Array(readFileSync(new URL('../../../public/sample-statement.pdf', import.meta.url)));
const expected = JSON.parse(readFileSync(new URL('./sample-statement.expected.json', import.meta.url), 'utf8')) as {
  bank: string;
  accountLast4: string;
  period: { from: string; to: string };
  openingBalance: number;
  closingBalance: number;
  rows: { date: string; narration: string; direction: string; amount: number; balance: number }[];
};

describe('the sample statement', async () => {
  const statement = parseStatement(await extractPages(pdfjs, pdf));

  it('reads every row exactly, re-joining narrations the bank cut into pieces', () => {
    expect(
      statement.rows.map(({ date, narration, direction, amount, balance }) => ({ date, narration, direction, amount, balance })),
    ).toEqual(expected.rows);
  });

  it('agrees with its own summary and running balance', () => {
    expect(statement.checks).toEqual({ summaryMatches: true, balanceBreaks: 0 });
    expect(openingBalanceOf(statement)).toBe(expected.openingBalance);
    expect(statement.summary?.closingBalance).toBe(expected.closingBalance);
  });

  it('finds the bank, account and period', () => {
    expect([statement.bank, statement.accountLast4, statement.period]).toEqual([expected.bank, expected.accountLast4, expected.period]);
  });

  it('suggests a category for everything except payments between people', () => {
    const review = buildReview(statement.rows, { categories: DEFAULT_CATEGORIES, transactions: [], accountId: null, cash: true });
    const uncategorised = review
      .filter((r) => r.choice.endsWith(':other-expense') || r.choice.endsWith(':other-income'))
      .map((r) => r.note);
    expect(uncategorised).toEqual(['Rahul Mehta · Dinner Split', 'Priya Nair', 'Priya Nair', 'Rahul Mehta']);
    expect(review.filter((r) => r.choice === 'transfer').map((r) => r.note)).toEqual([
      'ATM withdrawal · Pune Camp',
      'ATM withdrawal · Kochi MG Road',
      'ATM withdrawal · Pune Camp',
      'Cash Deposit Self Pune Camp Branch',
    ]);
  });
});
