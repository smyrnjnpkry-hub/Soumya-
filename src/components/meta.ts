import { Banknote, Landmark, Smartphone, type LucideIcon } from 'lucide-react';
import type { BudgetStatus } from '@/lib/finance';
import type { AccountType } from '@/lib/types';

export const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = { cash: Banknote, bank: Landmark, upi: Smartphone };

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = { cash: 'Cash', bank: 'Bank', upi: 'UPI' };

/** Meter colours: accent → warning → critical (always paired with a text label). */
export const BUDGET_COLORS: Record<BudgetStatus, string> = {
  ok: 'var(--primary)',
  warning: 'var(--warning-mark)',
  over: 'var(--critical-mark)',
};
