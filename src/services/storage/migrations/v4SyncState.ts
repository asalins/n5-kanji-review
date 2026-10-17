import type { Migration } from '../database';

/**
 * v4 (L3b): two new, empty stores for the multi-device sync. Nothing existing is read, changed or deleted.
 *  - syncLedger (out-of-line key = ReviewLog id) -> { epoch }: which logs are already on the cloud;
 *  - syncMeta   (key 'current')                  -> account binding, known epoch, pull cursor, pending replace.
 * An empty syncMeta means "not bound to any account": nothing is uploaded until the user agrees (D-L3-8).
 * Runs inside the versionchange transaction: a failure aborts it and the database stays at v3 unchanged.
 * Literal store names on purpose: a released migration must not depend on shared constants.
 */
export const migrationV4: Migration = {
  version: 4,
  description: 'Sync state: syncLedger and syncMeta stores (empty)',
  migrate(db) {
    db.createObjectStore('syncLedger');
    db.createObjectStore('syncMeta');
  },
};
