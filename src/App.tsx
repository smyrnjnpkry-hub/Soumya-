import type { ComponentType } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { AppShell, Splash } from '@/components/layout/AppShell';
import { StorageError } from '@/components/layout/StorageError';
import Dashboard from '@/pages/Dashboard';
import { useBoot } from '@/store/finance';
import '@/store/theme';
// Listen for the install prompt from the start; it fires once, early in page load.
import '@/store/install';

/** Route-level code splitting: each screen downloads (and is precached) separately. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

// HashRouter needs no server rewrites, so the app works from any static host and offline.
const router = createHashRouter([
  {
    path: '/',
    Component: AppShell,
    HydrateFallback: Splash,
    children: [
      { index: true, Component: Dashboard },
      { path: 'transactions', lazy: page(() => import('@/pages/Transactions')) },
      { path: 'transactions/new', lazy: page(() => import('@/pages/TransactionForm')) },
      { path: 'transactions/:id/edit', lazy: page(() => import('@/pages/TransactionForm')) },
      { path: 'budget', lazy: page(() => import('@/pages/Budget')) },
      { path: 'goals', lazy: page(() => import('@/pages/Goals')) },
      { path: 'cash-flow', lazy: page(() => import('@/pages/CashFlow')) },
      { path: 'categories', lazy: page(() => import('@/pages/Categories')) },
      { path: 'loans', lazy: page(() => import('@/pages/Loans')) },
      { path: 'reports', lazy: page(() => import('@/pages/Reports')) },
      { path: 'insights', lazy: page(() => import('@/pages/Insights')) },
      { path: 'accounts', lazy: page(() => import('@/pages/Accounts')) },
      { path: 'import', lazy: page(() => import('@/pages/ImportStatement')) },
      { path: 'settings', lazy: page(() => import('@/pages/Settings')) },
      { path: 'more', lazy: page(() => import('@/pages/More')) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  // Wait for IndexedDB so saved data never flashes behind demo data.
  const status = useBoot((s) => s.status);
  if (status === 'loading') return <Splash />;
  if (status === 'error') return <StorageError />;
  return <RouterProvider router={router} />;
}
