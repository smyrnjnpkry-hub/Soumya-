import { Moon, Plus, Settings, ShieldCheck, Sun } from 'lucide-react';
import { useEffect, useId, type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { cn } from '@/lib/ui';
import { useTheme } from '@/store/theme';
import { toast, useToasts } from '@/store/toast';
import { Button, ButtonLink, IconButton } from '../ui/Button';
import { MORE_ITEMS, NAV_GROUPS } from './nav';

export function Logo() {
  // Unique per instance: a gradient defined inside the hidden sidebar would not paint elsewhere
  const gradientId = useId();
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="FinTrack home">
      <svg viewBox="0 0 512 512" className="size-8" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="128" fill={`url(#${gradientId})`} />
        <g
          transform="translate(128 128) scale(10.667)"
          fill="none"
          stroke="#fff"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3h12" />
          <path d="M6 8h12" />
          <path d="m6 13 8.5 8" />
          <path d="M6 13h3" />
          <path d="M9 13c6.667 0 6.667-10 0-10" />
        </g>
      </svg>
      <span className="text-[17px] font-bold tracking-tight text-ink">FinTrack</span>
    </Link>
  );
}

export function ThemeToggle({ variant = 'icon' }: { variant?: 'icon' | 'switch' }) {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const dark = theme === 'dark';
  if (variant === 'icon') {
    return (
      <IconButton label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>
        {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </IconButton>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-subtle hover:text-ink"
    >
      <span className="flex items-center gap-3">
        <Moon className="size-[18px]" aria-hidden />
        Dark mode
      </span>
      <span className={cn('relative h-5 w-9 rounded-full transition', dark ? 'bg-primary-fill' : 'bg-line')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', dark ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="px-4">
        <ButtonLink to="/transactions/new" icon={Plus} className="w-full">
          Add transaction
        </ButtonLink>
      </div>
      <nav className="mt-3 flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-3.5">
            <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">{group.label}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-[7px] text-sm font-medium transition',
                    isActive ? 'bg-primary-soft text-primary-ink' : 'text-ink-2 hover:bg-subtle hover:text-ink',
                  )
                }
              >
                <item.icon className="size-[18px]" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <ThemeToggle variant="switch" />
        <p className="mt-2 flex items-center gap-1.5 px-3 text-xs text-muted">
          <ShieldCheck className="size-3.5" aria-hidden />
          Private · data stays on this device
        </p>
      </div>
    </aside>
  );
}

export function MobileTopBar() {
  return (
    <div className="sticky top-0 z-20 bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo />
        <div className="flex items-center gap-0.5">
          <ThemeToggle />
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid size-9 place-items-center rounded-xl text-ink-2 transition hover:bg-subtle hover:text-ink"
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

const MORE_PATHS = ['/more', ...MORE_ITEMS.map((i) => i.to)];

export function BottomNav() {
  const { pathname } = useLocation();
  const tab = (
    to: string,
    label: string,
    Icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>,
    active: boolean,
  ) => (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center gap-1 py-2 text-[11px] font-semibold transition',
        active ? 'text-primary' : 'text-muted hover:text-ink',
      )}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 2} aria-hidden />
      {label}
    </Link>
  );
  const groups = NAV_GROUPS[0].items;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
        {tab('/', 'Home', groups[0].icon, pathname === '/')}
        {tab('/transactions', 'Activity', groups[1].icon, pathname.startsWith('/transactions'))}
        <div className="flex justify-center">
          <Link
            to="/transactions/new"
            aria-label="Add transaction"
            className="-mt-8 grid size-14 place-items-center rounded-full bg-primary-fill text-white shadow-pop ring-4 ring-canvas transition hover:bg-primary-fill-hover active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </Link>
        </div>
        {tab('/insights', 'Insights', groups[2].icon, pathname === '/insights')}
        {tab(
          '/more',
          'More',
          MoreIcon,
          MORE_PATHS.some((p) => pathname.startsWith(p)),
        )}
      </div>
    </nav>
  );
}

function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="3.5" />
    </svg>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="animate-toast-in pointer-events-auto flex max-w-sm items-center gap-4 rounded-2xl bg-ink py-3 pr-3 pl-4 text-sm text-surface shadow-pop"
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="rounded-lg px-2 py-1 font-semibold text-blue-300 transition hover:bg-white/10 dark:text-blue-700 dark:hover:bg-black/5"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Service-worker lifecycle: confirm offline readiness, offer reload when an update is waiting. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    toast('Ready to work offline');
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 pl-4 shadow-pop lg:bottom-6">
      <p className="flex-1 text-sm text-ink">A new version of FinTrack is ready.</p>
      <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Update
      </Button>
    </div>
  );
}
