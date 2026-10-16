import type { AppDatabase } from '../../services/storage/database';
import { SINGLETON_KEY, STORES } from '../../services/storage/schema';
import { deviceMetaSchema } from '../../types/schemas';
import { newUuid } from '../../utils/uuid';
import type { DeviceRepository } from '../interfaces';
import { parseRecord, runRepositoryOperation } from './guard';

export interface DeviceRepositoryOptions {
  readonly newId?: () => string;
  readonly now?: () => number;
}

export class IndexedDbDeviceRepository implements DeviceRepository {
  private cached: string | null = null;
  private readonly newId: () => string;
  private readonly now: () => number;

  constructor(private readonly db: AppDatabase, options: DeviceRepositoryOptions = {}) {
    this.newId = options.newId ?? (() => newUuid());
    this.now = options.now ?? Date.now;
  }

  getDeviceId(): Promise<string> {
    return runRepositoryOperation('DeviceRepository.getDeviceId', async () => {
      if (this.cached !== null) return this.cached;
      // Migration v3 creates the record; this only repairs a missing one, inside one transaction (no double create).
      const tx = this.db.transaction(STORES.deviceMeta, 'readwrite');
      const store = tx.objectStore(STORES.deviceMeta);
      const existing = await store.get(SINGLETON_KEY);
      const meta = existing === undefined ? { deviceId: this.newId(), createdAt: this.now() } : existing;
      const valid = parseRecord(deviceMetaSchema, meta, 'device meta');
      if (existing === undefined) await store.put(valid, SINGLETON_KEY);
      await tx.done;
      this.cached = valid.deviceId;
      return valid.deviceId;
    });
  }
}
