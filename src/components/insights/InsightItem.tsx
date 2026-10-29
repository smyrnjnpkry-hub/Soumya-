import {
  Activity,
  CalendarDays,
  CreditCard,
  Gauge,
  Landmark,
  PiggyBank,
  Shapes,
  Target,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { Insight, InsightKind, InsightTone } from '@/lib/insights';
import { cn } from '@/lib/ui';

/** Icon shape says what the insight is about; colour says whether it is good or bad. */
const KIND_ICON: Record<InsightKind, LucideIcon> = {
  spending: TrendingUp,
  category: Shapes,
  alert: TriangleAlert,
  savings: PiggyBank,
  cashflow: Activity,
  budget: Gauge,
  goal: Target,
  loan: Landmark,
  card: CreditCard,
  habit: CalendarDays,
};

export const TONE_STYLE: Record<InsightTone, { badge: string; label: string }> = {
  negative: { badge: 'bg-expense-soft text-expense', label: 'Needs attention' },
  warning: { badge: 'bg-warning-soft text-warning', label: 'Heads up' },
  positive: { badge: 'bg-income-soft text-income', label: 'Good news' },
  neutral: { badge: 'bg-primary-soft text-primary', label: 'Observation' },
};

export function InsightItem({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const Icon = KIND_ICON[insight.kind];
  const tone = TONE_STYLE[insight.tone];
  return (
    <div className="flex gap-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', tone.badge)}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="sr-only">{tone.label}:</p>
        <p className={cn('font-semibold text-ink', compact ? 'text-sm' : 'text-[15px]')}>{insight.title}</p>
        <p className={cn('mt-0.5 text-muted', compact ? 'text-xs leading-relaxed' : 'text-[13px] leading-relaxed')}>{insight.detail}</p>
      </div>
    </div>
  );
}
