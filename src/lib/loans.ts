import { addMonthsToDate, daysBetween } from './dates';
import { round2 } from './format';
import type { Loan } from './types';

const monthlyRate = (annualRatePct: number) => annualRatePct / 12 / 100;

/** Standard reducing-balance EMI: P·r·(1+r)^n / ((1+r)^n − 1). */
export function calculateEmi(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return round2(principal / months);
  const growth = (1 + r) ** months;
  return round2((principal * r * growth) / (growth - 1));
}

/** Principal still owed = present value of the remaining EMIs. */
export function outstandingPrincipal(emi: number, annualRatePct: number, remainingMonths: number): number {
  if (remainingMonths <= 0 || emi <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return round2(emi * remainingMonths);
  return round2((emi * (1 - (1 + r) ** -remainingMonths)) / r);
}

export interface LoanSummary {
  outstanding: number;
  paidPrincipal: number;
  /** Share of the principal repaid, 0–1 */
  progress: number;
  /** EMI × remaining tenure */
  totalRemaining: number;
  remainingInterest: number;
  /** Date of the final EMI, or null once repaid */
  payoffDate: string | null;
  /** Negative when the EMI is overdue */
  daysUntilDue: number;
  isOverdue: boolean;
  isClosed: boolean;
}

export function loanSummary(loan: Loan, today: string): LoanSummary {
  const isClosed = loan.remainingTenure <= 0;
  const outstanding = isClosed ? 0 : outstandingPrincipal(loan.emi, loan.interestRate, loan.remainingTenure);
  // Inconsistent inputs (e.g. an EMI typo) can put `outstanding` above the principal; clamp.
  const paidPrincipal = round2(Math.min(Math.max(loan.principal - outstanding, 0), loan.principal));
  const progress = loan.principal > 0 ? paidPrincipal / loan.principal : isClosed ? 1 : 0;
  const totalRemaining = isClosed ? 0 : round2(loan.emi * loan.remainingTenure);
  const daysUntilDue = daysBetween(today, loan.nextDue);
  return {
    outstanding,
    paidPrincipal,
    progress,
    totalRemaining,
    remainingInterest: round2(Math.max(totalRemaining - outstanding, 0)),
    payoffDate: isClosed ? null : addMonthsToDate(loan.nextDue, loan.remainingTenure - 1),
    daysUntilDue,
    isOverdue: !isClosed && daysUntilDue < 0,
    isClosed,
  };
}

/** The loan after one EMI is paid. */
export function advanceLoan(loan: Loan): Loan {
  if (loan.remainingTenure <= 0) return { ...loan, remainingTenure: 0 };
  const remainingTenure = loan.remainingTenure - 1;
  return { ...loan, remainingTenure, nextDue: remainingTenure > 0 ? addMonthsToDate(loan.nextDue, 1) : loan.nextDue };
}
