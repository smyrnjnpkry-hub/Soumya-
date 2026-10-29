import { describe, expect, it } from 'vitest';
import {
  cardActivity,
  cardFor,
  cardLabel,
  cardsOverview,
  cardSummary,
  checkCardForm,
  isCardPayment,
  linkCandidates,
  paymentCandidates,
  unmatchedCardPayments,
  usageLevel,
} from './cards';
import type { CreditCard, Transaction } from './types';

const hdfc: CreditCard = {
  id: 'hdfc',
  name: 'HDFC Millennia',
  limit: 150000,
  outstanding: 23480,
  minDue: 1180,
  dueDate: '2026-11-03',
  interestRate: 42,
  last4: '4417',
};
const sbi: CreditCard = {
  id: 'sbi',
  name: 'SBI SimplyCLICK',
  limit: 80000,
  outstanding: 6240,
  minDue: 320,
  dueDate: '2026-11-18',
  interestRate: 42,
  last4: '9023',
};
const both = [hdfc, sbi];

let seq = 0;
const tx = (note: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  type: 'expense',
  amount: 1000,
  date: '2026-10-03',
  category: 'bills',
  account: 'bank',
  note,
  ...extra,
});

describe('cardFor', () => {
  it('follows a link made by hand, even when the note mentions another card', () => {
    expect(cardFor(tx('Credit card bill ••4417', { creditCardId: 'sbi' }), both)).toBe(sbi);
  });

  it('leaves a transaction marked "not a card payment" alone', () => {
    expect(cardFor(tx('Credit card bill ••4417', { creditCardId: null }), both)).toBeNull();
  });

  it('ignores a link to a card that no longer exists and matches automatically instead', () => {
    expect(cardFor(tx('Credit card bill ••4417', { creditCardId: 'gone' }), both)).toBe(hdfc);
  });

  it.each([
    'Credit card bill ••4417',
    'POS 512345XXXXXX4417 AMAZON',
    'Paid **4417',
    'Card ending 4417',
    'card ending in 4417',
    'Card 4417 bill',
  ])('matches the last 4 written as a masked card number: %s', (note) => {
    expect(cardFor(tx(note), both)).toBe(hdfc);
  });

  it('does not match a bare 4-digit number', () => {
    const ending2026 = { ...sbi, last4: '2026' };
    expect(cardFor(tx('Salary for Mar 2026', { type: 'income' }), [hdfc, ending2026])).toBeNull();
  });

  it('matches the card’s full name, ignoring case', () => {
    expect(cardFor(tx('sbi simplyclick payment'), both)).toBe(sbi);
  });

  it('does not match on a short name like a bank’s initials', () => {
    const short = { ...hdfc, name: 'HDFC', last4: undefined };
    expect(cardFor(tx('HDFC Savings interest', { type: 'income' }), [short, sbi])).toBeNull();
  });

  it('gives a generic card payment to the only card, but not to one of several', () => {
    expect(cardFor(tx('Credit card payment'), [hdfc])).toBe(hdfc);
    expect(cardFor(tx('Credit card payment'), both)).toBeNull();
  });

  it('never treats a loan EMI as a card payment', () => {
    expect(cardFor(tx('Car loan EMI', { category: 'emi' }), [hdfc])).toBeNull();
  });

  it('matches nothing when two cards share the last 4', () => {
    const twin = { ...sbi, last4: '4417' };
    expect(cardFor(tx('Credit card bill ••4417'), [hdfc, twin])).toBeNull();
  });
});

describe('isCardPayment', () => {
  it.each([
    ['Credit card bill ••4417', true],
    ['CC payment', true],
    ['cc autopay', true],
    ['Card bill', true],
    ['Card dues', true],
    ['Card payment HDFC', true],
    ['Car loan EMI', false],
    ['Recharge card', false],
    ['Business card printing', false],
  ])('%s → %s', (note, expected) => {
    expect(isCardPayment(note)).toBe(expected);
  });
});

describe('cardActivity', () => {
  it('lists the card’s transactions newest first, saying how each was matched', () => {
    const july = tx('Credit card bill ••4417', { date: '2026-07-03' });
    const sept = tx('Electricity', { date: '2026-09-08', creditCardId: 'hdfc' });
    const aug = tx('HDFC Millennia bill', { date: '2026-08-03' });
    const others = [tx('SBI SimplyCLICK payment'), tx('Rent'), tx('Credit card bill ••4417', { creditCardId: null })];
    expect(cardActivity(hdfc, both, [july, ...others, sept, aug]).map((a) => [a.transaction.id, a.match])).toEqual([
      [sept.id, 'linked'],
      [aug.id, 'matched'],
      [july.id, 'matched'],
    ]);
  });
});

describe('unmatchedCardPayments', () => {
  const generic = tx('Credit card payment', { date: '2026-10-26' });
  const older = tx('CC payment', { date: '2026-09-26' });
  const claimed = tx('Credit card bill ••4417');
  const dismissed = tx('Card bill', { creditCardId: null });

  it('lists card payments no card claims, newest first', () => {
    expect(unmatchedCardPayments(both, [older, claimed, generic, dismissed, tx('Rent')]).map((t) => t.id)).toEqual([generic.id, older.id]);
  });

  it('has nothing to ask about with a single card', () => {
    expect(unmatchedCardPayments([hdfc], [generic, older])).toEqual([]);
  });
});

describe('paymentCandidates', () => {
  const pay = { amount: 23480, date: '2026-10-28' };

  it('offers expenses of about the same amount within 5 days, best match first', () => {
    const exact = tx('NEFT to card', { amount: 23480, date: '2026-10-25' });
    const matched = tx('Credit card bill ••4417', { amount: 23500, date: '2026-10-29' });
    const close = tx('Card bill', { amount: 23300, date: '2026-10-28' });
    const tooDifferent = tx('Laptop', { amount: 23000, date: '2026-10-28' });
    const tooLate = tx('NEFT to card', { amount: 23480, date: '2026-11-03' });
    expect(paymentCandidates(hdfc, both, pay, [tooLate, close, exact, tooDifferent, matched]).map((t) => t.id)).toEqual([
      matched.id,
      exact.id,
      close.id,
    ]);
  });

  it('allows ₹1 of difference on small amounts', () => {
    const one = tx('Card bill', { amount: 51, date: '2026-10-28' });
    const two = tx('Card bill', { amount: 52, date: '2026-10-28' });
    expect(paymentCandidates(hdfc, both, { amount: 50, date: '2026-10-28' }, [one, two]).map((t) => t.id)).toEqual([one.id]);
  });

  it('never offers transfers, money in, payments of another card, ones already used, or ones marked not a card payment', () => {
    const base = { amount: 23480, date: '2026-10-28' };
    const atm = tx('ATM withdrawal', { ...base, type: 'transfer', category: '', toAccount: 'cash' });
    const refund = tx('Refund', { ...base, type: 'income', category: 'refunds' });
    const otherCard = tx('Credit card bill ••9023', base);
    const alreadyUsed = tx('Credit card bill ••4417', { ...base, creditCardId: 'hdfc' });
    const dismissed = tx('Card bill', { ...base, creditCardId: null });
    expect(paymentCandidates(hdfc, both, pay, [atm, refund, otherCard, alreadyUsed, dismissed])).toEqual([]);
  });
});

describe('cardSummary', () => {
  it('works out usage, what’s available and the cost of paying only the minimum', () => {
    expect(cardSummary(hdfc, '2026-10-29')).toEqual({
      usage: 23480 / 150000,
      available: 126520,
      daysUntilDue: 5,
      status: 'due-soon',
      monthlyRate: 3.5,
      // (23,480 − 1,180) × 3.5%
      minimumOnlyInterest: 780.5,
    });
  });

  it.each([
    ['overdue', { dueDate: '2026-10-27' }],
    ['due-soon', { dueDate: '2026-11-05' }],
    ['upcoming', { dueDate: '2026-11-06' }],
    ['minimum-paid', { minDue: 0, dueDate: '2026-10-27' }],
    ['clear', { outstanding: 0, minDue: 0 }],
  ] as const)('status %s', (status, change) => {
    expect(cardSummary({ ...hdfc, ...change }, '2026-10-29').status).toBe(status);
  });

  it('copes with a card owing more than its limit', () => {
    const summary = cardSummary({ ...hdfc, limit: 20000 }, '2026-10-29');
    expect([summary.usage, summary.available]).toEqual([1.174, 0]);
  });
});

describe('cardsOverview', () => {
  it('adds up what’s owed and the limits, and picks the next card with a minimum to pay', () => {
    const paid = { ...hdfc, id: 'paid', minDue: 0, dueDate: '2026-10-30' };
    expect(cardsOverview([sbi, hdfc, paid])).toEqual({
      owed: 53200,
      limit: 380000,
      usage: 53200 / 380000,
      next: hdfc,
    });
  });

  it('is empty without cards', () => {
    expect(cardsOverview([])).toEqual({ owed: 0, limit: 0, usage: 0, next: null });
  });
});

describe('usageLevel', () => {
  it.each([
    [0.29, 'ok'],
    [0.3, 'warning'],
    [0.69, 'warning'],
    [0.7, 'over'],
  ] as const)('%s → %s', (usage, level) => {
    expect(usageLevel(usage)).toBe(level);
  });
});

describe('linkCandidates', () => {
  it('offers expenses not already under this card, newest first, including another card’s and ones marked not a card payment', () => {
    const mine = tx('Credit card bill ••4417', { date: '2026-10-03' });
    const sbiBill = tx('Credit card bill ••9023', { date: '2026-10-05' });
    const dismissed = tx('Card bill', { date: '2026-10-07', creditCardId: null });
    const rent = tx('Rent', { date: '2026-10-01' });
    const salary = tx('Salary', { type: 'income', category: 'salary', date: '2026-10-09' });
    expect(linkCandidates(hdfc, both, [mine, sbiBill, dismissed, rent, salary], '').map((t) => t.id)).toEqual([
      dismissed.id,
      sbiBill.id,
      rent.id,
    ]);
  });

  it.each([
    ['neft', 'note'],
    ['  NEFT ', 'note, ignoring case and spaces'],
    ['23,480', 'amount, with a comma'],
    ['₹23480', 'amount, with the rupee sign'],
  ])('finds a transaction by %s (%s)', (query) => {
    const rent = tx('House rent', { amount: 18000 });
    const neft = tx('NEFT to card', { amount: 23480 });
    expect(linkCandidates(hdfc, both, [rent, neft], query).map((t) => t.id)).toEqual([neft.id]);
  });
});

describe('checkCardForm', () => {
  const valid = {
    name: '  HDFC Millennia ',
    last4: '4417',
    limit: '150000',
    outstanding: '23480.5',
    minDue: '1180',
    dueDate: '2026-11-03',
    interestRate: '42',
  };

  it('turns valid input into a card', () => {
    expect(checkCardForm(valid)).toEqual({
      ok: true,
      draft: {
        name: 'HDFC Millennia',
        last4: '4417',
        limit: 150000,
        outstanding: 23480.5,
        minDue: 1180,
        dueDate: '2026-11-03',
        interestRate: 42,
      },
    });
  });

  it('leaves out last 4 digits that weren’t given, and accepts nothing owed at 0% interest', () => {
    expect(checkCardForm({ ...valid, last4: '', outstanding: '0', minDue: '0', interestRate: '0' })).toEqual({
      ok: true,
      draft: { name: 'HDFC Millennia', limit: 150000, outstanding: 0, minDue: 0, dueDate: '2026-11-03', interestRate: 0 },
    });
  });

  it.each([
    ['name', { name: '   ' }],
    ['last4', { last4: '441' }],
    ['last4', { last4: '44a7' }],
    ['limit', { limit: '0' }],
    ['limit', { limit: '' }],
    ['outstanding', { outstanding: '' }],
    ['minDue', { minDue: '' }],
    ['minDue', { minDue: '23481' }],
    ['dueDate', { dueDate: '' }],
    ['interestRate', { interestRate: '' }],
    ['interestRate', { interestRate: '61' }],
  ] as const)('explains a problem with %s: %o', (field, change) => {
    const result = checkCardForm({ ...valid, ...change });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors)).toEqual([field]);
  });
});

describe('cardLabel', () => {
  it('adds the last 4 digits when the card has them', () => {
    expect(cardLabel(hdfc)).toBe('HDFC Millennia ••4417');
    expect(cardLabel({ ...hdfc, last4: undefined })).toBe('HDFC Millennia');
  });
});
