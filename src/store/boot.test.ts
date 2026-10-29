import { afterEach, describe, expect, it, vi } from 'vitest';

/** A localStorage stand-in (Node has none; IndexedDB is absent too, so the store uses this). */
function fakeLocalStorage(saved: string | null) {
  return { getItem: vi.fn(() => saved), setItem: vi.fn(), removeItem: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('loading saved data', () => {
  it('becomes ready when there is no saved data yet, showing the sample data and its cards', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(null));
    const { useBoot, useFinance } = await import('./finance');
    await vi.waitFor(() => expect(useBoot.getState().status).toBe('ready'));
    expect(useFinance.getState().isSample).toBe(true);
    expect(useFinance.getState().creditCards.map((c) => c.name)).toEqual(['HDFC Millennia', 'SBI SimplyCLICK']);
    expect(useFinance.getState().lentBorrowed.map((e) => e.person)).toEqual(['Ramesh (cousin)', 'Priya (sister)']);
  });

  it('reports an error for unreadable data instead of falling back to defaults, and never overwrites it', async () => {
    const storage = fakeLocalStorage('{"state": {not valid json');
    vi.stubGlobal('localStorage', storage);
    const { useBoot } = await import('./finance');
    await vi.waitFor(() => expect(useBoot.getState().status).toBe('error'));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('upgrading data saved before credit cards existed', () => {
  const saved = (version: number, state: object) => JSON.stringify({ state, version });
  const mine = {
    transactions: [{ id: 'mine-1', type: 'expense', amount: 250, date: '2026-10-02', category: 'food', account: 'cash', note: 'Chai' }],
    accounts: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 1000 }],
    categories: [{ id: 'food', name: 'Food', icon: 'utensils', color: 'orange', type: 'expense' }],
    budgets: [],
    goals: [],
    loans: [],
  };

  async function load(json: string) {
    vi.stubGlobal('localStorage', fakeLocalStorage(json));
    const { useBoot, useFinance } = await import('./finance');
    await vi.waitFor(() => expect(useBoot.getState().status).toBe('ready'));
    return useFinance.getState();
  }

  it('keeps your data and adds an empty card list', async () => {
    const state = await load(saved(1, { ...mine, isSample: false }));
    expect(state.creditCards).toEqual([]);
    expect(state.transactions).toEqual(mine.transactions);
    expect(state.isSample).toBe(false);
  });

  it('adds the sample cards while the sample data is still showing', async () => {
    const state = await load(saved(1, { ...mine, isSample: true }));
    expect(state.creditCards.map((c) => c.name)).toEqual(['HDFC Millennia', 'SBI SimplyCLICK']);
  });

  it('never fills a missing card list with the sample cards', async () => {
    const state = await load(saved(2, { ...mine, isSample: false }));
    expect(state.creditCards).toEqual([]);
    expect(state.transactions).toEqual(mine.transactions);
  });
});

describe('upgrading data saved before Lent & Borrowed', () => {
  const saved = (version: number, state: object) => JSON.stringify({ state, version });
  const card = { id: 'c1', name: 'Axis Ace', limit: 50000, outstanding: 0, minDue: 0, dueDate: '2026-11-05', interestRate: 39 };
  const mine = {
    transactions: [{ id: 'mine-1', type: 'expense', amount: 250, date: '2026-10-02', category: 'food', account: 'cash', note: 'Chai' }],
    accounts: [{ id: 'cash', name: 'Cash', type: 'cash', balance: 1000 }],
    categories: [{ id: 'food', name: 'Food', icon: 'utensils', color: 'orange', type: 'expense' }],
    budgets: [],
    goals: [],
    loans: [],
    creditCards: [card],
  };

  async function load(json: string) {
    vi.stubGlobal('localStorage', fakeLocalStorage(json));
    const { useBoot, useFinance } = await import('./finance');
    await vi.waitFor(() => expect(useBoot.getState().status).toBe('ready'));
    return useFinance.getState();
  }

  it('keeps your data and cards and adds an empty list of people', async () => {
    const state = await load(saved(2, { ...mine, isSample: false }));
    expect([state.lentBorrowed, state.creditCards, state.transactions]).toEqual([[], [card], mine.transactions]);
  });

  it('adds the sample people, without links to transactions the old sample doesn’t have', async () => {
    const state = await load(saved(2, { ...mine, isSample: true }));
    expect(state.lentBorrowed.map((e) => e.person)).toEqual(['Ramesh (cousin)', 'Priya (sister)']);
    const links = state.lentBorrowed.flatMap((e) => [e.startTransactionId, ...e.payments.map((p) => p.linkedTransactionId)]);
    expect(links.every((link) => link === undefined)).toBe(true);
    expect(state.lentBorrowed[0].payments.length).toBeGreaterThan(0);
  });

  it('upgrades data from before credit cards in one go', async () => {
    const { creditCards: _, ...beforeCards } = mine;
    const state = await load(saved(1, { ...beforeCards, isSample: false }));
    expect([state.creditCards, state.lentBorrowed]).toEqual([[], []]);
  });

  it('never fills a missing list of people with the sample people', async () => {
    const state = await load(saved(3, { ...mine, isSample: false }));
    expect(state.lentBorrowed).toEqual([]);
  });
});
