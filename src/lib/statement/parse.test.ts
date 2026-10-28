import { describe, expect, it } from 'vitest';
import { openingBalanceOf, parseStatement } from './parse';
import type { StatementPage, TextItem } from './types';

/**
 * Fixtures reproduce the geometry of a real HDFC Bank account statement
 * (column positions in points, amounts right-aligned) with made-up people and numbers.
 */
const item = (text: string, x: number, y: number, width = text.length * 4.4): TextItem => ({ text, x, y, width });
const amount = (text: string, right: number, y: number): TextItem => item(text, right - text.length * 4, y, text.length * 4);

const header = (y: number) => [
  item('Date', 39.9, y, 16),
  item('Narration', 144.2, y, 34.2),
  item('Chq./Ref.No.', 283.5, y, 44.7),
  item('Value Dt', 361.5, y, 30.4),
  item('Withdrawal Amt.', 405.3, y, 60.4),
  item('Deposit Amt.', 491.1, y, 44.9),
  item('Closing Balance', 564.3, y, 54.9),
];

/** The customer block printed at the top of every page — must never leak into rows. */
const pageTop = (pageNo: number) => [
  item(`Page No .: ${pageNo}`, 290, 820),
  item('MR', 34, 760, 10),
  item('ASHA VERMA', 60, 760),
  item('Account Branch : MG ROAD', 340, 770),
  item('12 LAKE VIEW ROAD', 34, 745),
  item('Account No', 340, 690, 40),
  item(': 50100012345678', 400, 690),
  item('A/C Open Date : 05/06/2015', 340, 680),
  item('From : 01/04/2026', 34, 620.2, 64),
  item('To : 30/04/2026', 154, 620.2, 55.6),
  item('Statement of account', 340.2, 619.9, 101.3),
];

const footer = () => [
  item('HDFC BANK LIMITED', 28.3, 50.1, 96),
  item('*Closing balance includes funds earmarked for hold and uncleared funds', 28.3, 40.8, 233.5),
];

interface RowSpec {
  date: string;
  narration: string;
  ref?: string;
  withdrawal?: string;
  deposit?: string;
  balance: string;
}

const row = (y: number, r: RowSpec): TextItem[] => [
  item(r.date, 33.7, y, 28.4),
  item(r.narration, 72, y),
  item(r.ref ?? '0000000000000000', 288.6, y, 64),
  item(r.date, 362.5, y, 28.4),
  ...(r.withdrawal ? [amount(r.withdrawal, 470.2, y)] : []),
  ...(r.deposit ? [amount(r.deposit, 548.2, y)] : []),
  amount(r.balance, 626.7, y),
];

const line = (text: string, y: number, x = 72): TextItem[] => [item(text, x, y)];

// Opening balance 10,000.00. HDFC stores narrations in 40-character pieces cut anywhere (even mid-word), prints each
// piece on its own line at x 72 — or 74 when the piece starts with a space — and wraps a piece too wide for the column at a
// space onto a line hanging at x 68.
const page1: StatementPage = {
  items: [
    ...pageTop(1),
    ...header(602.1),
    ...row(584.5, {
      date: '02/04/26',
      narration: 'NEFT CR-ICIC0000104-ACME LABS PVT LTD-AS',
      deposit: '50,000.00',
      balance: '60,000.00',
      ref: 'N092261234567890',
    }),
    ...line('HA VERMA-N0922612345 SALARY FOR MAR 2026', 567.3),
    ...line('ARREARS', 550.1, 74),
    ...row(532.9, { date: '03/04/26', narration: 'UPI-ZOMATO', withdrawal: '450.50', balance: '59,549.50' }),
    ...line('LTD-ZOMATO.RZP@HDFCBANK-HDFC0', 515.7, 68),
    ...line('MERUPI-612345678901-PAY VIA RAZORPAY', 498.5),
    ...row(481.3, {
      date: '05/04/26',
      narration: 'EMI 123456789 CHQ S1234567890101 0426123',
      withdrawal: '4,990.00',
      balance: '54,559.50',
    }),
    // The PDF draws this amount twice in the same spot (seen in real statements)
    amount('4,990.00', 470.2, 481.3),
    ...row(464.1, { date: '06/04/26', narration: 'UPI-RAVI KUMAR', withdrawal: '1,200.00', balance: '53,359.50' }),
    ...line('SHARMA-RAVI.SHARMA@OKAXIS', 446.9, 68),
    ...footer(),
  ],
};

const page2: StatementPage = {
  items: [
    ...pageTop(2),
    // The rest of the 06/04 row from page 1, at the top of a page with no header row
    ...line('-SBIN0001234-612345678920-UPI SEND MONEY', 604.1),
    ...row(586.9, { date: '10/04/26', narration: 'CRV POS 512345******7788', deposit: '569.05', balance: '53,928.55' }),
    item('AMAZON IND', 183.2, 586.9),
    ...row(569.7, { date: '18/04/26', narration: 'NWD-512345XXXXXX7788-00123456-NASHIK', withdrawal: '2,000.00', balance: '51,928.55' }),
    ...row(552.5, { date: '21/04/26', narration: 'UPI-AMAZON PAY', withdrawal: '1,234.00', balance: '50,694.55' }),
    ...line('GROCERIES-AMAZONPAYGROCER', 535.3, 68),
    // A 39-character piece: the 40th character was a space that the PDF dropped
    ...line('Y@APL-UTIB0000001-612345678901-UPI SEND', 518.1),
    ...line('MONEY', 500.9),
    // The same, where the word before the dropped space comes straight after a reference number
    ...row(483.7, { date: '23/04/26', narration: 'UPI-AMAZON PAY', withdrawal: '100.00', balance: '50,594.55' }),
    ...line('GROCERIES-AMAZONPAYGROCER', 466.5, 68),
    ...line('Y@HDFCBANK-HDFC0MERUPI-612345678902-UPI', 449.3),
    ...line('SEND MONEY', 432.1),
    // A 39-character piece cut inside an IFSC code: glued back together
    ...row(414.9, { date: '25/04/26', narration: 'UPI-KAVYA', withdrawal: '50.00', balance: '50,544.55' }),
    ...line('SRINIVASAN-KAVYAS199@OKAXIS-U', 397.7, 68),
    ...line('TIB0000001-612345678903-UPI SEND MONEY', 380.5),
    ...line('STATEMENT SUMMARY :-', 294.6, 68),
    item('Opening Balance', 132.3, 284.2, 58.5),
    item('Dr Count', 289.8, 284.2, 32.7),
    item('Cr Count', 360.7, 284.2, 32.7),
    item('Debits', 424.9, 284.2, 21.8),
    item('Credits', 501.1, 284.2, 25.3),
    item('Closing Bal', 572.1, 284.2, 39.3),
    item('10,000.00', 145.6, 273.1, 36),
    item('7', 304, 273.1, 4),
    item('2', 375, 273.1, 4),
    item('10,024.50', 418, 273.1, 36),
    item('50,569.05', 495, 273.1, 36),
    item('50,544.55', 578, 273.1, 36),
    item('Generated On: 30-Apr-2026 21:52', 83, 240, 140),
    ...footer(),
  ],
};

describe('parseStatement — HDFC layout', () => {
  const parsed = parseStatement([page1, page2]);

  it('finds every transaction, in order, with ISO dates and amounts', () => {
    expect(parsed.rows.map((r) => [r.date, r.direction, r.amount, r.balance])).toEqual([
      ['2026-04-02', 'credit', 50000, 60000],
      ['2026-04-03', 'debit', 450.5, 59549.5],
      ['2026-04-05', 'debit', 4990, 54559.5],
      ['2026-04-06', 'debit', 1200, 53359.5],
      ['2026-04-10', 'credit', 569.05, 53928.55],
      ['2026-04-18', 'debit', 2000, 51928.55],
      ['2026-04-21', 'debit', 1234, 50694.55],
      ['2026-04-23', 'debit', 100, 50594.55],
      ['2026-04-25', 'debit', 50, 50544.55],
    ]);
  });

  it('re-joins wrapped narrations: pieces cut mid-word are glued, word breaks keep their space', () => {
    expect(parsed.rows[0].narration).toBe('NEFT CR-ICIC0000104-ACME LABS PVT LTD-ASHA VERMA-N0922612345 SALARY FOR MAR 2026 ARREARS');
    expect(parsed.rows[1].narration).toBe('UPI-ZOMATO LTD-ZOMATO.RZP@HDFCBANK-HDFC0MERUPI-612345678901-PAY VIA RAZORPAY');
    expect(parsed.rows[6].narration).toBe('UPI-AMAZON PAY GROCERIES-AMAZONPAYGROCERY@APL-UTIB0000001-612345678901-UPI SEND MONEY');
    expect(parsed.rows[7].narration).toBe('UPI-AMAZON PAY GROCERIES-AMAZONPAYGROCERY@HDFCBANK-HDFC0MERUPI-612345678902-UPI SEND MONEY');
    expect(parsed.rows[8].narration).toBe('UPI-KAVYA SRINIVASAN-KAVYAS199@OKAXIS-UTIB0000001-612345678903-UPI SEND MONEY');
  });

  it('joins pieces of text on the same line', () => {
    expect(parsed.rows[4].narration).toBe('CRV POS 512345******7788 AMAZON IND');
  });

  it('continues a narration across a page break and ignores page headers and footers', () => {
    expect(parsed.rows[3].narration).toBe('UPI-RAVI KUMAR SHARMA-RAVI.SHARMA@OKAXIS-SBIN0001234-612345678920-UPI SEND MONEY');
    expect(parsed.rows.some((r) => /ASHA VERMA|HDFC BANK LIMITED|Closing balance includes/.test(r.narration.replace(/ACME.*/, '')))).toBe(
      false,
    );
  });

  it('keeps the reference number', () => {
    expect(parsed.rows[0].ref).toBe('N092261234567890');
  });

  it('reads the statement summary and confirms the rows add up to it', () => {
    expect(parsed.summary).toEqual({
      openingBalance: 10000,
      debitCount: 7,
      creditCount: 2,
      debitTotal: 10024.5,
      creditTotal: 50569.05,
      closingBalance: 50544.55,
    });
    expect(parsed.checks).toEqual({ summaryMatches: true, balanceBreaks: 0 });
  });

  it('detects the bank, the last four account digits and the period', () => {
    expect(parsed.bank).toBe('HDFC Bank');
    expect(parsed.accountLast4).toBe('5678');
    expect(parsed.period).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('derives the opening balance from the summary, or from the first row without one', () => {
    expect(openingBalanceOf(parsed)).toBe(10000);
    expect(openingBalanceOf({ ...parsed, summary: null })).toBe(10000); // 60,000 after a 50,000 credit
  });
});

describe('parseStatement — consistency checks', () => {
  it('flags a summary that does not match the rows', () => {
    const tampered: StatementPage = {
      items: page2.items.map((i) => (i.text === '10,024.50' ? { ...i, text: '10,025.50' } : i)),
    };
    expect(parseStatement([page1, tampered]).checks.summaryMatches).toBe(false);
  });

  it('counts rows whose balance does not follow from the previous one', () => {
    const broken: StatementPage = {
      items: page1.items.map((i) => (i.text === '59,549.50' ? { ...i, text: '59,000.00' } : i)),
    };
    // 03/04 no longer follows 02/04, and 05/04 no longer follows 03/04
    expect(parseStatement([broken, page2]).checks.balanceBreaks).toBe(2);
  });

  it('reports a missing summary as unknown rather than matching', () => {
    const noSummary: StatementPage = { items: page2.items.filter((i) => i.y > 300 || i.y < 60) };
    expect(parseStatement([page1, noSummary]).checks.summaryMatches).toBeNull();
  });
});

describe('parseStatement — other banks and failures', () => {
  it('reads a Debit/Credit layout with dd-mm-yyyy dates and Indian digit grouping', () => {
    const sbi: StatementPage = {
      items: [
        item('STATE BANK OF INDIA', 200, 800),
        item('Txn Date', 30, 600, 34),
        item('Description', 120, 600, 46),
        item('Ref No./Cheque No.', 260, 600, 74),
        item('Debit', 400, 600, 22),
        item('Credit', 470, 600, 26),
        item('Balance', 545, 600, 32),
        item('01-04-2026', 30, 580, 42),
        item('BY TRANSFER-NEFT*HDFC*SALARY', 80, 580),
        amount('1,25,000.00', 500, 580),
        amount('1,35,000.00', 580, 580),
        item('03-04-2026', 30, 560, 42),
        item('TO TRANSFER-UPI/DR/BIGBASKET', 80, 560),
        amount('2,345.00', 425, 560),
        amount('1,32,655.00', 580, 560),
      ],
    };
    const parsed = parseStatement([sbi]);
    expect(parsed.bank).toBe('State Bank of India');
    expect(parsed.rows.map((r) => [r.date, r.direction, r.amount, r.balance])).toEqual([
      ['2026-04-01', 'credit', 125000, 135000],
      ['2026-04-03', 'debit', 2345, 132655],
    ]);
  });

  it('reads a single Amount column, taking the direction from Dr/Cr marks or the balance', () => {
    const kotak: StatementPage = {
      items: [
        item('KOTAK MAHINDRA BANK', 200, 800),
        item('Opening Balance: 5,000.00', 40, 640),
        item('Date', 40, 620, 17.6),
        item('Description', 110, 620, 48.4),
        item('Chq/Ref No', 300, 620, 44),
        item('Amount', 420, 620, 26.4),
        item('Dr / Cr', 480, 620, 30.8),
        item('Balance', 540, 620, 30.8),
        item('01 Apr 2026', 40, 600, 48.4),
        item('UPI/SWIGGY/123', 110, 600),
        amount('250.00', 460, 600),
        item('DR', 485, 600, 8.8),
        amount('4,750.00', 590, 600),
        item('02 Apr 2026', 40, 585, 48.4),
        item('NEFT/SALARY', 110, 585),
        amount('1,000.00', 460, 585),
        item('CR', 485, 585, 8.8),
        amount('5,750.00', 590, 585),
        item('03 Apr 2026', 40, 570, 48.4),
        item('ATM WDL', 110, 570),
        amount('2,200.00 Dr', 460, 570),
        amount('3,550.00', 590, 570),
        item('04 Apr 2026', 40, 555, 48.4),
        item('IMPS/REFUND', 110, 555),
        amount('120.00', 460, 555),
        amount('3,670.00', 590, 555),
        item('Closing Balance: 3,670.00', 40, 520),
      ],
    };
    const parsed = parseStatement([kotak]);
    expect(parsed.bank).toBe('Kotak Mahindra Bank');
    expect(parsed.rows.map((r) => [r.date, r.direction, r.amount, r.balance])).toEqual([
      ['2026-04-01', 'debit', 250, 4750],
      ['2026-04-02', 'credit', 1000, 5750],
      ['2026-04-03', 'debit', 2200, 3550],
      ['2026-04-04', 'credit', 120, 3670],
    ]);
    expect(parsed.summary).toEqual({ openingBalance: 5000, closingBalance: 3670 });
    expect(parsed.checks).toEqual({ summaryMatches: true, balanceBreaks: 0 });
  });

  it('names a bank it does not know from the heading line', () => {
    const page: StatementPage = {
      items: [
        item('KARUR VYSYA BANK LTD', 200, 800),
        item('Date', 40, 620, 17.6),
        item('Particulars', 110, 620, 48.4),
        item('Withdrawals', 400, 620, 48.4),
        item('Deposits', 470, 620, 35.2),
        item('Balance', 540, 620, 30.8),
        item('01-04-2026', 40, 600, 42),
        item('UPI/DR/612345678901/BIGBASKET', 110, 600),
        amount('500.00', 450, 600),
        amount('9,500.00', 590, 600),
      ],
    };
    expect(parseStatement([page]).bank).toBe('Karur Vysya Bank');
  });

  it('explains when a PDF has no text (e.g. a scanned image)', () => {
    expect(() => parseStatement([{ items: [] }])).toThrow(/no text/i);
  });

  it('explains when there is no transaction table', () => {
    expect(() => parseStatement([{ items: [item('Dear customer, thank you for banking with us', 40, 700)] }])).toThrow(
      /transaction table/i,
    );
  });
});
