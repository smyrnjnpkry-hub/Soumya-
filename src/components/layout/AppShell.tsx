import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { cn } from '@/lib/ui';
import { BottomNav, MobileTopBar, Sidebar, Toaster, UpdatePrompt } from './Chrome';

/** Add/edit transaction is a focused full-screen flow on phones: no top or bottom bars. */
const isFocusedFlow = (pathname: string) => /^\/transactions\/(new|[^/]+\/edit)$/.test(pathname);

export function AppShell() {
  const { pathname } = useLocation();
  const focused = isFocusedFlow(pathname);
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {!focused && <MobileTopBar />}
        <main className={cn('mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 lg:px-10 lg:pt-8', focused ? 'pt-0 pb-8' : 'pt-2 pb-28 lg:pb-12')}>
          <Outlet />
        </main>
      </div>
      {!focused && <BottomNav />}
      <Toaster />
      <UpdatePrompt />
      <ScrollRestoration />
    </div>
  );
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading FinTrack">
      <div className="size-10 animate-pulse rounded-2xl bg-primary-fill/80" />
    </div>
  );
}
