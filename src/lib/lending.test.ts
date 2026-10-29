import { describe, expect, it } from 'vitest';
import {
  checkEntryForm,
  checkPaymentForm,
  entrySummary,
  filterEntries,
  interestDueDates,
  interestState,
  lendingOverview,
  lendingToCSV,
  owedOn,
  paymentDefaults,
  transactionCandidates,
  whatsappReminder,
  type EntryFormValues,
} from './lending';
import type { LentBorrowed, LentBorrowedPayment, Transaction } from './types';

const TODAY = '2026-10-29';

let seq = 0;
const pay = (
  date: string,
  interestPortion: number,
  principalPortion: number,
  extra: Partial<LentBorrowedPayment> = {},
): LentBorrowedPayment => ({
  id: `p${++seq}`,
  date,
  type: interestPortion && principalPortion ? 'mixed' : interestPortion ? 'interest' : 'principal',
  interestPortion,
  principalPortion,
  ...extra,
});
const withPayments = (entry: LentBorrowed, ...payments: LentBorrowedPayment[]): LentBorrowed => ({ ...entry, payments });

/** ₹50,000 at 2% a month, due on the 10th: Aug, Sep and Oct are due by 29 Oct (₹1,000 each). */
const ramesh: LentBorrowed = {
  id: 'ramesh',
  person: 'Ramesh Kumar',
  phone: '98765 43210',
  direction: 'lent',
  principal: 50000,
  interestType: 'monthly',
  interestRate: 2,
  startDate: '2026-07-10',
  dueDay: 10,
  remind: true,
  payments: [],
};
const rameshPaidUp = withPayments(ramesh, pay('2026-10-12', 3000, 0));
const rameshSettled: LentBorrowed = withPayments(
  { ...ramesh, id: 'settled' },
  pay('2026-09-11', 1000, 0),
  pay(TODAY, 1500, 50000, { type: 'settlement', waived: 500 }),
);

/** ₹30,000 at 1.5% a month, paid at the end: 120 days to 29 Oct → ₹450 × 120 ÷ 30 = ₹1,800. */
const suresh: LentBorrowed = {
  id: 'suresh',
  person: 'Suresh',
  direction: 'lent',
  principal: 30000,
  interestType: 'end',
  interestRate: 1.5,
  startDate: '2026-07-01',
  dueDate: '2026-12-31',
  remind: true,
  payments: [],
};

const priya: LentBorrowed = {
  id: 'priya',
  person: 'Priya',
  note: 'Deposit, "no hurry"',
  direction: 'borrowed',
  principal: 10000,
  interestType: 'none',
  interestRate: 0,
  startDate: '2026-07-28',
  dueDate: '2026-11-03',
  remind: true,
  payments: [pay('2026-09-30', 0, 4000)],
};

const anil: LentBorrowed = {
  id: 'anil',
  person: 'Anil',
  note: 'School fees for Riya',
  direction: 'lent',
  principal: 5000,
  interestType: 'none',
  interestRate: 0,
  startDate: '2026-09-01',
  remind: true,
  payments: [],
};

describe('owedOn', () => {
  const entry = withPayments(
    ramesh,
    pay('2026-09-11', 1000, 0),
    pay('2026-09-20', 0, 20000),
    pay('2026-10-05', 0, -5000, { type: 'correction' }),
  );

  it('takes off money paid back up to that day, and corrections either way', () => {
    expect([owedOn(entry, '2026-09-19'), owedOn(entry, '2026-09-20'), owedOn(entry, '2026-10-05')]).toEqual([50000, 30000, 35000]);
  });

  it('never goes below zero', () => {
    expect(owedOn(withPayments(ramesh, pay('2026-08-01', 0, 60000)), TODAY)).toBe(0);
  });
});

describe('interestDueDates', () => {
  it('runs from the month after the start up to the day given', () => {
    expect(interestDueDates(ramesh, TODAY)).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
  });

  it('uses the day the money changed hands when no due day is set', () => {
    expect(interestDueDates({ ...ramesh, startDate: '2026-07-15', dueDay: undefined }, TODAY)).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
    ]);
  });

  it('puts a 31st on the last day of shorter months', () => {
    expect(interestDueDates({ ...ramesh, startDate: '2026-01-31', dueDay: 31 }, '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('counts a due date falling on the day given', () => {
    expect([interestDueDates(ramesh, '2026-10-10').length, interestDueDates(ramesh, '2026-10-09').length]).toEqual([3, 2]);
  });
});

describe('interestState — monthly interest', () => {
  it('adds a month’s interest on each due date and keeps a running total of what’s unpaid', () => {
    expect(interestState(ramesh, TODAY)).toEqual({
      charged: 3000,
      received: 0,
      waived: 0,
      pending: 3000,
      overdueSince: '2026-08-10',
      nextDue: '2026-11-10',
      perMonth: 1000,
    });
  });

  it('clears the oldest month first', () => {
    const s = interestState(withPayments(ramesh, pay('2026-08-12', 1000, 0), pay('2026-09-11', 1000, 0)), TODAY);
    expect([s.pending, s.overdueSince]).toEqual([1000, '2026-10-10']);
  });

  it('charges on what was owed before each due date, so money back on a due date counts from the next month', () => {
    const onDueDate = interestState(withPayments(ramesh, pay('2026-10-10', 0, 20000)), TODAY);
    expect([onDueDate.charged, onDueDate.perMonth]).toEqual([3000, 600]);
    // Aug ₹1,000 + Sep ₹1,000 + Oct 2% of ₹30,000
    expect(interestState(withPayments(ramesh, pay('2026-09-20', 0, 20000)), TODAY).charged).toBe(2600);
  });

  it('shows interest paid ahead as negative pending, with nothing overdue', () => {
    const s = interestState(withPayments(ramesh, pay('2026-10-01', 4000, 0)), TODAY);
    expect([s.pending, s.overdueSince]).toEqual([-1000, null]);
  });

  it('stops charging once everything is paid back', () => {
    expect(interestState(rameshSettled, '2026-12-15')).toEqual({
      charged: 3000,
      received: 2500,
      waived: 500,
      pending: 0,
      overdueSince: null,
      nextDue: null,
      perMonth: 0,
    });
  });
});

describe('interestState — other kinds', () => {
  it('builds up interest at the end by the day on what’s owed', () => {
    expect(interestState(suresh, TODAY)).toEqual({
      charged: 1800,
      received: 0,
      waived: 0,
      pending: 1800,
      overdueSince: null,
      nextDue: null,
      perMonth: 450,
    });
    // 62 days on ₹30,000 (₹930) + 58 days on ₹20,000 (₹580)
    expect(interestState(withPayments(suresh, pay('2026-09-01', 0, 10000)), TODAY).charged).toBe(1510);
  });

  it('has nothing to say with no interest', () => {
    expect(interestState(priya, TODAY)).toEqual({
      charged: 0,
      received: 0,
      waived: 0,
      pending: 0,
      overdueSince: null,
      nextDue: null,
      perMonth: 0,
    });
  });
});

describe('entrySummary', () => {
  it('flags unpaid interest as overdue since the oldest unpaid month', () => {
    expect(entrySummary(ramesh, TODAY)).toMatchObject({
      owed: 50000,
      settled: false,
      due: { kind: 'interest', date: '2026-08-10', days: -80, amount: 3000 },
      dueSoon: true,
    });
  });

  it('shows the next interest date once interest is paid up', () => {
    expect(entrySummary(rameshPaidUp, TODAY)).toMatchObject({
      due: { kind: 'interest', date: '2026-11-10', days: 12, amount: 1000 },
      dueSoon: false,
    });
  });

  it('shows money due back, and counts it as due soon only with reminders on', () => {
    expect(entrySummary(priya, TODAY)).toMatchObject({
      owed: 6000,
      due: { kind: 'money', date: '2026-11-03', days: 5, amount: 6000 },
      dueSoon: true,
    });
    expect(entrySummary({ ...priya, remind: false }, TODAY)).toMatchObject({ due: { kind: 'money', days: 5 }, dueSoon: false });
  });

  it('includes interest so far in the money due back when interest is paid at the end', () => {
    expect(entrySummary(suresh, TODAY).due).toEqual({ kind: 'money', date: '2026-12-31', days: 63, amount: 31800 });
  });

  it('shows the most urgent of interest and money due back', () => {
    expect(entrySummary({ ...ramesh, dueDate: '2026-11-01' }, TODAY).due).toMatchObject({ kind: 'interest', days: -80 });
    expect(entrySummary({ ...rameshPaidUp, dueDate: '2026-11-01' }, TODAY).due).toEqual({
      kind: 'money',
      date: '2026-11-01',
      days: 3,
      amount: 50000,
    });
  });

  it('is settled once nothing is owed and no interest is pending', () => {
    expect(entrySummary(rameshSettled, TODAY)).toMatchObject({ owed: 0, settled: true, due: null, dueSoon: false });
  });

  it('stays open while interest is pending, even with the money back', () => {
    expect(entrySummary(withPayments(ramesh, pay('2026-10-20', 0, 50000)), TODAY)).toMatchObject({
      owed: 0,
      settled: false,
      due: { kind: 'interest', days: -80, amount: 3000 },
    });
  });
});

describe('lendingOverview', () => {
  const mohan: LentBorrowed = {
    id: 'mohan',
    person: 'Mohan',
    direction: 'borrowed',
    principal: 20000,
    interestType: 'monthly',
    interestRate: 1,
    startDate: '2026-08-01',
    remind: true,
    payments: [pay('2026-10-01', 200, 0)],
  };

  it('adds up what’s owed each way and the interest received this month', () => {
    expect(lendingOverview([ramesh, priya, rameshSettled, mohan], TODAY)).toEqual({
      owedToYou: 50000,
      youOwe: 26000,
      net: 24000,
      // The settled entry's ₹1,500 on 29 Oct; not its September interest, nor interest you paid Mohan
      interestThisMonth: 1500,
      pendingToYou: 3000,
    });
  });

  it('is all zeros with nobody', () => {
    expect(lendingOverview([], TODAY)).toEqual({ owedToYou: 0, youOwe: 0, net: 0, interestThisMonth: 0, pendingToYou: 0 });
  });
});

describe('transactionCandidates', () => {
  const tx = (id: string, type: Transaction['type'], amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({
    id,
    type,
    amount,
    date,
    category: type === 'income' ? 'other-income' : 'other-expense',
    account: 'bank',
    note: id,
    ...extra,
  });
  const used = withPayments(
    { ...ramesh, startTransactionId: 'used-start' },
    pay('2026-10-10', 1000, 0, { linkedTransactionId: 'used-payment' }),
  );

  it('offers money in or out of about the same amount within 5 days, closest amount first, then closest date', () => {
    const transactions = [
      tx('three-days', 'income', 1000, '2026-10-13'),
      tx('one-day', 'income', 1000, '2026-10-11'),
      tx('close', 'income', 1006, '2026-10-10'),
      tx('too-late', 'income', 1000, '2026-10-16'),
      tx('money-out', 'expense', 1000, '2026-10-10'),
      tx('transfer', 'transfer', 1000, '2026-10-10', { category: '', toAccount: 'cash' }),
      tx('too-different', 'income', 1011, '2026-10-10'),
    ];
    expect(transactionCandidates(transactions, [], { flow: 'in', amount: 1000, date: '2026-10-10' }).map((t) => t.id)).toEqual([
      'one-day',
      'three-days',
      'close',
    ]);
  });

  it('allows ₹1 of difference on small amounts', () => {
    const transactions = [tx('one', 'expense', 51, '2026-10-10'), tx('two', 'expense', 52, '2026-10-10')];
    expect(transactionCandidates(transactions, [], { flow: 'out', amount: 50, date: '2026-10-10' }).map((t) => t.id)).toEqual(['one']);
  });

  it('never offers a transaction an entry already uses, or a credit card payment', () => {
    const transactions = [
      tx('used-payment', 'income', 1000, '2026-10-10'),
      tx('used-start', 'income', 1000, '2026-10-10'),
      tx('card-bill', 'expense', 1000, '2026-10-10', { creditCardId: 'card-1' }),
    ];
    expect(transactionCandidates(transactions, [used], { flow: 'in', amount: 1000, date: '2026-10-10' })).toEqual([]);
    expect(transactionCandidates(transactions, [used], { flow: 'out', amount: 1000, date: '2026-10-10' })).toEqual([]);
  });
});

describe('filterEntries', () => {
  const everyone = [anil, rameshSettled, suresh, priya, ramesh];
  const ids = (filter: Parameters<typeof filterEntries>[1]['filter'], query = '', showSettled = false) =>
    filterEntries(everyone, { filter, query, showSettled }, TODAY).map((e) => e.id);

  it('puts overdue and due soon first, then by next due date, and hides settled entries', () => {
    expect(ids('all')).toEqual(['ramesh', 'priya', 'suresh', 'anil']);
  });

  it('shows settled entries last when asked', () => {
    expect(ids('all', '', true)).toEqual(['ramesh', 'priya', 'suresh', 'anil', 'settled']);
  });

  it.each([
    ['lent', ['ramesh', 'suresh', 'anil']],
    ['borrowed', ['priya']],
    ['interest', ['ramesh', 'suresh']],
    ['no-interest', ['priya', 'anil']],
    ['due-soon', ['ramesh', 'priya']],
  ] as const)('filter %s', (filter, expected) => {
    expect(ids(filter)).toEqual(expected);
  });

  it('searches names and notes, ignoring case', () => {
    expect([ids('all', 'KUMAR'), ids('all', ' school ')]).toEqual([['ramesh'], ['anil']]);
  });
});

describe('lendingToCSV', () => {
  it('lists each entry with what’s owed and interest pending', () => {
    expect(lendingToCSV([ramesh, priya], TODAY).split('\r\n')).toEqual([
      'Person,Phone,Direction,Amount,Still owed,Interest,Rate (% a month),Interest pending,Start date,Money back by,Due day,Status,Note',
      'Ramesh Kumar,98765 43210,Lent,50000,50000,Monthly,2,3000,2026-07-10,,10,Open,',
      'Priya,,Borrowed,10000,6000,None,0,0,2026-07-28,2026-11-03,,Open,"Deposit, ""no hurry"""',
    ]);
  });

  it('stops a spreadsheet running text as a formula', () => {
    expect(
      lendingToCSV([{ ...anil, person: '=HYPERLINK("x")' }], TODAY)
        .split('\r\n')[1]
        .startsWith(`"'=HYPERLINK(""x"")"`),
    ).toBe(true);
  });
});

describe('whatsappReminder', () => {
  const text = (link: string | null) => (link ? new URL(link).searchParams.get('text') : null);

  it('opens WhatsApp to the person with a reminder of the interest pending', () => {
    const link = whatsappReminder(ramesh, TODAY)!;
    expect([new URL(link).hostname, new URL(link).pathname]).toEqual(['wa.me', '/919876543210']);
    expect(text(link)).toBe('Hi Ramesh, just a reminder about the ₹3,000 interest pending. Thanks!');
  });

  it('reminds about the next interest, or money due back', () => {
    expect(text(whatsappReminder(rameshPaidUp, TODAY))).toBe('Hi Ramesh, just a reminder that ₹1,000 interest is due on 10 Nov. Thanks!');
    expect(text(whatsappReminder({ ...anil, phone: '9876543210', dueDate: '2026-11-05' }, TODAY))).toBe(
      'Hi Anil, just a reminder that ₹5,000 is due back on 5 Nov. Thanks!',
    );
    expect(text(whatsappReminder({ ...anil, phone: '9876543210', dueDate: '2026-10-20' }, TODAY))).toBe(
      'Hi Anil, just a reminder that ₹5,000 was due back on 20 Oct. Thanks!',
    );
  });

  it.each(['+91 98765-43210', '09876543210', '9876543210', '919876543210'])('understands the number %s', (phone) => {
    expect(new URL(whatsappReminder({ ...ramesh, phone }, TODAY)!).pathname).toBe('/919876543210');
  });

  it('has nothing to send for money you borrowed, without a phone number, once settled, or with nothing due', () => {
    expect([
      whatsappReminder({ ...priya, phone: '9876543210' }, TODAY),
      whatsappReminder({ ...ramesh, phone: undefined }, TODAY),
      whatsappReminder({ ...rameshSettled }, TODAY),
      whatsappReminder({ ...anil, phone: '9876543210' }, TODAY),
    ]).toEqual([null, null, null, null]);
  });
});

describe('checkEntryForm', () => {
  const valid: EntryFormValues = {
    person: '  Ramesh Kumar ',
    phone: '98765 43210',
    note: ' ',
    direction: 'lent',
    principal: '50000',
    startDate: '2026-07-10',
    interestType: 'monthly',
    interestRate: '2',
    dueDay: '10',
    dueDate: '',
    remind: true,
  };

  it('turns valid input into an entry', () => {
    expect(checkEntryForm(valid)).toEqual({
      ok: true,
      draft: {
        person: 'Ramesh Kumar',
        phone: '98765 43210',
        direction: 'lent',
        principal: 50000,
        startDate: '2026-07-10',
        interestType: 'monthly',
        interestRate: 2,
        dueDay: 10,
        remind: true,
      },
    });
  });

  it('drops interest details that don’t apply', () => {
    const none = checkEntryForm({ ...valid, interestType: 'none' });
    const end = checkEntryForm({ ...valid, interestType: 'end', dueDate: '2026-12-31' });
    expect(none.ok && [none.draft.interestRate, none.draft.dueDay]).toEqual([0, undefined]);
    expect(end.ok && [end.draft.interestRate, end.draft.dueDay, end.draft.dueDate]).toEqual([2, undefined, '2026-12-31']);
  });

  it.each([
    ['person', { person: '  ' }],
    ['principal', { principal: '0' }],
    ['principal', { principal: '' }],
    ['startDate', { startDate: '' }],
    ['interestRate', { interestRate: '0' }],
    ['interestRate', { interestRate: '10.5' }],
    ['dueDay', { dueDay: '32' }],
    ['dueDay', { dueDay: '0' }],
    ['dueDate', { dueDate: '2026-07-01' }],
    ['phone', { phone: '12345' }],
  ] as const)('explains a problem with %s: %o', (field, change) => {
    const result = checkEntryForm({ ...valid, ...change });
    expect(!result.ok && Object.keys(result.errors)).toEqual([field]);
  });
});

describe('paymentDefaults', () => {
  it.each([
    ['interest: everything pending', ramesh, 'interest', { interestPortion: 3000, principalPortion: 0 }],
    ['interest: a month’s worth when nothing is pending', rameshPaidUp, 'interest', { interestPortion: 1000, principalPortion: 0 }],
    ['money back: left to you', ramesh, 'money', { interestPortion: 0, principalPortion: 0 }],
    ['settle: what’s owed plus interest pending', ramesh, 'settle', { interestPortion: 3000, principalPortion: 50000 }],
    ['settle at the end: with interest so far', suresh, 'settle', { interestPortion: 1800, principalPortion: 30000 }],
    ['settle with no interest', priya, 'settle', { interestPortion: 0, principalPortion: 6000 }],
  ] as const)('%s', (_, entry, kind, expected) => {
    expect(paymentDefaults(entry, kind, TODAY)).toEqual(expected);
  });
});

describe('checkPaymentForm', () => {
  it('refuses more money back than is owed', () => {
    const result = checkPaymentForm(ramesh, { kind: 'money', interest: '', principal: '50001', date: TODAY });
    expect(!result.ok && Object.keys(result.errors)).toEqual(['principal']);
  });

  it('needs something paid and a date', () => {
    const nothing = checkPaymentForm(ramesh, { kind: 'interest', interest: '0', principal: '', date: TODAY });
    const noDate = checkPaymentForm(ramesh, { kind: 'interest', interest: '1000', principal: '', date: '' });
    expect([!nothing.ok && Object.keys(nothing.errors), !noDate.ok && Object.keys(noDate.errors)]).toEqual([['amount'], ['date']]);
  });

  it('accepts interest and money back together', () => {
    expect(checkPaymentForm(ramesh, { kind: 'money', interest: '500', principal: '20000', date: TODAY })).toEqual({
      ok: true,
      payment: { interestPortion: 500, principalPortion: 20000 },
    });
  });

  it('settles everything owed on that date, whatever money back says', () => {
    expect(checkPaymentForm(ramesh, { kind: 'settle', interest: '2500', principal: '1', date: TODAY })).toEqual({
      ok: true,
      payment: { interestPortion: 2500, principalPortion: 50000 },
    });
  });

  it('can settle with nothing paid, letting the rest go', () => {
    const repaid = withPayments(ramesh, pay('2026-10-20', 0, 50000));
    expect(checkPaymentForm(repaid, { kind: 'settle', interest: '0', principal: '', date: TODAY })).toEqual({
      ok: true,
      payment: { interestPortion: 0, principalPortion: 0 },
    });
  });
});
