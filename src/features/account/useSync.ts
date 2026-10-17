import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { SyncService, SyncStatus } from '../../services/sync/syncService';
import type { SyncLogEntry } from '../../services/sync/syncLog';

const OFF: SyncStatus = { kind: 'off' };
const noop = () => () => undefined;

/** The sync service (absent when the account is unavailable or in tests) and its current status. */
export function useSync(): { service: SyncService | null; status: SyncStatus } {
  const { sync } = useRepositories();
  const status = useSyncExternalStore(sync?.subscribe ?? noop, sync?.getStatus ?? (() => OFF));
  return { service: sync ?? null, status };
}

/**
 * F1: is this device's progress bound to an account? (Reset progress / Import then also replace the account's cloud
 * data.) Re-read whenever the sync status changes. null while unknown or when there is no sync.
 */
export function useSyncBound(): boolean | null {
  const { service, status } = useSync();
  const [bound, setBound] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    if (service === null) {
      setBound(null);
      return;
    }
    service
      .isBound()
      .then((value) => {
        if (alive) setBound(value);
      })
      .catch(() => {
        if (alive) setBound(null);
      });
    return () => {
      alive = false;
    };
  }, [service, status]);
  return bound;
}

/** F5: the local sync log, newest first. */
export function useSyncLog(): readonly SyncLogEntry[] {
  const { service } = useSync();
  const [entries, setEntries] = useState<readonly SyncLogEntry[]>(() => service?.log.list() ?? []);
  useEffect(() => {
    if (service === null) return;
    setEntries(service.log.list());
    return service.log.subscribe(() => setEntries(service.log.list()));
  }, [service]);
  return [...entries].reverse();
}
