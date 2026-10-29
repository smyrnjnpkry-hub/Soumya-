import { describe, expect, it } from 'vitest';
import { niceScale } from './scale';

describe('niceScale', () => {
  it('picks a round step (1, 2, 2.5 or 5 × 10ⁿ) with at most five intervals', () => {
    expect(niceScale(0, 2100).ticks).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(niceScale(0, 108270).ticks).toEqual([0, 25000, 50000, 75000, 100000, 125000]);
  });

  it('leaves headroom above a flat series instead of ending exactly on it', () => {
    expect(niceScale(0, 18000).ticks).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(niceScale(0, 20000).ticks).toEqual([0, 5000, 10000, 15000, 20000, 25000]);
  });

  it('extends below zero for negative values, keeping zero as a tick', () => {
    expect(niceScale(-800, 43313).ticks).toEqual([-20000, 0, 20000, 40000, 60000]);
  });

  it('still draws a sensible axis when there is no data', () => {
    expect(niceScale(0, 0).ticks).toEqual([0, 250, 500, 750, 1000]);
  });
});
