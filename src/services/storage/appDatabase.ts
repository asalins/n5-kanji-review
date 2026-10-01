import { latestVersion, openAppDatabase, type AppDatabase } from './database';
import { APP_MIGRATIONS } from './migrations';

export const CURRENT_DB_VERSION = latestVersion(APP_MIGRATIONS);

/** Opens the production database with the full migration history. */
export function openDefaultDatabase(): Promise<AppDatabase> {
  return openAppDatabase(APP_MIGRATIONS);
}
