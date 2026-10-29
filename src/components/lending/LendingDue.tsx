import { CalendarClock, CircleAlert, CircleCheck, OctagonAlert } from 'lucide-react';
import { DUE_SOON_DAYS, type EntrySummary } from '@/lib/lending';
import { StatusPill } from '../ui/Bits';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** What's due for someone, as a pill: the words always say it, the colour backs it up. */
export function LendingDue({ s }: { s: EntrySummary }) {
  if (s.settled)
    return (
      <StatusPill icon={CircleCheck} tone="ok">
        Settled
      </StatusPill>
    );
  const { due } = s;
  if (!due) return null;
  if (due.days < 0)
    return (
      <StatusPill icon={OctagonAlert} tone="danger">
        {due.kind === 'interest' ? 'Interest overdue' : 'Overdue'} by {days(-due.days)}
      </StatusPill>
    );
  const when = due.days === 0 ? 'today' : due.days === 1 ? 'tomorrow' : `in ${days(due.days)}`;
  const soon = due.days <= DUE_SOON_DAYS;
  return (
    <StatusPill icon={soon ? CircleAlert : CalendarClock} tone={soon ? 'warning' : 'info'}>
      {due.kind === 'interest' ? `Interest due ${when}` : `Due back ${when}`}
    </StatusPill>
  );
}
