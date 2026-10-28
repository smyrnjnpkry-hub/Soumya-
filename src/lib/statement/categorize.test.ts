import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { describeNarration, learnCategories, suggestCategory } from './categorize';

// Narration formats as HDFC, SBI and ICICI print them; all names, numbers and IDs are made up.
const expense = (category: string) => ({ type: 'expense', category });
const income = (category: string) => ({ type: 'income', category });

describe('suggestCategory — money out', () => {
  it.each([
    ['UPI-ZOMATO LTD-ZOMATO.RZP@HDFCBANK-HDFC0MERUPI-612345678901-PAY VIA RAZORPAY', 'food'],
    ['UPI-SWIGGY-SWIGGY.STORES@AXISBANK-UTIB0000001-612345678902-UPI', 'food'],
    ['POS 512345XXXXXX7788 612345 14JUL26 19:42:10 PUNE COMMUNITY CANTEEN', 'food'],
    ['UPI-AMAZON PAY GROCERIES-AMAZONPAYGROCERY@APL-UTIB0000001-612345678901-UPI SEND MONEY', 'groceries'],
    ['POS 512345XXXXXX7788 BIGBASKET BANGALORE', 'groceries'],
    ['UPI-UBER INDIA-UBER.INDIA@HDFCBANK-HDFC0MERUPI-612345678903-UPI', 'transport'],
    ['UPI-SRI SAI PETROLEUM-PAYTMQR1234@PTYS-YESB0PTMUPI-612345678904-UPI SEND MONEY', 'transport'],
    ['FUEL SURCHG 512345******7788 DT 04/07/26', 'transport'],
    ['UPI-MAKEMYTRIP-MAKEMYTRIP.FLIGHTS@HDFCBANK-HDFC0MERUPI-612345678905-UPI', 'travel'],
    ['UPI-AIRTEL PREPAID-AIRTEL.RECHARGE@AIRTEL-AIRP0000001-612345678906-UPI', 'bills'],
    ['IB BILLPAY DR-HDFCCC-512345XXXXXX7788', 'bills'],
    ['CC 000512345XXXXXX1234 AUTOPAY SI-MAD', 'bills'],
    ['EMI 123456789 CHQ S1234567890101 0426123', 'emi'],
    ['ACH D- TP ACH BAJAJ FINANCE-123456789', 'emi'],
    ['ME DC SI 512345XXXXXX7788 NETFLIX COM', 'entertainment'],
    ['UPI-NETFLIX-NETFLIX.SUB@HDFCBANK-HDFC0MERUPI-612345678911-AUTOPAY', 'entertainment'],
    ['UPI-CITY COLLEGE-CITYCOLLEGE.RZP@HDFCBANK-HDFC0MERUPI-612345678907-TUITION FEE', 'education'],
    ['UPI-APOLLO PHARMACY-APOLLOPHARMACY@YBL-YESB0YBLUPI-612345678908-UPI', 'health'],
    ['POS 512345XXXXXX7788 612345 21JUL26 18:05:10 PUNE LIFESTYLE STORES', 'shopping'],
    ['DC INTL POS TXN MARKUP+ST 123456-EPR123456', 'other-expense'],
    ['UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-UPI SEND MONEY', 'other-expense'],
    ['TO TRANSFER-UPI/DR/612345678901/BIGBASKET/YESB/bigbasket@ybl/UPI', 'groceries'],
  ])('%s → %s', (narration, category) => {
    expect(suggestCategory(narration, 'debit')).toEqual(expense(category));
  });

  it('treats ATM withdrawals as a transfer to cash, not spending', () => {
    expect(suggestCategory('NWD-512345XXXXXX7788-00123456-NASHIK', 'debit')).toEqual({ type: 'transfer', category: '' });
    expect(suggestCategory('ATW-512345XXXXXX7788-S1AW0123-PUNE', 'debit')).toEqual({ type: 'transfer', category: '' });
  });

  it('matches whole words only, so names do not trigger categories', () => {
    expect(suggestCategory('UPI-PARENT TEACHER ASSOC-PTA@OKSBI-SBIN0001234-612345678909-UPI', 'debit')).toEqual(expense('other-expense'));
    expect(suggestCategory('UPI-OLAF MENON-OLAF@OKAXIS-UTIB0000001-612345678910-UPI', 'debit')).toEqual(expense('other-expense'));
  });

  it('still recognises a merchant whose name the statement split with a space', () => {
    expect(suggestCategory('POS 512345XXXXXX7788 BIGBAS KET BLR', 'debit')).toEqual(expense('groceries'));
  });
});

describe('suggestCategory — money in', () => {
  it.each([
    ['NEFT CR-ICIC0000104-ACME LABS PVT LTD-ASHA VERMA-N0922612345 SALARY FOR MAR 2026', 'salary'],
    ['CRV POS 512345******7788 AMAZON IND', 'refunds'],
    ['REV-UPI-612345678901-ZOMATO@HDFC-612345678902-UPI', 'refunds'],
    ['UPIRET-612345678901- 612345678902', 'refunds'],
    ['UPI-SWIGGY-SWIGGY.STORES@AXISBANK-UTIB0000001-612345678902-UPI', 'refunds'],
    ['50100012345678:Int.Pd:01-04-2026 to 30-06-2026', 'interest'],
    ['UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-PAYMENT FROM PHONE', 'other-income'],
  ])('%s → %s', (narration, category) => {
    expect(suggestCategory(narration, 'credit')).toEqual(income(category));
  });

  it('treats a cash deposit as a transfer from cash', () => {
    expect(suggestCategory('CASH DEPOSIT BY SELF', 'credit')).toEqual({ type: 'transfer', category: '' });
  });
});

describe('learned categories', () => {
  const tx = (note: string, type: Transaction['type'], category: string, date: string): Transaction => ({
    id: `${note}-${date}`,
    type,
    amount: 100,
    date,
    category,
    account: 'bank',
    note,
  });

  it('remembers the most recent category used for a description', () => {
    const learned = learnCategories([
      tx('Zomato Ltd', 'expense', 'food', '2026-01-02'),
      tx('Zomato Ltd', 'expense', 'entertainment', '2026-03-02'),
      tx('Ravi Kumar', 'expense', 'rent', '2026-02-01'),
      tx('Cash', 'transfer', '', '2026-02-01'),
    ]);
    const zomato = 'UPI-ZOMATO LTD-ZOMATO.RZP@HDFCBANK-HDFC0MERUPI-612345678901-PAY VIA RAZORPAY';
    expect(suggestCategory(zomato, 'debit', learned)).toEqual(expense('entertainment'));
    expect(suggestCategory('UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-UPI SEND MONEY', 'debit', learned)).toEqual(
      expense('rent'),
    );
  });

  it('only applies a learned category in the same direction', () => {
    const learned = learnCategories([tx('Ravi Kumar', 'expense', 'rent', '2026-02-01')]);
    const fromRavi = 'UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-PAYMENT FROM PHONE';
    expect(suggestCategory(fromRavi, 'credit', learned)).toEqual(income('other-income'));
  });
});

describe('describeNarration', () => {
  it.each([
    ['UPI-ZOMATO LTD-ZOMATO.RZP@HDFCBANK-HDFC0MERUPI-612345678901-PAY VIA RAZORPAY', 'Zomato Ltd'],
    ['UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-UPI SEND MONEY', 'Ravi Kumar'],
    ['UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-GYM FEES', 'Ravi Kumar · Gym Fees'],
    ['UPI-XXXXXXXXXXX1234-BKID0001234-612345678901-UPI SEND MONEY', 'UPI transfer ••1234'],
    // Remarks the bank cut short, a remark that repeats the payee, a UPI ID containing a hyphen
    ['UPI-RAVI KUMAR-RAVI.KUMAR@OKAXIS-SBIN0001234-612345678920-UPI SEND MO', 'Ravi Kumar'],
    ['UPI-SWIGGY-SWIGGY@ICICI-ICIC0000002-612345678901-COLLECT REQUEST FR', 'Swiggy'],
    ['UPI-CLEARTRIP PVT LTD-CLEARTRIP.RZP@HDFCBANK-HDFC0MERUPI-612345678901-CLEARTRIPPVTLTD', 'Cleartrip Pvt Ltd'],
    ['UPI-ASHA VERMA-ASHAVERMA99-2@OKSBI-SBIN0001234-612345678901-UPI', 'Asha Verma'],
    ['TO TRANSFER-UPI/DR/612345678901/BIGBASKET/YESB/bigbasket@ybl/UPI', 'Bigbasket'],
    ['UPI/P2M/612345678901/BIGBASKET/UPI/YES BANK', 'Bigbasket'],
    ['NEFT CR-ICIC0000104-ACME LABS PVT LTD-ASHA VERMA-N0922612345 SALARY FOR MAR 2026', 'Acme Labs Pvt Ltd · Salary for Mar 2026'],
    ['IMPS-612345678901-RAVI KUMAR-SBIN-XXXXXXXX1234-IMPS TRANSACTION', 'Ravi Kumar'],
    ['POS 512345XXXXXX7788 612345 14JUL26 19:42:10 PUNE CAFE COFFEE DAY', 'Pune Cafe Coffee Day'],
    ['POS 512345XXXXXX7788 BIGBASKET BANGALORE', 'Bigbasket Bangalore'],
    ['CRV POS 512345******7788 AMAZON IND', 'Amazon Ind'],
    ['ME DC SI 512345XXXXXX7788 AMAZON INDIA CYBS SI', 'Amazon India'],
    ['NWD-512345XXXXXX7788-00123456-NASHIK', 'ATM withdrawal · Nashik'],
    ['NWD-512345XXXXXX7788-00123456-PUNE MG ROAD', 'ATM withdrawal · Pune MG Road'],
    ['EMI 123456789 CHQ S1234567890101 0426123', 'Loan EMI'],
    ['ACH D- TP ACH ICICI BANK-123456789', 'Auto-debit · ICICI Bank'],
    ['CC 000512345XXXXXX1234 AUTOPAY SI-MAD', 'Credit card bill ••1234'],
    ['FUEL SURCHG 512345******7788 DT 04/07/26', 'Fuel surcharge'],
    ['DC INTL POS TXN MARKUP+ST 123456-EPR123456', 'Forex markup charge'],
    ['50100012345678:Int.Pd:01-04-2026 to 30-06-2026', 'Interest'],
    ['UPIRET-612345678901- 612345678902', 'UPI return'],
    ['BIL/ONL/000123456789/ELECTRICITY/BESCOM', 'Electricity Bescom'],
  ])('%s → %s', (narration, description) => {
    expect(describeNarration(narration)).toBe(description);
  });

  it('keeps descriptions short', () => {
    expect(describeNarration('X'.repeat(10) + ' ' + 'LONG MERCHANT NAME '.repeat(10)).length).toBeLessThanOrEqual(60);
  });
});
