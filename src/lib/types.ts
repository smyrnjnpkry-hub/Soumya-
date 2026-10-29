/** Money is stored in rupees (₹) as plain numbers; dates as local 'YYYY-MM-DD'. */

export type TransactionType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense';
export type AccountType = 'cash' | 'bank' | 'upi';

/** Keys into the validated categorical palette (see index.css `--cat-*`). */
export type ColorKey = 'blue' | 'orange' | 'aqua' | 'yellow' | 'magenta' | 'green' | 'violet' | 'red' | 'slate';

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Always positive; `type` carries the direction. */
  amount: number;
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string;
  /** Category id. Empty for transfers. */
  category: string;
  /** Account id. For transfers, the account money leaves. */
  account: string;
  /** Transfers only: the account money arrives in. */
  toAccount?: string;
  note: string;
  /**
   * Credit card link: a card id (linked by hand or by recording a payment), null ("not a card payment" — automatic
   * matching leaves it alone), or missing (automatic matching decides).
   */
  creditCardId?: string | null;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Opening balance. The current balance is derived from transactions. */
  balance: number;
}

export interface Category {
  id: string;
  name: string;
  /** Icon key, see lib/icons.tsx. */
  icon: string;
  color: ColorKey;
  type: CategoryType;
}

export interface Budget {
  id: string;
  /** Category id. */
  category: string;
  /** 'YYYY-MM' */
  month: string;
  limit: number;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  /** 'YYYY-MM-DD' */
  deadline: string;
}

export interface Loan {
  id: string;
  name: string;
  /** Original amount borrowed. */
  principal: number;
  emi: number;
  /** Annual interest rate in percent, e.g. 9.5 */
  interestRate: number;
  /** EMIs left to pay. */
  remainingTenure: number;
  /** 'YYYY-MM-DD' */
  nextDue: string;
}

export interface CreditCard {
  id: string;
  name: string;
  /** Credit limit. */
  limit: number;
  /** Amount owed now. You keep it up to date; recording a payment lowers it. */
  outstanding: number;
  /** Minimum due on the current statement; 0 once paid. */
  minDue: number;
  /** 'YYYY-MM-DD' */
  dueDate: string;
  /** Annual interest rate in percent, e.g. 42 (cards often quote it monthly: 3.5% a month). */
  interestRate: number;
  /** Last four digits of the card number. */
  last4?: string;
}

export interface FinanceData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  goals: Goal[];
  loans: Loan[];
  creditCards: CreditCard[];
}
