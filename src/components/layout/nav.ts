import {
  Activity,
  ArrowLeftRight,
  ChartPie,
  CreditCard,
  FileUp,
  Gauge,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Settings,
  Shapes,
  Target,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, description: 'Balance and this month at a glance' },
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, description: 'Search, filter and edit' },
      { to: '/insights', label: 'Insights', icon: Lightbulb, description: 'Smart observations' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { to: '/budget', label: 'Budget', icon: Gauge, description: 'Monthly limits per category' },
      { to: '/goals', label: 'Goals', icon: Target, description: 'Save towards what matters' },
      { to: '/loans', label: 'Loans & EMI', icon: Landmark, description: 'EMIs, interest and payoff' },
      { to: '/credit-cards', label: 'Credit Cards', icon: CreditCard, description: 'Limits, dues and card bills' },
      { to: '/lent-borrowed', label: 'Lent & Borrowed', icon: HandCoins, description: 'Money you lent or borrowed' },
    ],
  },
  {
    label: 'Analyse',
    items: [
      { to: '/cash-flow', label: 'Cash Flow', icon: Activity, description: 'Income vs expenses over time' },
      { to: '/reports', label: 'Reports', icon: ChartPie, description: 'Charts and trends' },
      { to: '/categories', label: 'Categories', icon: Shapes, description: 'Where your money goes' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/accounts', label: 'Accounts', icon: Wallet, description: 'Cash, bank and UPI balances' },
      { to: '/import', label: 'Import statement', icon: FileUp, description: 'Add transactions from a bank PDF' },
      { to: '/settings', label: 'Settings', icon: Settings, description: 'Theme, export and data' },
    ],
  },
];

/** Screens reached through "More" on the mobile bottom bar. */
export const MORE_ITEMS = NAV_GROUPS.flatMap((g) => g.items).filter((item) => !['/', '/transactions', '/insights'].includes(item.to));
