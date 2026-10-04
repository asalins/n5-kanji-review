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

/**
 * Strict rules, no mapping or guessing:
 *  - the backup's dataset version must equal the current one (and be known);
 *  - the backup's algorithm version, and every card's, must equal the current one;
 *  - every card must point at a kanji of the current dataset.
 */
export function assertCompatible(backup: BackupV1, current: CurrentEnvironment): void {
  if (backup.datasetVersion === null || current.datasetVersion === null || backup.datasetVersion !== current.datasetVersion) {
    throw new BackupError(
      'DATASET_MISMATCH',
      `Backup dataset ${String(backup.datasetVersion)} does not match the current dataset ${String(current.datasetVersion)}`,
    );
  }
  if (backup.algorithmVersion !== current.algorithmVersion) {
    throw new BackupError('ALGORITHM_MISMATCH', `Backup algorithm ${backup.algorithmVersion} is not ${current.algorithmVersion}`);
  }
  const otherAlgorithm = backup.data.reviewCards.find((card) => card.algorithmVersion !== current.algorithmVersion);
  if (otherAlgorithm !== undefined) {
    throw new BackupError('ALGORITHM_MISMATCH', `Card ${otherAlgorithm.id} uses algorithm ${otherAlgorithm.algorithmVersion}`);
  }
  const unknownItem = backup.data.reviewCards.find((card) => card.itemType !== 'kanji' || !current.kanjiIds.has(card.itemId));
  if (unknownItem !== undefined) {
    throw new BackupError('DATASET_MISMATCH', `Card ${unknownItem.id} refers to an item that is not in the current dataset`);
  }
}
