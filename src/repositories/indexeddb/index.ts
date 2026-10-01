import type { AppDatabase } from '../../services/storage/database';
import type { ContentWriter, KanjiRepository, ReviewRepository, SettingsRepository } from '../interfaces';
import { IndexedDbContentWriter } from './IndexedDbContentWriter';
import { IndexedDbKanjiRepository } from './IndexedDbKanjiRepository';
import { IndexedDbReviewRepository } from './IndexedDbReviewRepository';
import { IndexedDbSettingsRepository } from './IndexedDbSettingsRepository';

export interface Repositories {
  readonly kanji: KanjiRepository;
  readonly review: ReviewRepository;
  readonly settings: SettingsRepository;
  /** Internal: for the dataset loader only. */
  readonly contentWriter: ContentWriter;
}

/** BackupRepository has no implementation yet (Phase 9). */
export function createIndexedDbRepositories(db: AppDatabase): Repositories {
  return {
    kanji: new IndexedDbKanjiRepository(db),
    review: new IndexedDbReviewRepository(db),
    settings: new IndexedDbSettingsRepository(db),
    contentWriter: new IndexedDbContentWriter(db),
  };
}
