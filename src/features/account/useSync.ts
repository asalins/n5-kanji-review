import { useSyncExternalStore } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { SyncService, SyncStatus } from '../../services/sync/syncService';

const OFF: SyncStatus = { kind: 'off' };
const noop = () => () => undefined;

/** The sync service (absent when the account is unavailable or in tests) and its current status. */
export function useSync(): { service: SyncService | null; status: SyncStatus } {
  const { sync } = useRepositories();
  const status = useSyncExternalStore(sync?.subscribe ?? noop, sync?.getStatus ?? (() => OFF));
  return { service: sync ?? null, status };
}
