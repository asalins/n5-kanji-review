import type { Page } from '@playwright/test';

/** Everything the restore must preserve, read straight from the browser's real IndexedDB (test-only access). */
export interface DbSnapshot {
  reviewCards: unknown[];
  reviewLogs: unknown[];
  studySessions: unknown[];
  userSettings: unknown[];
  streakState: unknown[];
  kanjiCount: number;
  contentMeta: unknown[];
}

export function readDatabase(page: Page): Promise<DbSnapshot> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('n5-kanji-review');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = (store: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
    const snapshot = {
      reviewCards: await all('reviewCards'),
      reviewLogs: await all('reviewLogs'),
      studySessions: await all('studySessions'),
      userSettings: await all('userSettings'),
      streakState: await all('streakState'),
      kanjiCount: (await all('kanji')).length,
      contentMeta: await all('contentMeta'),
    };
    db.close();
    return snapshot;
  });
}

export interface Injection {
  readonly label: string;
  readonly store: string;
  readonly method: 'add' | 'put' | 'clear';
  /** Fail on the nth call of `method` on `store` (1-based). */
  readonly nth: number;
}

/** Makes the browser's real IDBObjectStore throw at one exact write, inside the app's own transaction. */
export async function injectFailure(page: Page, injection: Injection): Promise<void> {
  await page.evaluate(({ store, method, nth }) => {
    const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    const original = proto[method]!;
    let calls = 0;
    (window as unknown as { __restoreIdb: () => void }).__restoreIdb = () => {
      proto[method] = original;
    };
    proto[method] = function (this: IDBObjectStore, ...args: unknown[]) {
      if (this.name === store) {
        calls += 1;
        if (calls === nth) throw new DOMException(`injected failure: ${store}.${method} #${nth}`, 'UnknownError');
      }
      return original.apply(this, args);
    };
  }, injection);
}

export async function removeInjection(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __restoreIdb?: () => void }).__restoreIdb?.());
}
