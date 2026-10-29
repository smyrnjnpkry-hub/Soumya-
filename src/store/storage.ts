import { createStore, del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * IndexedDB (via idb-keyval) with a localStorage fallback for browsers or
 * private modes where IndexedDB is unavailable. Nothing ever leaves the device.
 */
let useIndexedDb = typeof indexedDB !== 'undefined';
const idbStore = useIndexedDb ? createStore('fintrack-db', 'keyval') : undefined;

const local = {
  get: (name: string) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  set: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Storage full or blocked — nothing more we can do offline.
    }
  },
  remove: (name: string) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

async function attempt<T>(viaIndexedDb: () => Promise<T>, viaLocal: () => T): Promise<T> {
  if (useIndexedDb) {
    try {
      return await viaIndexedDb();
    } catch {
      useIndexedDb = false;
    }
  }
  return viaLocal();
}

export const deviceStorage: StateStorage = {
  getItem: (name) =>
    attempt(
      async () => (await get<string>(name, idbStore)) ?? local.get(name),
      () => local.get(name),
    ),
  setItem: (name, value) =>
    attempt(
      () => set(name, value, idbStore),
      () => local.set(name, value),
    ),
  removeItem: (name) =>
    attempt(
      async () => {
        await del(name, idbStore);
        local.remove(name);
      },
      () => local.remove(name),
    ),
};

/** Ask the browser not to evict our data under storage pressure (silent in Chromium). */
export function requestPersistentStorage() {
  navigator.storage?.persisted?.().then((persisted) => {
    if (!persisted) void navigator.storage.persist?.();
  });
}
