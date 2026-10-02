import { createContext, useContext, type ReactNode } from 'react';
import type { KanjiRepository, ReviewRepository } from '../repositories/interfaces';

/** What the UI is allowed to know: repository INTERFACES only, never an implementation. */
export interface AppRepositories {
  readonly kanji: KanjiRepository;
  readonly review: ReviewRepository;
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
