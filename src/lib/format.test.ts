import { describe, expect, it } from 'vitest';
import { dayLabel, formatDate, formatINR, formatMonth, formatPercent, roughly } from './format';

describe('formatINR', () => {
  it('groups digits the Indian way (lakhs and crores)', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINR(123456789)).toBe('₹12,34,56,789');
  });

  it('shows paise only when the amount has them', () => {
    expect(formatINR(1500)).toBe('₹1,500');
    expect(formatINR(99.5)).toBe('₹99.50');
  });

  it('rounds away floating point noise before deciding on paise', () => {
    expect(formatINR(0.1 + 0.2)).toBe('₹0.30');
    expect(formatINR(100.0000001)).toBe('₹100');
  });

  it('uses a true minus sign for negative amounts', () => {
    expect(formatINR(-2500)).toBe('−₹2,500');
  });

  it('can sign amounts for deltas, leaving zero unsigned', () => {
    expect(formatINR(500, { sign: true })).toBe('+₹500');
    expect(formatINR(-500, { sign: true })).toBe('−₹500');
    expect(formatINR(0, { sign: true })).toBe('₹0');
  });

  it('compacts large amounts with K, L and Cr', () => {
    expect(formatINR(950, { compact: true })).toBe('₹950');
    expect(formatINR(15000, { compact: true })).toBe('₹15K');
    expect(formatINR(150000, { compact: true })).toBe('₹1.5L');
    expect(formatINR(12500000, { compact: true })).toBe('₹1.3Cr');
    expect(formatINR(-150000, { compact: true })).toBe('−₹1.5L');
  });
});

describe('formatPercent', () => {
  it('formats ratios as whole percentages', () => {
    expect(formatPercent(0.183)).toBe('18%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('signs changes when asked', () => {
    expect(formatPercent(0.18, { sign: true })).toBe('+18%');
    expect(formatPercent(-0.072, { sign: true })).toBe('−7%');
    expect(formatPercent(0, { sign: true })).toBe('0%');
  });
});

describe('formatDate / formatMonth', () => {
  it('formats ISO dates for display', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026');
    expect(formatDate('2026-10-05', 'short')).toBe('5 Oct');
  });

  it('formats month keys', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
    expect(formatMonth('2026-10', 'short')).toBe('Oct');
    expect(formatMonth('2026-10', 'medium')).toBe('Oct 2026');
  });
});

describe('dayLabel', () => {
  it('names today and yesterday', () => {
    expect(dayLabel('2026-10-28', '2026-10-28')).toBe('Today');
    expect(dayLabel('2026-10-27', '2026-10-28')).toBe('Yesterday');
  });

  it('uses weekday and date otherwise, adding the year only when it differs', () => {
    expect(dayLabel('2026-10-20', '2026-10-28')).toBe('Tue, 20 Oct');
    expect(dayLabel('2025-12-31', '2026-10-28')).toBe('Wed, 31 Dec 2025');
  });
});

describe('roughly', () => {
  it.each([
    [780.5, 780],
    [207.2, 210],
    [99.6, 100],
    [64.4, 64],
    [0.4, 0],
  ])('%s → about %s (nearest ₹10 from ₹100)', (n, expected) => {
    expect(roughly(n)).toBe(expected);
  });
});
