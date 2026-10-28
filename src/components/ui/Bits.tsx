import { ArrowLeftRight, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { addMonthsToKey } from '@/lib/dates';
import { formatINR, formatMonth } from '@/lib/format';
import { getIcon } from '@/lib/icons';
import type { Category, TransactionType } from '@/lib/types';
import { cn, colorVar, tint } from '@/lib/ui';
import { IconButton } from './Button';

const BADGE_SIZES = {
  sm: 'size-8 rounded-lg [&>svg]:size-4',
  md: 'size-10 rounded-xl [&>svg]:size-5',
  lg: 'size-12 rounded-2xl [&>svg]:size-6',
};

/** Tinted icon badge carrying a category's colour identity. */
export function CategoryIcon({
  category,
  size = 'md',
  transfer,
}: {
  category?: Category;
  size?: keyof typeof BADGE_SIZES;
  transfer?: boolean;
}) {
  const Icon = transfer ? ArrowLeftRight : getIcon(category?.icon ?? 'tag');
  const color = transfer ? 'var(--primary)' : colorVar(category?.color ?? 'slate');
  return (
    <span
      className={cn('grid shrink-0 place-items-center', BADGE_SIZES[size])}
      style={{ backgroundColor: tint(color, 15), color }}
      aria-hidden
    >
      <Icon strokeWidth={2} />
    </span>
  );
}

/** Signed, coloured money amount. The sign keeps meaning readable without colour. */
export function Amount({ value, type, className }: { value: number; type: TransactionType; className?: string }) {
  const sign = type === 'income' ? '+' : type === 'expense' ? '−' : '';
  return (
    <span
      className={cn(
        'font-semibold whitespace-nowrap tabular-nums',
        type === 'income' ? 'text-income' : type === 'expense' ? 'text-expense' : 'text-ink',
        className,
      )}
    >
      {sign}
      {formatINR(value)}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function MonthSwitcher({ value, onChange, max }: { value: string; onChange: (key: string) => void; max?: string }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface p-0.5 shadow-card">
      <IconButton label="Previous month" onClick={() => onChange(addMonthsToKey(value, -1))}>
        <ChevronLeft className="size-4" />
      </IconButton>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold text-ink" aria-live="polite">
        {formatMonth(value)}
      </span>
      <IconButton label="Next month" disabled={max !== undefined && value >= max} onClick={() => onChange(addMonthsToKey(value, 1))}>
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  );
}

/** Small label + icon for a state, so colour is never the only signal. */
export function StatusPill({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: 'ok' | 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  const tones = {
    ok: 'bg-income-soft text-income',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-expense-soft text-expense',
    info: 'bg-primary-soft text-primary-ink',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', tones[tone])}>
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  );
}
