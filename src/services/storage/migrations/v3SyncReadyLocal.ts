import type { Migration } from '../database';
import { newUuid } from '../../../utils/uuid';

/**
 * v3 (L1): prepares local data for a future multi-device sync. Nothing is renamed or deleted:
 *  - new store `deviceMeta` with this installation's identity { deviceId: UUID v4, createdAt } (key 'current');
 *  - every existing review log keeps its primary key and content and gains deviceId: null (origin unknown) and
 *    originalId: null (never renamed);
 *  - saved settings gain updatedAt: 0 (unknown / oldest);
 *  - reviewCards, studySessions, streakState and the content stores are not touched.
 * Runs inside the versionchange transaction: a failure at any step aborts it and the database stays at v2 unchanged.
 * Literal store names and keys on purpose: a released migration must not depend on shared constants.
 */
export interface MigrationV3Deps {
  readonly newId: () => string;
  readonly now: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function createMigrationV3({ newId, now }: MigrationV3Deps): Migration {
  return {
    version: 3,
    description: 'Sync-ready local data: deviceMeta store, ReviewLog deviceId/originalId, UserSettings.updatedAt',
    async migrate(db, tx) {
      db.createObjectStore('deviceMeta');
      await tx.objectStore('deviceMeta').put({ deviceId: newId(), createdAt: now() }, 'current');

      let cursor = await tx.objectStore('reviewLogs').openCursor();
      while (cursor !== null) {
        const log: unknown = cursor.value;
        if (isRecord(log)) {
          await cursor.update({
            ...log,
            deviceId: 'deviceId' in log ? log.deviceId : null,
            originalId: 'originalId' in log ? log.originalId : null,
          });
        }
        cursor = await cursor.continue();
      }

      const settings: unknown = await tx.objectStore('userSettings').get('current');
      if (isRecord(settings) && !('updatedAt' in settings)) {
        await tx.objectStore('userSettings').put({ ...settings, updatedAt: 0 }, 'current');
      }
    },
  };
}

export const migrationV3: Migration = createMigrationV3({ newId: () => newUuid(), now: () => Date.now() });
