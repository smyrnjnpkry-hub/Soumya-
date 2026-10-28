import { addMonthsToDate, addMonthsToKey, daysInMonth, lastNMonths, monthKey } from './dates';
import { DEFAULT_CATEGORIES } from './defaults';
import type { Account, Budget, FinanceData, Goal, Loan, Transaction } from './types';

/** Small deterministic PRNG so the demo looks the same on every device. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * A realistic six-month history for a salaried professional in a metro city:
 * salary, rent, EMIs, UPI spending, the occasional big purchase — ending today.
 */
export function createSampleData(today: string): FinanceData {
  const rand = mulberry32(20261028);
  const between = (min: number, max: number) => Math.round((min + rand() * (max - min)) / 10) * 10;
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];

  const accounts: Account[] = [
    { id: 'bank', name: 'HDFC Savings', type: 'bank', balance: 135000 },
    { id: 'upi', name: 'PhonePe UPI', type: 'upi', balance: 1800 },
    { id: 'cash', name: 'Cash', type: 'cash', balance: 2500 },
  ];

  const transactions: Transaction[] = [];
  let seq = 0;
  const add = (date: string, type: Transaction['type'], amount: number, category: string, account: string, note: string, toAccount?: string) => {
    if (date > today) return;
    transactions.push({ id: `sample-${++seq}`, type, amount, date, category, account, note, ...(toAccount ? { toAccount } : {}) });
  };

  const currentKey = monthKey(today);
  const months = lastNMonths(currentKey, 7);
  months.forEach((key, index) => {
    const isCurrent = key === currentKey;
    const days = daysInMonth(key);
    const on = (day: number) => `${key}-${pad2(Math.min(day, days))}`;
    const someDay = () => on(1 + Math.floor(rand() * days));

    // Income
    add(on(1), 'income', 92000, 'salary', 'bank', 'Monthly salary');
    if (index % 2 === 1) add(on(14 + (index % 5)), 'income', between(9000, 16000), 'freelance', 'bank', pick(['Logo design project', 'Website for a client', 'UI audit gig']));
    if (index % 3 === 2) add(on(28), 'income', between(900, 1400), 'interest', 'bank', 'Savings interest');
    if (rand() > 0.5) add(someDay(), 'income', between(120, 600), 'refunds', 'upi', pick(['UPI cashback', 'Amazon refund', 'Swiggy refund']));

    // Fixed outgoings
    add(on(2), 'transfer', 10000, '', 'bank', 'Top up UPI wallet', 'upi');
    add(on(3), 'expense', 18000, 'rent', 'bank', 'House rent');
    add(on(5), 'expense', 12450, 'emi', 'bank', 'Car loan EMI');
    add(on(7), 'transfer', 3000, '', 'bank', 'ATM withdrawal', 'cash');
    add(on(8), 'expense', between(1300, 2600), 'bills', 'bank', 'Electricity bill');
    add(on(12), 'expense', 5020, 'emi', 'bank', 'Personal loan EMI');
    add(on(12), 'expense', 799, 'bills', 'upi', 'Broadband');
    add(on(15), 'expense', 349, 'bills', 'upi', 'Mobile recharge');
    add(on(18), 'expense', 649, 'entertainment', 'upi', 'Netflix');

    // Day-to-day spending (a busier food month and one big purchase this month)
    const groceryRuns = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < groceryRuns; i++) {
      add(on(2 + i * 7 + Math.floor(rand() * 3)), 'expense', between(900, 2700), 'groceries', rand() > 0.3 ? 'upi' : 'cash', pick(['BigBasket order', 'D-Mart', 'Vegetables & fruits', 'Blinkit']));
    }
    const meals = (isCurrent ? 15 : 10) + Math.floor(rand() * 4);
    for (let i = 0; i < meals; i++) {
      add(someDay(), 'expense', between(140, isCurrent ? 1150 : 950), 'food', rand() > 0.2 ? 'upi' : 'cash', pick(['Swiggy', 'Zomato', 'Chai & snacks', 'Lunch with team', 'Dinner out', 'Café']));
    }
    const rides = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < rides; i++) {
      add(someDay(), 'expense', between(80, 520), 'transport', rand() > 0.25 ? 'upi' : 'cash', pick(['Uber', 'Auto', 'Metro card recharge', 'Rapido']));
    }
    add(on(10), 'expense', between(1600, 2400), 'transport', 'bank', 'Petrol');
    add(on(24), 'expense', between(1400, 2200), 'transport', 'bank', 'Petrol');
    const shopping = isCurrent ? 1 : 2 + Math.floor(rand() * 2);
    for (let i = 0; i < shopping; i++) {
      add(someDay(), 'expense', between(700, 3800), 'shopping', rand() > 0.5 ? 'bank' : 'upi', pick(['Amazon', 'Myntra', 'Decathlon', 'Home essentials']));
    }
    if (isCurrent) add(on(21), 'expense', 7999, 'shopping', 'bank', 'Noise-cancelling headphones');
    add(someDay(), 'expense', between(350, 1200), 'entertainment', 'upi', pick(['Movie tickets', 'Concert', 'Bowling with friends']));
    if (rand() > 0.4) add(someDay(), 'expense', between(250, 1800), 'health', 'upi', pick(['Pharmacy', 'Doctor consultation', 'Lab test']));
    add(someDay(), 'expense', between(300, 900), 'personal', 'cash', pick(['Haircut', 'Salon', 'Skincare']));

    // One-offs
    if (index === 2) {
      add(on(9), 'expense', 6480, 'travel', 'bank', 'Flights to Goa');
      add(on(10), 'expense', 8200, 'travel', 'bank', 'Hotel stay');
    }
    if (index === 4) add(on(16), 'expense', 3499, 'education', 'bank', 'Online course');
    if (index === 3) add(on(20), 'expense', 2500, 'gifts', 'upi', 'Wedding gift');
  });

  const budgetLimits: Record<string, number> = {
    food: 7500,
    groceries: 9000,
    transport: 6000,
    shopping: 12000,
    entertainment: 2500,
    bills: 4500,
    personal: 1500,
  };
  const budgets: Budget[] = [currentKey, addMonthsToKey(currentKey, -1)].flatMap((month) =>
    Object.entries(budgetLimits).map(([category, limit]) => ({ id: `budget-${month}-${category}`, category, month, limit })),
  );

  const goals: Goal[] = [
    { id: 'goal-emergency', name: 'Emergency fund', target: 300000, current: 162000, deadline: addMonthsToDate(today, 10) },
    { id: 'goal-laptop', name: 'New laptop', target: 85000, current: 51000, deadline: addMonthsToDate(today, 4) },
    { id: 'goal-goa', name: 'Goa trip', target: 35000, current: 35000, deadline: addMonthsToDate(today, 1) },
  ];

  // Next EMI dates: the 5th and 12th, this month if not yet passed
  const nextOn = (day: number) => {
    const thisMonth = `${currentKey}-${pad2(day)}`;
    return thisMonth > today ? thisMonth : `${addMonthsToKey(currentKey, 1)}-${pad2(day)}`;
  };
  const loans: Loan[] = [
    { id: 'loan-car', name: 'Car loan', principal: 600000, emi: 12450, interestRate: 9.2, remainingTenure: 38, nextDue: nextOn(5) },
    { id: 'loan-personal', name: 'Personal loan', principal: 150000, emi: 5020, interestRate: 12.5, remainingTenure: 11, nextDue: nextOn(12) },
  ];

  return { transactions, accounts, categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), budgets, goals, loans };
}
