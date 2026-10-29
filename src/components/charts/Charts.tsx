import { useNavigate } from 'react-router';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { OTHER_ID, type BreakdownItem, type MonthPoint } from '@/lib/finance';
import { formatINR, formatMonth, formatPercent } from '@/lib/format';
import type { Category } from '@/lib/types';
import { colorVar } from '@/lib/ui';
import { CategoryIcon } from '../ui/Bits';
import { animate, AXIS, barPath, ChartTooltip, GRID, Legend, yAxisFor } from './chartKit';

// ---------------------------------------------------------------------------
// Spending donut + legend list (the list doubles as the chart's table view)
// ---------------------------------------------------------------------------

interface DonutProps {
  items: BreakdownItem[];
  categories: Record<string, Category>;
  total: number;
  centerLabel?: string;
  /** Rows link to the category's transactions for this date range */
  linkRange?: { from: string; to: string };
}

const sliceColor = (item: BreakdownItem, categories: Record<string, Category>) =>
  item.categoryId === OTHER_ID ? 'var(--cat-slate)' : colorVar(categories[item.categoryId]?.color ?? 'slate');

const sliceName = (item: BreakdownItem, categories: Record<string, Category>) =>
  item.categoryId === OTHER_ID ? 'Other categories' : (categories[item.categoryId]?.name ?? 'Uncategorized');

export function SpendingDonut({ items, categories, total, centerLabel = 'Spent', linkRange }: DonutProps) {
  const navigate = useNavigate();
  const data = items.map((item) => ({
    ...item,
    name: sliceName(item, categories),
    fill: sliceColor(item, categories),
  }));
  // A one-slice ring says nothing a number can't, so the chart needs at least two slices
  const showChart = data.length >= 2;
  return (
    <div className={showChart ? 'grid items-center gap-5 sm:grid-cols-[minmax(0,200px)_1fr]' : ''}>
      {showChart && (
        <div className="relative mx-auto aspect-square w-full max-w-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="amount"
                nameKey="name"
                innerRadius="70%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="var(--surface)"
                strokeWidth={2}
                cornerRadius={3}
                isAnimationActive={animate()}
              />
              <Tooltip
                content={(p) => (
                  <ChartTooltip
                    {...p}
                    rows={(payload) =>
                      payload.map((row) => ({
                        label: `${row.name} · ${formatPercent((row.payload as BreakdownItem).share)}`,
                        value: Number(row.value),
                        color: String((row.payload as { fill: string }).fill),
                      }))
                    }
                  />
                )}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-xs font-medium text-muted">{centerLabel}</div>
              <div className="text-lg font-bold tracking-tight text-ink">{formatINR(total, { compact: total >= 1e5 })}</div>
            </div>
          </div>
        </div>
      )}
      <ul className="space-y-1">
        {data.map((item) => {
          const category = categories[item.categoryId];
          const clickable = linkRange && item.categoryId !== OTHER_ID;
          return (
            <li key={item.categoryId}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() =>
                  clickable &&
                  navigate(`/transactions?category=${encodeURIComponent(item.categoryId)}&from=${linkRange.from}&to=${linkRange.to}`)
                }
                className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition enabled:hover:bg-subtle"
              >
                {item.categoryId === OTHER_ID ? (
                  <span className="grid size-8 shrink-0 place-items-center">
                    <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.fill }} />
                  </span>
                ) : (
                  <CategoryIcon category={category} size="sm" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{item.name}</span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatINR(item.amount)}</span>
                <span className="w-10 text-right text-xs text-muted tabular-nums">{formatPercent(item.share)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Income vs expenses (grouped columns)
// ---------------------------------------------------------------------------

const monthLabel = (key: string) => formatMonth(key, 'short');

export function IncomeExpenseChart({ months, height = 260 }: { months: MonthPoint[]; height?: number }) {
  const data = months.map((m) => ({ ...m, label: monthLabel(m.key) }));
  return (
    <div>
      <Legend
        items={[
          { label: 'Income', color: 'var(--income-mark)' },
          { label: 'Expenses', color: 'var(--expense-mark)' },
        ]}
      />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} dy={6} />
            <YAxis {...yAxisFor(months.flatMap((m) => [m.income, m.expense]))} />
            <Tooltip
              cursor={{ fill: 'var(--subtle)' }}
              content={(p) => (
                <ChartTooltip {...p} title={() => formatMonth(String((p.payload?.[0]?.payload as MonthPoint | undefined)?.key ?? ''))} />
              )}
            />
            <Bar
              dataKey="income"
              name="Income"
              fill="var(--income-mark)"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
              isAnimationActive={animate()}
            />
            <Bar
              dataKey="expense"
              name="Expenses"
              fill="var(--expense-mark)"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
              isAnimationActive={animate()}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Net cash flow (diverging columns around zero)
// ---------------------------------------------------------------------------

function NetBar(props: BarShapeProps) {
  const { x, y, width, height, payload } = props;
  const positive = (payload as MonthPoint).net >= 0;
  if (!height) return null;
  return <path d={barPath(x, y, width, height, positive)} fill={positive ? 'var(--income-mark)' : 'var(--expense-mark)'} />;
}

export function NetFlowChart({ months, height = 220 }: { months: MonthPoint[]; height?: number }) {
  const data = months.map((m) => ({ ...m, label: monthLabel(m.key) }));
  return (
    <div>
      <Legend
        items={[
          { label: 'Saved (positive)', color: 'var(--income-mark)' },
          { label: 'Overspent (negative)', color: 'var(--expense-mark)' },
        ]}
      />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="34%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} dy={6} />
            <YAxis {...yAxisFor(months.map((m) => m.net))} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ fill: 'var(--subtle)' }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  title={() => formatMonth(String((p.payload?.[0]?.payload as MonthPoint | undefined)?.key ?? ''))}
                  rows={(payload) => {
                    const m = payload[0].payload as MonthPoint;
                    return [
                      { label: 'Net', value: m.net, color: m.net >= 0 ? 'var(--income-mark)' : 'var(--expense-mark)' },
                      { label: 'Income', value: m.income, color: 'var(--de-emphasis)' },
                      { label: 'Expenses', value: m.expense, color: 'var(--de-emphasis)' },
                    ];
                  }}
                />
              )}
            />
            <Bar dataKey="net" name="Net cash flow" maxBarSize={22} shape={NetBar} isAnimationActive={animate()} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cumulative spending: this month (accent) vs last month (context)
// ---------------------------------------------------------------------------

interface CumulativeProps {
  current: { day: number; total: number }[];
  previous: { day: number; total: number }[];
  /** Days of the current month that have happened */
  uptoDay: number;
  height?: number;
}

export function CumulativeSpendChart({ current, previous, uptoDay, height = 240 }: CumulativeProps) {
  const days = Math.max(current.length, previous.length);
  const data = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    current: i < uptoDay && i < current.length ? current[i].total : null,
    previous: i < previous.length ? previous[i].total : null,
  }));
  return (
    <div>
      <Legend
        items={[
          { label: 'This month', color: 'var(--cat-blue)', shape: 'line' },
          { label: 'Last month', color: 'var(--de-emphasis)', shape: 'line' },
        ]}
      />
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="day" {...AXIS} ticks={[1, 8, 15, 22, 29]} dy={6} />
            <YAxis {...yAxisFor([...current.slice(0, uptoDay), ...previous].map((d) => d.total))} />
            <Tooltip
              cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
              content={(p) => <ChartTooltip {...p} title={(day) => `Day ${day}`} />}
            />
            <Line
              dataKey="previous"
              name="Last month"
              stroke="var(--de-emphasis)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              strokeLinecap="round"
              isAnimationActive={animate()}
            />
            <Area
              dataKey="current"
              name="This month"
              stroke="var(--cat-blue)"
              strokeWidth={2}
              fill="var(--cat-blue)"
              fillOpacity={0.1}
              connectNulls={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === uptoDay - 1 && props.cx !== undefined && props.cy !== undefined ? (
                  <circle key="end" cx={props.cx} cy={props.cy} r={4.5} fill="var(--cat-blue)" stroke="var(--surface)" strokeWidth={2} />
                ) : (
                  <g key={props.index} />
                )
              }
              activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={animate()}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny monthly bars for insight cards (history in grey, latest in the accent)
// ---------------------------------------------------------------------------

export function MiniBars({ values, labels, color, height = 40 }: { values: number[]; labels: string[]; color: string; height?: number }) {
  const max = Math.max(...values, 1);
  const barWidth = 10;
  const gap = 5;
  const width = values.length * barWidth + (values.length - 1) * gap;
  return (
    <svg width={width} height={height} role="img" aria-label={labels.map((l, i) => `${l}: ${formatINR(values[i])}`).join(', ')}>
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(3, (v / max) * height) : 2;
        const latest = i === values.length - 1;
        return (
          <path
            key={labels[i]}
            d={barPath(i * (barWidth + gap), height - h, barWidth, h, true, 3)}
            fill={latest ? color : 'var(--de-emphasis)'}
            opacity={v > 0 ? 1 : 0.4}
          >
            <title>{`${labels[i]}: ${formatINR(v)}`}</title>
          </path>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Monthly spending trend (single series → no legend box; the title names it)
// ---------------------------------------------------------------------------

export function MonthlyTrendChart({
  months,
  dataKey = 'expense',
  color = 'var(--cat-blue)',
  height = 220,
}: {
  months: MonthPoint[];
  dataKey?: 'expense' | 'income';
  color?: string;
  height?: number;
}) {
  const data = months.map((m) => ({ ...m, label: monthLabel(m.key) }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} dy={6} />
          <YAxis {...yAxisFor(months.map((m) => m[dataKey]))} />
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            content={(p) => (
              <ChartTooltip {...p} title={() => formatMonth(String((p.payload?.[0]?.payload as MonthPoint | undefined)?.key ?? ''))} />
            )}
          />
          <Area
            dataKey={dataKey}
            name={dataKey === 'expense' ? 'Spent' : 'Earned'}
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.1}
            dot={{ r: 3.5, fill: color, stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={animate()}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact net cash flow bars (diverging around zero) for summary cards
// ---------------------------------------------------------------------------

export function NetSparkBars({ months }: { months: MonthPoint[] }) {
  const width = 280;
  const height = 64;
  const labelHeight = 16;
  const slot = width / Math.max(months.length, 1);
  const barWidth = Math.min(18, slot * 0.5);
  const max = Math.max(...months.map((m) => Math.abs(m.net)), 1);
  const hasNegative = months.some((m) => m.net < 0);
  const baseline = hasNegative ? height / 2 : height;
  const scale = (hasNegative ? height / 2 - 2 : height - 2) / max;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + labelHeight}`}
      className="h-auto w-full"
      role="img"
      aria-label={months.map((m) => `${formatMonth(m.key)}: ${formatINR(m.net, { sign: true })}`).join(', ')}
    >
      <line x1={0} x2={width} y1={baseline} y2={baseline} stroke="var(--axis)" strokeWidth={1} />
      {months.map((m, i) => {
        const h = m.net === 0 ? 0 : Math.max(Math.abs(m.net) * scale, 2);
        const x = i * slot + (slot - barWidth) / 2;
        const positive = m.net >= 0;
        return (
          <g key={m.key}>
            {h > 0 && (
              <path
                d={barPath(x, positive ? baseline - h : baseline, barWidth, h, positive, 3)}
                fill={positive ? 'var(--income-mark)' : 'var(--expense-mark)'}
              >
                <title>{`${formatMonth(m.key)}: ${formatINR(m.net, { sign: true })}`}</title>
              </path>
            )}
            <text x={x + barWidth / 2} y={height + labelHeight - 3} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {formatMonth(m.key, 'short')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Average spend per weekday — emphasis form: the peak day in the accent, the rest as context
// ---------------------------------------------------------------------------

interface WeekdayDatum {
  label: string;
  average: number;
}

function WeekdayBar(props: BarShapeProps) {
  const { x, y, width, height, payload } = props;
  if (!height) return null;
  return (
    <path d={barPath(x, y, width, height, true)} fill={(payload as { peak: boolean }).peak ? 'var(--cat-blue)' : 'var(--de-emphasis)'} />
  );
}

export function WeekdayChart({ days, height = 200 }: { days: WeekdayDatum[]; height?: number }) {
  const peak = Math.max(...days.map((d) => d.average));
  const data = days.map((d) => ({ ...d, peak: peak > 0 && d.average === peak }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="30%" margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="label" {...AXIS} dy={6} />
          <YAxis {...yAxisFor(days.map((d) => d.average))} />
          <Tooltip
            cursor={{ fill: 'var(--subtle)' }}
            content={(p) => (
              <ChartTooltip
                {...p}
                rows={(payload) => [{ label: 'average spend', value: Number(payload[0].value ?? 0), color: 'var(--cat-blue)' }]}
              />
            )}
          />
          <Bar dataKey="average" name="Average spend" maxBarSize={24} shape={WeekdayBar} isAnimationActive={animate()} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
