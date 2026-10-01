import type { Migration } from '../database';
import { migrationV1 } from './v1Initial';
import { migrationV2 } from './v2ContentMeta';

/**
 * Ordered migration history. To change the schema, append a new migration (v2, v3 ...);
 * never edit an earlier one. Current version = highest version in this list.
 */
export const APP_MIGRATIONS: readonly Migration[] = [migrationV1, migrationV2];
