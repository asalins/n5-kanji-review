import { createContext, useContext, type ReactNode } from 'react';
import type { ReviewOrchestrator } from '../features/review/reviewBoundary';
import type { BackupRepository, KanjiRepository, ReviewRepository, SettingsRepository } from '../repositories/interfaces';
import type { NewItemSource } from '../services/session/types';

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
