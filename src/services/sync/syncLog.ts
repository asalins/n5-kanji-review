/**
 * F5 (G1 follow-up): a small diagnostic log of sync decisions ON THIS DEVICE, so that "who reset / replaced the
 * account, and why" can be read afterwards instead of being reconstructed from memory.
 *  - Local only (localStorage of this origin); never uploaded, never in a backup, no uid / e-mail / review content.
 *  - Ring buffer of the last MAX_ENTRIES entries, shared by every tab of this origin (each tab has a short id).
 *  - Best effort: storage blocked or full -> entries are kept in memory for this tab only.
 */
export const SYNC_LOG_KEY = 'n5-kanji-review.syncLog';
export const MAX_ENTRIES = 40;

export interface SyncLogEntry {
  /** Epoch ms. */
  readonly at: number;
  /** Short random id of the tab that wrote the entry. */
  readonly tab: string;
  readonly event: string;
}

export interface SyncLog {
  add(event: string): void;
  list(): readonly SyncLogEntry[];
  subscribe(listener: () => void): () => void;
}

export interface LogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): LogStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const isEntry = (v: unknown): v is SyncLogEntry =>
  typeof v === 'object' && v !== null && typeof (v as SyncLogEntry).at === 'number' && typeof (v as SyncLogEntry).tab === 'string' && typeof (v as SyncLogEntry).event === 'string';

export function createSyncLog(storage: LogStorage | null = browserStorage(), now: () => number = Date.now, tab: string = Math.random().toString(36).slice(2, 6)): SyncLog {
  let memory: SyncLogEntry[] = [];
  const listeners = new Set<() => void>();
  const read = (): SyncLogEntry[] => {
    try {
      const raw = storage?.getItem(SYNC_LOG_KEY);
      if (raw === null || raw === undefined) return memory;
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEntry) : memory;
    } catch {
      return memory;
    }
  };
  return {
    add(event) {
      const next = [...read(), { at: now(), tab, event }].slice(-MAX_ENTRIES);
      memory = next;
      try {
        storage?.setItem(SYNC_LOG_KEY, JSON.stringify(next));
      } catch {
        // diagnostics only
      }
      for (const l of listeners) l();
    },
    list: () => read(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
