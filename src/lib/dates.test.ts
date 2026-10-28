import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsToDate,
  addMonthsToKey,
  daysBetween,
  daysInMonth,
  lastNMonths,
  monthBounds,
  monthKey,
  monthsBetween,
  samePeriodLastMonth,
  toISODate,
} from './dates';

describe('dates', () => {
  it('serialises local dates without timezone drift', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('derives month keys from ISO dates', () => {
    expect(monthKey('2026-10-28')).toBe('2026-10');
  });

  it('moves month keys across year boundaries', () => {
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToKey('2026-11', 2)).toBe('2027-01');
  });

  it('lists the last N months ending at a month, oldest first', () => {
    expect(lastNMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('knows month lengths including leap years', () => {
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2026-10')).toBe(31);
  });

  it('returns inclusive month bounds', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('finds the same period last month, clamped to its length', () => {
    expect(samePeriodLastMonth('2026-10-28')).toEqual({ start: '2026-09-01', end: '2026-09-28' });
    expect(samePeriodLastMonth('2026-03-31')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(samePeriodLastMonth('2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-15' });
  });

  it('counts calendar days between dates', () => {
    expect(daysBetween('2026-10-28', '2026-11-02')).toBe(5);
    expect(daysBetween('2026-11-02', '2026-10-28')).toBe(-5);
  });

  it('adds days and months to ISO dates, clamping month ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDate('2026-11-05', 2)).toBe('2027-01-05');
  });

  it('counts whole calendar months between dates', () => {
    expect(monthsBetween('2026-10-20', '2027-04-20')).toBe(6);
    expect(monthsBetween('2026-10-20', '2026-10-31')).toBe(0);
  });
});
