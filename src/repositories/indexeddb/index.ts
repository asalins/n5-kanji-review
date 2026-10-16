import type { AppDatabase } from '../../services/storage/database';
import type { BackupRepository, ContentWriter, DeviceRepository, KanjiRepository, ReviewRepository, SettingsRepository } from '../interfaces';
import { IndexedDbBackupRepository } from './IndexedDbBackupRepository';
import { IndexedDbContentWriter } from './IndexedDbContentWriter';
import { IndexedDbDeviceRepository } from './IndexedDbDeviceRepository';
import { IndexedDbKanjiRepository } from './IndexedDbKanjiRepository';
import { IndexedDbReviewRepository } from './IndexedDbReviewRepository';
import { IndexedDbSettingsRepository } from './IndexedDbSettingsRepository';

export interface Repositories {
  readonly kanji: KanjiRepository;
  readonly review: ReviewRepository;
  readonly settings: SettingsRepository;
  readonly backup: BackupRepository;
  /** Installation identity (log provenance). */
  readonly device: DeviceRepository;
  /** Internal: for the dataset loader only. */
  readonly contentWriter: ContentWriter;
}

export function createIndexedDbRepositories(db: AppDatabase): Repositories {
  return {
    kanji: new IndexedDbKanjiRepository(db),
    review: new IndexedDbReviewRepository(db),
    settings: new IndexedDbSettingsRepository(db),
    backup: new IndexedDbBackupRepository(db),
    device: new IndexedDbDeviceRepository(db),
    contentWriter: new IndexedDbContentWriter(db),
  };
}
