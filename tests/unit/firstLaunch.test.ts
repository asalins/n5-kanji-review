import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_DATASET_VERSION } from '../helpers/currentDataset';

let originalFactory: IDBFactory;
beforeEach(() => {
  originalFactory = globalThis.indexedDB as unknown as IDBFactory;
  // a brand-new, empty browser profile
  globalThis.indexedDB = new IDBFactory() as unknown as typeof globalThis.indexedDB;
  vi.resetModules();
});
afterEach(() => {
  globalThis.indexedDB = originalFactory as unknown as typeof globalThis.indexedDB;
});

async function launch() {
  const { bootstrapApp } = await import('../../src/app/bootstrap');
  return bootstrapApp();
}

async function loadedAt(): Promise<number | undefined> {
  const db = await openDB('n5-kanji-review');
  const meta = (await db.get('contentMeta', 'current')) as { loadedAt: number } | undefined;
  db.close();
  return meta?.loadedAt;
}

describe('first launch through the real composition root (real bundled dataset files)', () => {
  it('loads and validates the bundled dataset into an empty profile, then the app is usable', async () => {
    const app = await launch();
    expect(await app.kanji.getDatasetVersion()).toBe(CURRENT_DATASET_VERSION);
    expect(await app.kanji.getByLevel('N5')).toHaveLength(196);
    expect(await app.settings?.get()).toBeNull(); // nothing is written for the user on first launch
    expect(app.reviewOrchestrator).toBeDefined();
  });

  it('a second launch (app restart) keeps the loaded content: same version, not reloaded', async () => {
    await launch();
    const first = await loadedAt();
    vi.resetModules(); // restart: a fresh module graph, same browser profile
    const again = await launch();
    expect(await again.kanji.getByLevel('N5')).toHaveLength(196);
    expect(await loadedAt()).toBe(first);
  });

  it('asks the browser to keep the storage once at start-up, and a refusal or a missing API does not stop the app', async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: () => Promise.resolve(false), persist } });
    try {
      const app = await launch();
      await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
      expect(await app.kanji.getByLevel('N5')).toHaveLength(196);
    } finally {
      delete (navigator as { storage?: unknown }).storage;
    }
    vi.resetModules();
    expect(await (await launch()).kanji.getByLevel('N5')).toHaveLength(196); // no navigator.storage at all
  });

  it('within one run the start-up work happens once (React StrictMode safe)', async () => {
    const { bootstrapApp } = await import('../../src/app/bootstrap');
    expect(await bootstrapApp()).toBe(await bootstrapApp());
  });
});
