// The only SRS import allowed here: the version label. Import never runs the algorithm.
import { SRS_ALGORITHM_VERSION } from '../srs/constants';
import { BackupError } from './backupErrors';
import type { BackupV1 } from './backupSchema';

export const CURRENT_ALGORITHM_VERSION = SRS_ALGORITHM_VERSION;

interface CurrentEnvironment {
  /** Dataset version loaded in the content stores now. */
  readonly datasetVersion: string | null;
  /** Ids of the kanji in the current dataset. */
  readonly kanjiIds: ReadonlySet<string>;
  readonly algorithmVersion: string;
}

/** Shown before an import whose backup came from another dataset version (mandatory, never optional). */
export interface DatasetWarning {
  readonly backupVersion: string;
  readonly currentVersion: string;
}

export interface CompatibilityResult {
  /** null when the dataset versions are equal. */
  readonly datasetWarning: DatasetWarning | null;
}

/**
 * Rules (Phase 12 approved policy; no mapping or guessing):
 *  - the backup's dataset version must be known (null -> reject);
 *  - same dataset version -> compatible;
 *  - another dataset version -> compatible ONLY if every card is a kanji item that exists in the current dataset
 *    (kanji ids are code points, so they identify the same kanji across versions), with a mandatory warning;
 *    a single missing item -> DATASET_MISMATCH;
 *  - the backup's algorithm version, and every card's, must equal the current one (unchanged).
 */
export function assertCompatible(backup: BackupV1, current: CurrentEnvironment): CompatibilityResult {
  if (backup.datasetVersion === null || current.datasetVersion === null) {
    throw new BackupError(
      'DATASET_MISMATCH',
      `Backup dataset ${String(backup.datasetVersion)} or current dataset ${String(current.datasetVersion)} is unknown`,
    );
  }
  if (backup.algorithmVersion !== current.algorithmVersion) {
    throw new BackupError('ALGORITHM_MISMATCH', `Backup algorithm ${backup.algorithmVersion} is not ${current.algorithmVersion}`);
  }
  const otherAlgorithm = backup.data.reviewCards.find((card) => card.algorithmVersion !== current.algorithmVersion);
  if (otherAlgorithm !== undefined) {
    throw new BackupError('ALGORITHM_MISMATCH', `Card ${otherAlgorithm.id} uses algorithm ${otherAlgorithm.algorithmVersion}`);
  }
  // Checked for every backup (same version too): each card must point at a kanji of the current dataset.
  const unknownItem = backup.data.reviewCards.find((card) => card.itemType !== 'kanji' || !current.kanjiIds.has(card.itemId));
  if (unknownItem !== undefined) {
    throw new BackupError('DATASET_MISMATCH', `Card ${unknownItem.id} refers to an item that is not in the current dataset`);
  }
  if (backup.datasetVersion !== current.datasetVersion) {
    return { datasetWarning: { backupVersion: backup.datasetVersion, currentVersion: current.datasetVersion } };
  }
  return { datasetWarning: null };
}
