import { createContext, useContext, type ReactNode } from 'react';
import type { ReviewOrchestrator } from '../features/review/reviewBoundary';
import type { BackupRepository, KanjiRepository, ReviewRepository, SettingsRepository } from '../repositories/interfaces';
import type { NewItemSource } from '../services/session/types';
import type { AccountService } from '../services/account';
import type { SyncService } from '../services/sync/syncService';
import type { ClockService } from '../services/clock/clockCheck';

/** What the UI is allowed to know: repository INTERFACES only, never an implementation. */
export interface AppRepositories {
  readonly kanji: KanjiRepository;
  readonly review: ReviewRepository;
  /** Production wiring that stores reviews. Absent in tests/practice: the session then stores nothing. */
  readonly reviewOrchestrator?: ReviewOrchestrator;
  /** Project N5 list order for NEW cards. Required by the review session; absent in practice-only tests. */
  readonly newItems?: NewItemSource;
  /** Saved settings. Absent in tests: the defaults are used. */
  readonly settings?: SettingsRepository;
  /** Backup / restore / reset storage. Absent in tests that do not need it. */
  readonly backup?: BackupRepository;
  /** Optional account (L2). Absent in tests that do not need it; `unavailable` without config. */
  readonly account?: AccountService;
  /** Multi-device sync (L3b). Absent in tests that do not need it and when the account is unavailable. */
  readonly sync?: SyncService;
  /** F10-A: device clock vs server time. Absent in tests that do not need it: no clock guard, no notices. */
  readonly clock?: ClockService;
}

const RepositoriesContext = createContext<AppRepositories | null>(null);

export function RepositoriesProvider({ value, children }: { value: AppRepositories; children: ReactNode }) {
  return <RepositoriesContext.Provider value={value}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): AppRepositories {
  const value = useContext(RepositoriesContext);
  if (value === null) {
    throw new Error('useRepositories must be used inside RepositoriesProvider');
  }
  return value;
}
