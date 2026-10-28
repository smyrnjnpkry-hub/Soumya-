import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { ThemeToggle } from '@/components/layout/Chrome';
import { MORE_ITEMS } from '@/components/layout/nav';
import { Card, PageHeader } from '@/components/ui/Card';

export default function More() {
  return (
    <>
      <PageHeader title="More" subtitle="Plan, analyse and manage" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MORE_ITEMS.map((item) => (
          <Link key={item.to} to={item.to} className="card flex flex-col gap-3 p-4 transition hover:border-primary/40 active:scale-[0.98]">
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <item.icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold text-ink">{item.label}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{item.description}</span>
            </span>
          </Link>
        ))}
      </div>
      <Card className="mt-4 p-2">
        <ThemeToggle variant="switch" />
        <Link
          to="/settings"
          className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-2 hover:bg-subtle hover:text-ink"
        >
          Export, backup & data
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </Card>
    </>
  );
}
