import { CalendarClock, CircleAlert, CircleCheck, OctagonAlert } from 'lucide-react';
import type { CardSummary } from '@/lib/cards';
import { StatusPill } from '../ui/Bits';

/** A card's due status as a pill; the text always says it, the colour backs it up. */
export function CardStatus({ s }: { s: CardSummary }) {
  switch (s.status) {
    case 'clear':
      return (
        <StatusPill icon={CircleCheck} tone="ok">
          Nothing owed
        </StatusPill>
      );
    case 'minimum-paid':
      return (
        <StatusPill icon={CircleCheck} tone="ok">
          Minimum paid
        </StatusPill>
      );
    case 'overdue':
      return (
        <StatusPill icon={OctagonAlert} tone="danger">
          Overdue by {-s.daysUntilDue} {s.daysUntilDue === -1 ? 'day' : 'days'}
        </StatusPill>
      );
    case 'due-soon':
      return (
        <StatusPill icon={CircleAlert} tone="warning">
          {s.daysUntilDue === 0 ? 'Due today' : s.daysUntilDue === 1 ? 'Due tomorrow' : `Due in ${s.daysUntilDue} days`}
        </StatusPill>
      );
    default:
      return (
        <StatusPill icon={CalendarClock} tone="info">
          Due in {s.daysUntilDue} days
        </StatusPill>
      );
  }
}
