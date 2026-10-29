const STEP_MULTIPLES = [1, 2, 2.5, 5];

/**
 * Round axis ticks for a value range: the smallest step of 1, 2, 2.5 or 5 × 10ⁿ
 * that covers the data in at most `maxIntervals` intervals. The top tick is always
 * strictly above the maximum so a flat line never sits on the chart's edge, and
 * zero is always a tick.
 */
export function niceScale(min: number, max: number, maxIntervals = 5) {
  const lo = Math.min(min, 0);
  const hi = Math.max(max, 0);
  if (lo === 0 && hi === 0) return { ticks: [0, 250, 500, 750, 1000], domain: [0, 1000] as [number, number] };
  let magnitude = 10 ** Math.floor(Math.log10(Math.max(hi, -lo) / maxIntervals));
  for (;;) {
    for (const multiple of STEP_MULTIPLES) {
      const step = multiple * magnitude;
      const above = hi > 0 ? Math.floor(hi / step) + 1 : 0;
      const below = lo < 0 ? Math.floor(-lo / step) + 1 : 0;
      if (above + below <= maxIntervals) {
        const ticks = Array.from({ length: above + below + 1 }, (_, i) => Math.round((i - below) * step * 1e6) / 1e6);
        return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number] };
      }
    }
    magnitude *= 10;
  }
}
