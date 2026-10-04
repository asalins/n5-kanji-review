import { z } from 'zod';
import { isValidSettings } from '../settings/settingsRules';
import { BackupError } from './backupErrors';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, backupHeaderSchema, backupV1Schema, type BackupV1 } from './backupSchema';

/** Untrusted text -> JSON value. Nothing in it is ever executed or rendered as HTML. */
export function parseBackupText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new BackupError('INVALID_JSON', 'The file is not valid JSON', { cause });
  }
}

function findDuplicate(ids: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return null;
}

/**
 * Envelope -> every record -> integrity. Throws BackupError; returns a fully validated backup.
 * Integrity: no duplicate id in any collection, every ReviewLog.cardId is one of the backup's cards,
 * settings follow the product rules. StudySession.cardIds are deliberately not enforced.
 */
export function validateBackup(raw: unknown): BackupV1 {
  const header = backupHeaderSchema.safeParse(raw);
  if (!header.success || header.data.format !== BACKUP_FORMAT) {
    throw new BackupError('INVALID_BACKUP_FORMAT', 'This file is not a backup of this application');
  }
  if (header.data.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError('UNSUPPORTED_FORMAT_VERSION', `Unsupported backup format version ${header.data.formatVersion}`);
  }

  const parsed = backupV1Schema.safeParse(raw);
  if (!parsed.success) {
    // data.<collection>.<index>... (or data.userSettings.<field>) is a bad record; anything shallower is a broken envelope.
    const inData = parsed.error.issues.some((issue) => issue.path[0] === 'data' && issue.path.length >= 3);
    throw new BackupError(inData ? 'INVALID_RECORD' : 'INVALID_BACKUP_FORMAT', z.prettifyError(parsed.error), {
      cause: parsed.error,
    });
  }
  const backup = parsed.data;
  const { reviewCards, reviewLogs, studySessions, userSettings } = backup.data;

  for (const [what, ids] of [
    ['review card', reviewCards.map((c) => c.id)],
    ['review log', reviewLogs.map((l) => l.id)],
    ['study session', studySessions.map((s) => s.id)],
  ] as const) {
    const duplicate = findDuplicate(ids);
    if (duplicate !== null) throw new BackupError('INVALID_RECORD', `Duplicate ${what} id: ${duplicate}`);
  }

  const cardIds = new Set(reviewCards.map((c) => c.id));
  const orphan = reviewLogs.find((log) => !cardIds.has(log.cardId));
  if (orphan !== undefined) throw new BackupError('INVALID_RECORD', `Review log ${orphan.id} refers to a missing card`);

  if (userSettings !== null && !isValidSettings(userSettings)) {
    throw new BackupError('INVALID_RECORD', 'The backup settings are outside the allowed values');
  }
  return backup;
}
