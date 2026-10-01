import type { Migration } from '../database';

/**
 * v2: adds the contentMeta store (single out-of-line-keyed record) that remembers which dataset
 * version the content stores hold. User-data stores are untouched.
 * Literal store name on purpose: released migrations must not depend on shared constants.
 */
export const migrationV2: Migration = {
  version: 2,
  description: 'Add contentMeta store (loaded dataset version)',
  migrate(db) {
    db.createObjectStore('contentMeta');
  },
};
