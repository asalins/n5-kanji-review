import { z } from 'zod';
import { LEARNING_STATES, REVIEW_RATINGS, STUDY_MODES, THEMES, UI_LANGUAGES } from '../../types/common';
import { reviewCardSchema, reviewLogSchema, studySessionSchema, userSettingsSchema } from '../../types/schemas';

/** Identifies the file type; independent from datasetVersion, algorithmVersion and the database schema version. */
export const BACKUP_FORMAT = 'n5-kanji-review-backup';
/** Written by export. Import reads 1 and 2. */
export const BACKUP_FORMAT_VERSION = 2;
export const SUPPORTED_BACKUP_FORMAT_VERSIONS: readonly number[] = [1, 2];

/** Read first, loosely, so a wrong file and an unsupported version can be told apart from bad content. */
export const backupHeaderSchema = z.object({ format: z.string(), formatVersion: z.number() });

const envelope = {
  format: z.literal(BACKUP_FORMAT),
  exportedAt: z.iso.datetime(),
  /** Audit metadata only: never a reason to migrate or reject. */
  databaseSchemaVersion: z.number().int().positive(),
  datasetVersion: z.string().min(1).nullable(),
  algorithmVersion: z.string().min(1),
};

/**
 * Format version 2 (schema v3). Records reuse the application's own entity schemas (no second copy of them):
 * ReviewLog carries its provenance (deviceId, originalId) and UserSettings its updatedAt.
 * The installation identity (DeviceMeta) is NEVER part of a backup.
 */
export const backupV2Schema = z.object({
  ...envelope,
  formatVersion: z.literal(2),
  data: z.object({
    reviewCards: z.array(reviewCardSchema),
    reviewLogs: z.array(reviewLogSchema),
    studySessions: z.array(studySessionSchema),
    userSettings: userSettingsSchema.nullable(),
  }),
});

export type BackupV2 = z.infer<typeof backupV2Schema>;
/** The current backup shape; a version 1 file is converted to it on import (see upgradeBackupV1). */
export type Backup = BackupV2;

// ---- format version 1 (frozen: what the app wrote up to schema v2; read only, never written) ----
const id = z.string().min(1);
const epochMs = z.number().int().nonnegative();

const reviewLogV1Schema = z.object({
  id,
  cardId: id,
  rating: z.enum(REVIEW_RATINGS),
  reviewedAt: epochMs,
  durationMs: z.number().int().nonnegative(),
  stateBefore: z.enum(LEARNING_STATES),
  stateAfter: z.enum(LEARNING_STATES),
  datasetVersion: z.string().min(1).nullable(),
});

const userSettingsV1Schema = z.object({
  dailyNewCards: z.number().int().positive(),
  dailyReviewLimit: z.number().int().positive(),
  theme: z.enum(THEMES),
  uiLanguage: z.enum(UI_LANGUAGES),
  soundEnabled: z.boolean(),
  autoPlay: z.boolean(),
  studyMode: z.enum(STUDY_MODES),
  animationsEnabled: z.boolean(),
});

export const backupV1Schema = z.object({
  ...envelope,
  formatVersion: z.literal(1),
  data: z.object({
    reviewCards: z.array(reviewCardSchema),
    reviewLogs: z.array(reviewLogV1Schema),
    studySessions: z.array(studySessionSchema),
    userSettings: userSettingsV1Schema.nullable(),
  }),
});

export type BackupV1 = z.infer<typeof backupV1Schema>;

/**
 * v1 -> current shape, changing no learning data: log ids and every field stay as they were; logs get
 * deviceId: null (origin unknown) and originalId: null; settings get updatedAt: 0 (unknown / oldest).
 */
export function upgradeBackupV1(backup: BackupV1): Backup {
  const { reviewCards, reviewLogs, studySessions, userSettings } = backup.data;
  return {
    ...backup,
    formatVersion: 2,
    data: {
      reviewCards,
      reviewLogs: reviewLogs.map((log) => ({ ...log, deviceId: null, originalId: null })),
      studySessions,
      userSettings: userSettings === null ? null : { ...userSettings, updatedAt: 0 },
    },
  };
}
