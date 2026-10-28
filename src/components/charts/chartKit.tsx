import type { ReactNode } from 'react';
import { formatINR } from '@/lib/format';
import { prefersReducedMotion } from '@/lib/ui';

/** Shared chart chrome: recessive axes, solid hairline grid, compact ₹ ticks. */
export const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: 'var(--muted)', fontSize: 12 },
} as const;

export const GRID = { vertical: false, stroke: 'var(--grid)' } as const;

export const compactINR = (v: number) => formatINR(v, { compact: true });

export const animate = () => !prefersReducedMotion();

interface TooltipRow {
  label: string;
  value: number;
  color: string;
}

/** The slice of Recharts' tooltip payload we read (kept structural to dodge its generics). */
export interface PayloadEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  stroke?: string;
  fill?: string;
  payload?: unknown;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: readonly PayloadEntry[];
  label?: string | number;
  title?: (label: string | number | undefined) => ReactNode;
  /** Override rows, e.g. to colour a value by its sign */
  rows?: (payload: readonly PayloadEntry[]) => TooltipRow[];
}

/** Values lead (strong), series names follow; series keyed by a short line, not a box. */
export function ChartTooltip({ active, payload, label, title, rows }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const items: TooltipRow[] = rows
    ? rows(payload)
    : payload.map((p) => ({
        label: String(p.name ?? ''),
        value: Number(p.value ?? 0),
        color: String(p.color ?? p.stroke ?? p.fill ?? 'var(--muted)'),
      }));
  return (
    <div className="min-w-36 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-pop">
      {(title || label !== undefined) && <div className="mb-1.5 text-xs font-medium text-muted">{title ? title(label) : label}</div>}
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="h-[3px] w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
            <span className="font-semibold text-ink tabular-nums">{formatINR(item.value)}</span>
            <span className="text-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend swatches mirror the mark: a block for bars/areas, a line for lines. */
export function Legend({ items }: { items: { label: string; color: string; shape?: 'block' | 'line' }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={item.shape === 'line' ? 'h-[3px] w-3.5 rounded-full' : 'size-2.5 rounded-[3px]'}
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** SVG path for a bar with 4px rounded corners on its data end only (square at the baseline). */
export function barPath(x: number, y: number, width: number, height: number, roundTop: boolean, radius = 4) {
  const top = height < 0 ? y + height : y;
  const h = Math.abs(height);
  const r = Math.max(0, Math.min(radius, width / 2, h));
  const right = x + width;
  const bottom = top + h;
  return roundTop
    ? `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${right - r},${top} Q${right},${top} ${right},${top + r} L${right},${bottom} Z`
    : `M${x},${top} L${right},${top} L${right},${bottom - r} Q${right},${bottom} ${right - r},${bottom} L${x + r},${bottom} Q${x},${bottom} ${x},${bottom - r} Z`;
}
