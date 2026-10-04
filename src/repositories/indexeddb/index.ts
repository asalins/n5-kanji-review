import type { AppDatabase } from '../../services/storage/database';
import type { BackupRepository, ContentWriter, KanjiRepository, ReviewRepository, SettingsRepository } from '../interfaces';
import { IndexedDbBackupRepository } from './IndexedDbBackupRepository';
import { IndexedDbContentWriter } from './IndexedDbContentWriter';
import { IndexedDbKanjiRepository } from './IndexedDbKanjiRepository';
import { IndexedDbReviewRepository } from './IndexedDbReviewRepository';
import { IndexedDbSettingsRepository } from './IndexedDbSettingsRepository';

export interface Repositories {
  readonly kanji: KanjiRepository;
  readonly review: ReviewRepository;
  readonly settings: SettingsRepository;
  readonly backup: BackupRepository;
  /** Internal: for the dataset loader only. */
  readonly contentWriter: ContentWriter;
}

export function createIndexedDbRepositories(db: AppDatabase): Repositories {
  return {
    kanji: new IndexedDbKanjiRepository(db),
    review: new IndexedDbReviewRepository(db),
    settings: new IndexedDbSettingsRepository(db),
    backup: new IndexedDbBackupRepository(db),
    contentWriter: new IndexedDbContentWriter(db),
  };
}
