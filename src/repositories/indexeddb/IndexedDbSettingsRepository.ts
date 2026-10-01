import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import { userSettingsSchema } from '../../types/schemas';
import type { UserSettings } from '../../types/entities';
import type { SettingsRepository } from '../interfaces';
import { parseRecord, runRepositoryOperation } from './guard';

export class IndexedDbSettingsRepository implements SettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  get(): Promise<UserSettings | null> {
    return runRepositoryOperation('SettingsRepository.get', async () => {
      const record = await this.db.get(STORES.userSettings, SINGLETON_KEY);
      return record === undefined ? null : parseRecord(userSettingsSchema, record, 'settings');
    });
  }

  save(settings: UserSettings): Promise<void> {
    return runRepositoryOperation('SettingsRepository.save', async () => {
      const valid = parseRecord(userSettingsSchema, settings, 'settings');
      await this.db.put(STORES.userSettings, valid, SINGLETON_KEY);
    });
  }
}
