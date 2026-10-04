import { AppError } from '../../utils/errors';

export type BackupErrorCode =
  | 'INVALID_FILE'
  | 'INVALID_JSON'
  | 'INVALID_BACKUP_FORMAT'
  | 'UNSUPPORTED_FORMAT_VERSION'
  | 'DATASET_MISMATCH'
  | 'ALGORITHM_MISMATCH'
  | 'INVALID_RECORD'
  | 'IMPORT_TRANSACTION_FAILED';

/** A rejected or failed import. Whatever the code, the existing learning data has not been changed. */
export class BackupError extends AppError {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
