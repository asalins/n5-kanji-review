import { deleteDB } from 'idb';
import { openAppDatabase, type AppDatabase, type Migration } from '../../src/services/storage/database';
import { APP_MIGRATIONS } from '../../src/services/storage/migrations';

let counter = 0;
export function uniqueDatabaseName(): string {
  counter += 1;
  return `test-db-${counter}`;
}

/** Opens an isolated database; call `dispose()` in afterEach. */
export async function openTestDatabase(
  migrations: readonly Migration[] = APP_MIGRATIONS,
  name: string = uniqueDatabaseName(),
): Promise<{ db: AppDatabase; name: string; dispose: () => Promise<void> }> {
  const db = await openAppDatabase(migrations, name);
  return {
    db,
    name,
    dispose: async () => {
      db.close();
      await deleteDB(name);
    },
  };
}
