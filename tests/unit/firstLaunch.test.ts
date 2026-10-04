import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(await app.kanji.getDatasetVersion()).toBe('n5-2026.10.01');
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

  it('within one run the start-up work happens once (React StrictMode safe)', async () => {
    const { bootstrapApp } = await import('../../src/app/bootstrap');
    expect(await bootstrapApp()).toBe(await bootstrapApp());
  });
});
