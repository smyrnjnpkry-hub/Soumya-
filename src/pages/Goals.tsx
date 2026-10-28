import { CalendarClock, CircleCheck, Pencil, Plus, Target, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { ContributeForm, GoalForm } from '@/components/forms/GoalForm';
import { EmptyState, StatusPill } from '@/components/ui/Bits';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, PageHeader } from '@/components/ui/Card';
import { ProgressBar, ProgressRing } from '@/components/ui/Progress';
import { daysBetween, monthsBetween, todayISO } from '@/lib/dates';
import { formatDate, formatINR, formatPercent } from '@/lib/format';
import type { Goal } from '@/lib/types';
import { useFinance } from '@/store/finance';

function goalStatus(goal: Goal, today: string) {
  const done = goal.current >= goal.target;
  const remaining = Math.max(goal.target - goal.current, 0);
  const daysLeft = daysBetween(today, goal.deadline);
  const months = Math.max(1, monthsBetween(today, goal.deadline));
  return {
    done,
    remaining,
    progress: goal.target > 0 ? goal.current / goal.target : 0,
    overdue: !done && daysLeft < 0,
    daysLeft,
    perMonth: remaining / months,
  };
}

export default function Goals() {
  const goals = useFinance((s) => s.goals);
  const today = todayISO();
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);

  const saved = goals.reduce((s, g) => s + Math.min(g.current, g.target), 0);
  const target = goals.reduce((s, g) => s + g.target, 0);
  const completed = goals.filter((g) => g.current >= g.target).length;
  // Active goals first (nearest deadline first), finished ones last
  const ordered = [...goals].sort(
    (a, b) => Number(a.current >= a.target) - Number(b.current >= b.target) || a.deadline.localeCompare(b.deadline),
  );

  return (
    <>
      <PageHeader
        title="Savings goals"
        subtitle="Put money aside for the things that matter"
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            New goal
          </Button>
        }
      />

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="An emergency fund, a new phone, a trip to Goa — set a target and a date, and track your progress."
            action={
              <Button icon={Plus} onClick={() => setEditing('new')}>
                Create your first goal
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-muted">Saved across all goals</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-ink">
                  {formatINR(saved)} <span className="text-base font-medium text-muted">of {formatINR(target)}</span>
                </p>
              </div>
              <p className="text-sm text-muted">
                {goals.length - completed} active · {completed} completed
              </p>
            </div>
            <ProgressBar
              value={target > 0 ? saved / target : 0}
              color="var(--income-mark)"
              label="Saved across all goals"
              className="mt-4 h-3"
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 lg:gap-5">
            {ordered.map((goal) => {
              const s = goalStatus(goal, today);
              const color = s.done ? 'var(--income-mark)' : s.overdue ? 'var(--warning-mark)' : 'var(--primary)';
              return (
                <Card key={goal.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-ink">{goal.name}</h2>
                      <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
                        <CalendarClock className="size-3.5" aria-hidden />
                        {formatDate(goal.deadline)}
                      </p>
                    </div>
                    <IconButton label={`Edit ${goal.name}`} onClick={() => setEditing(goal)} className="-mt-1 -mr-2">
                      <Pencil className="size-4" />
                    </IconButton>
                  </div>

                  <div className="my-5 flex items-center gap-5">
                    <ProgressRing value={s.progress} color={color} size={112} stroke={11} label={`${goal.name} progress`}>
                      <div>
                        <div className="text-xl font-bold text-ink">{formatPercent(Math.min(s.progress, 1))}</div>
                        <div className="text-[11px] text-muted">saved</div>
                      </div>
                    </ProgressRing>
                    <div className="min-w-0 space-y-1.5 text-sm">
                      <p className="font-semibold text-ink tabular-nums">{formatINR(goal.current)}</p>
                      <p className="text-muted">of {formatINR(goal.target)}</p>
                      {s.done ? (
                        <StatusPill icon={CircleCheck} tone="ok">
                          Completed
                        </StatusPill>
                      ) : s.overdue ? (
                        <StatusPill icon={TriangleAlert} tone="warning">
                          Past deadline
                        </StatusPill>
                      ) : (
                        <p className="text-[13px] text-ink-2">
                          <span className="font-semibold text-ink">{formatINR(Math.ceil(s.perMonth))}</span>/month to go
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="mb-4 text-[13px] text-muted">
                    {s.done
                      ? 'You did it! Withdraw or keep adding.'
                      : s.overdue
                        ? `${formatINR(s.remaining)} still to go — consider a new date.`
                        : `${formatINR(s.remaining)} to go · ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left`}
                  </p>

                  <Button
                    variant={s.done ? 'secondary' : 'soft'}
                    className="mt-auto w-full"
                    icon={Plus}
                    onClick={() => setContributing(goal)}
                  >
                    {s.done ? 'Manage savings' : 'Add money'}
                  </Button>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <GoalForm open={editing !== null} onClose={() => setEditing(null)} goal={editing && editing !== 'new' ? editing : undefined} />
      <ContributeForm goal={contributing} onClose={() => setContributing(null)} />
    </>
  );
}
