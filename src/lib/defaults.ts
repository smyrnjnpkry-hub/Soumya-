import type { Account, Category } from './types';

/**
 * Starter categories. The eight most common expense categories get eight
 * distinct palette hues; occasional ones reuse a hue and rely on their icon
 * and name (charts always pair colour with a labelled legend).
 */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'Food & Dining', icon: 'utensils', color: 'orange', type: 'expense' },
  { id: 'groceries', name: 'Groceries', icon: 'shopping-cart', color: 'aqua', type: 'expense' },
  { id: 'transport', name: 'Transport', icon: 'car', color: 'blue', type: 'expense' },
  { id: 'bills', name: 'Bills & Utilities', icon: 'zap', color: 'yellow', type: 'expense' },
  { id: 'rent', name: 'Rent & Housing', icon: 'house', color: 'violet', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping-bag', color: 'magenta', type: 'expense' },
  { id: 'emi', name: 'EMI & Loans', icon: 'landmark', color: 'red', type: 'expense' },
  { id: 'health', name: 'Health', icon: 'heart-pulse', color: 'green', type: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: 'film', color: 'violet', type: 'expense' },
  { id: 'education', name: 'Education', icon: 'graduation-cap', color: 'blue', type: 'expense' },
  { id: 'travel', name: 'Travel', icon: 'plane', color: 'aqua', type: 'expense' },
  { id: 'personal', name: 'Personal Care', icon: 'sparkles', color: 'magenta', type: 'expense' },
  { id: 'gifts', name: 'Gifts & Donations', icon: 'gift', color: 'orange', type: 'expense' },
  { id: 'other-expense', name: 'Other', icon: 'tag', color: 'slate', type: 'expense' },

  { id: 'salary', name: 'Salary', icon: 'briefcase', color: 'green', type: 'income' },
  { id: 'freelance', name: 'Freelance', icon: 'laptop', color: 'blue', type: 'income' },
  { id: 'business', name: 'Business', icon: 'store', color: 'violet', type: 'income' },
  { id: 'interest', name: 'Interest & Dividends', icon: 'trending-up', color: 'aqua', type: 'income' },
  { id: 'refunds', name: 'Refunds & Cashback', icon: 'undo-2', color: 'orange', type: 'income' },
  { id: 'gifts-received', name: 'Gifts Received', icon: 'gift', color: 'magenta', type: 'income' },
  { id: 'other-income', name: 'Other Income', icon: 'coins', color: 'slate', type: 'income' },
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'bank', name: 'Bank Account', type: 'bank', balance: 0 },
  { id: 'upi', name: 'UPI', type: 'upi', balance: 0 },
  { id: 'cash', name: 'Cash', type: 'cash', balance: 0 },
];
