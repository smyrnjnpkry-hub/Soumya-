import { describe, expect, it } from 'vitest';
import { advanceLoan, calculateEmi, loanSummary, outstandingPrincipal } from './loans';
import type { Loan } from './types';

describe('calculateEmi', () => {
  it('uses the reducing-balance EMI formula', () => {
    // ₹1,00,000 at 12% p.a. for 12 months
    expect(calculateEmi(100000, 12, 12)).toBe(8884.88);
  });

  it('splits the principal evenly at zero interest', () => {
    expect(calculateEmi(120000, 0, 12)).toBe(10000);
  });

  it('returns 0 for a zero tenure instead of dividing by zero', () => {
    expect(calculateEmi(100000, 12, 0)).toBe(0);
  });
});

describe('outstandingPrincipal', () => {
  it('is the present value of the EMIs still to pay', () => {
    expect(outstandingPrincipal(8884.88, 12, 12)).toBeCloseTo(100000, 0);
    expect(outstandingPrincipal(8884.88, 12, 6)).toBeCloseTo(51492.11, 1);
  });

  it('is simply EMI × months at zero interest', () => {
    expect(outstandingPrincipal(5000, 0, 4)).toBe(20000);
  });
});

describe('loanSummary', () => {
  const loan: Loan = {
    id: 'l1',
    name: 'Bike loan',
    principal: 100000,
    emi: 8884.88,
    interestRate: 12,
    remainingTenure: 6,
    nextDue: '2026-11-05',
  };

  it('derives repayment progress, remaining interest and payoff date', () => {
    const s = loanSummary(loan, '2026-10-28');
    expect(s.outstanding).toBeCloseTo(51492.11, 1);
    expect(s.paidPrincipal).toBeCloseTo(48507.89, 1);
    expect(s.progress).toBeCloseTo(0.4851, 3);
    expect(s.remainingInterest).toBeCloseTo(1817.17, 1);
    expect(s.payoffDate).toBe('2027-04-05');
    expect(s.daysUntilDue).toBe(8);
    expect(s.isOverdue).toBe(false);
    expect(s.isClosed).toBe(false);
  });

  it('flags an EMI whose due date has passed', () => {
    const s = loanSummary(loan, '2026-11-07');
    expect(s.daysUntilDue).toBe(-2);
    expect(s.isOverdue).toBe(true);
  });

  it('treats a loan with no EMIs left as fully repaid', () => {
    const s = loanSummary({ ...loan, remainingTenure: 0 }, '2026-10-28');
    expect(s).toMatchObject({ outstanding: 0, progress: 1, payoffDate: null, isClosed: true, isOverdue: false });
  });

  it('keeps progress within 0–1 when the inputs are inconsistent', () => {
    // EMIs worth far more than the principal → outstanding exceeds what was borrowed
    const s = loanSummary({ ...loan, emi: 20000, remainingTenure: 12 }, '2026-10-28');
    expect(s.progress).toBe(0);
    expect(s.paidPrincipal).toBe(0);
  });
});

describe('advanceLoan', () => {
  const loan: Loan = {
    id: 'l1',
    name: 'Bike loan',
    principal: 100000,
    emi: 8884.88,
    interestRate: 12,
    remainingTenure: 6,
    nextDue: '2026-11-05',
  };

  it('moves to the next EMI after a payment', () => {
    expect(advanceLoan(loan)).toMatchObject({ remainingTenure: 5, nextDue: '2026-12-05' });
  });

  it('closes the loan on its final EMI and never goes below zero', () => {
    expect(advanceLoan({ ...loan, remainingTenure: 1 })).toMatchObject({ remainingTenure: 0, nextDue: '2026-11-05' });
    expect(advanceLoan({ ...loan, remainingTenure: 0 })).toMatchObject({ remainingTenure: 0, nextDue: '2026-11-05' });
  });
});
