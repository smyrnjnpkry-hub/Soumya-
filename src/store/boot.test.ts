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
