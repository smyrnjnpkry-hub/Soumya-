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
  it('becomes ready when there is no saved data yet', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(null));
    const { useBoot } = await import('./finance');
    await vi.waitFor(() => expect(useBoot.getState().status).toBe('ready'));
  });

  it('reports an error for unreadable data instead of falling back to defaults, and never overwrites it', async () => {
    const storage = fakeLocalStorage('{"state": {not valid json');
    vi.stubGlobal('localStorage', storage);
    const { useBoot } = await import('./finance');
    await vi.waitFor(() => expect(useBoot.getState().status).toBe('error'));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
