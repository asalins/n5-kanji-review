import { z } from 'zod';
import { reviewCardSchema, reviewLogSchema, studySessionSchema, userSettingsSchema } from '../../types/schemas';

/** Identifies the file type; independent from datasetVersion, algorithmVersion and the database schema version. */
export const BACKUP_FORMAT = 'n5-kanji-review-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** Read first, loosely, so a wrong file and an unsupported version can be told apart from bad content. */
export const backupHeaderSchema = z.object({ format: z.string(), formatVersion: z.number() });

/** Format version 1. Records reuse the application's own entity schemas (no second copy of them). */
export const backupV1Schema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.iso.datetime(),
  /** Audit metadata only: never a reason to migrate or reject. */
  databaseSchemaVersion: z.number().int().positive(),
  datasetVersion: z.string().min(1).nullable(),
  algorithmVersion: z.string().min(1),
  data: z.object({
    reviewCards: z.array(reviewCardSchema),
    reviewLogs: z.array(reviewLogSchema),
    studySessions: z.array(studySessionSchema),
    userSettings: userSettingsSchema.nullable(),
  }),
});

export type BackupV1 = z.infer<typeof backupV1Schema>;
