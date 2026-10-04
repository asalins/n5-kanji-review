import type { BackupRepository, KanjiRepository, SettingsRepository, UserDataSnapshot } from '../../repositories/interfaces';
import type { JlptLevel } from '../../types/entities';
import { localDay } from '../../utils/localDay';
import { DEFAULT_USER_SETTINGS } from '../settings/defaults';
import { assertCompatible, CURRENT_ALGORITHM_VERSION, type DatasetWarning } from './backupCompatibility';
import { BackupError } from './backupErrors';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type BackupV1 } from './backupSchema';
import { parseBackupText, validateBackup } from './validateBackup';

/** The dataset level whose kanji ids backups are checked against. */
const BACKUP_LEVEL: JlptLevel = 'N5';

export interface BackupDeps {
  readonly backup: BackupRepository;
  readonly kanji: Pick<KanjiRepository, 'getDatasetVersion' | 'getByLevel'>;
  readonly now: () => number;
}

/** Export: reads the user data (one snapshot) and wraps it in a versioned envelope. Changes nothing. */
export async function createBackup(deps: BackupDeps): Promise<{ readonly backup: BackupV1; readonly fileName: string }> {
  const [data, datasetVersion] = await Promise.all([deps.backup.readUserData(), deps.kanji.getDatasetVersion()]);
  const nowMs = deps.now();
  const backup: BackupV1 = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date(nowMs).toISOString(),
    databaseSchemaVersion: data.databaseSchemaVersion,
    datasetVersion,
    algorithmVersion: CURRENT_ALGORITHM_VERSION,
    data: {
      reviewCards: [...data.reviewCards],
      reviewLogs: [...data.reviewLogs],
      studySessions: [...data.studySessions],
      userSettings: data.userSettings,
    },
  };
  return { backup, fileName: `n5-kanji-backup-${localDay(nowMs).key}.json` };
}

export interface ImportPlan {
  readonly exportedAt: string;
  readonly datasetVersion: string;
  readonly counts: { readonly reviewCards: number; readonly reviewLogs: number; readonly studySessions: number };
  readonly hasSettings: boolean;
  /** Present when the backup came from another dataset version: must be shown before the user confirms. */
  readonly datasetWarning: DatasetWarning | null;
  /** The dataset version the backup was checked against; restore refuses if it changed meanwhile. */
  readonly checkedDatasetVersion: string;
  readonly snapshot: UserDataSnapshot;
}

/** Parse -> validate -> compatibility. Writes nothing; the plan is shown to the user for confirmation. */
export async function prepareImport(deps: BackupDeps, text: string): Promise<ImportPlan> {
  const backup = validateBackup(parseBackupText(text));
  const [datasetVersion, kanji] = await Promise.all([deps.kanji.getDatasetVersion(), deps.kanji.getByLevel(BACKUP_LEVEL)]);
  const { datasetWarning } = assertCompatible(backup, {
    datasetVersion,
    kanjiIds: new Set(kanji.map((k) => k.id)),
    algorithmVersion: CURRENT_ALGORITHM_VERSION,
  });
  const { reviewCards, reviewLogs, studySessions, userSettings } = backup.data;
  return {
    exportedAt: backup.exportedAt,
    datasetVersion: backup.datasetVersion ?? '',
    counts: { reviewCards: reviewCards.length, reviewLogs: reviewLogs.length, studySessions: studySessions.length },
    hasSettings: userSettings !== null,
    datasetWarning,
    checkedDatasetVersion: datasetVersion ?? '',
    snapshot: { reviewCards, reviewLogs, studySessions, userSettings },
  };
}

/** Replace/Restore after confirmation: one atomic transaction; on failure nothing has changed. */
export async function applyImport(deps: BackupDeps, plan: ImportPlan): Promise<void> {
  const current = await deps.kanji.getDatasetVersion();
  if (current !== plan.checkedDatasetVersion) {
    throw new BackupError('DATASET_MISMATCH', 'The dataset changed after the backup was checked');
  }
  try {
    await deps.backup.replaceUserData(plan.snapshot);
  } catch (cause) {
    throw new BackupError('IMPORT_TRANSACTION_FAILED', 'The backup could not be restored', { cause });
  }
}

/** Deletes cards, logs and sessions in one transaction. Settings, dataset and contentMeta stay. */
export function resetProgress(deps: Pick<BackupDeps, 'backup'>): Promise<void> {
  return deps.backup.resetProgress();
}

/** Puts the approved defaults back (an explicit user action, never automatic). */
export function resetSettings(settings: SettingsRepository): Promise<void> {
  return settings.save(DEFAULT_USER_SETTINGS);
}
