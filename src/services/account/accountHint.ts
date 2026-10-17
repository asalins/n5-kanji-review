/**
 * Account hint (D-L2-1 / C1): a local flag meaning "this browser had a signed-in session", stored as '1'. It holds no
 * e-mail, uid or token. It ONLY decides whether the Firebase SDK is loaded at start-up; it never proves a sign-in.
 * Not learning data: never in a backup, never touched by Import or Reset.
 */
export const ACCOUNT_HINT_KEY = 'n5-kanji-review.accountHint';

export interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AccountHint {
  read(): boolean;
  set(): void;
  clear(): void;
  /** Another tab of this origin set or cleared the hint. */
  subscribe(listener: (present: boolean) => void): () => void;
}

function browserStorage(): HintStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createAccountHint(storage: HintStorage | null = browserStorage(), target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window): AccountHint {
  const attempt = (fn: (s: HintStorage) => void) => {
    try {
      if (storage !== null) fn(storage);
    } catch {
      // storage blocked or full: the hint is an optimisation, never required
    }
  };
  return {
    read() {
      try {
        return storage?.getItem(ACCOUNT_HINT_KEY) === '1';
      } catch {
        return false;
      }
    },
    set: () => attempt((s) => s.setItem(ACCOUNT_HINT_KEY, '1')),
    clear: () => attempt((s) => s.removeItem(ACCOUNT_HINT_KEY)),
    subscribe(listener) {
      if (target === null) return () => undefined;
      const onStorage = (event: Event) => {
        const e = event as StorageEvent;
        if (e.key === ACCOUNT_HINT_KEY) listener(e.newValue === '1');
      };
      target.addEventListener('storage', onStorage);
      return () => target.removeEventListener('storage', onStorage);
    },
  };
}
