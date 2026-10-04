import { useCallback, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import { BackupError, type BackupErrorCode } from '../../services/backup/backupErrors';
import { applyImport, createBackup, prepareImport, resetProgress, resetSettings, type ImportPlan } from '../../services/backup/backupService';
import { logError } from '../../utils/userMessage';
import { downloadTextFile } from './downloadFile';
import { useSettings } from './SettingsProvider';

export type BackupStatus =
  | { readonly kind: 'IDLE' }
  | { readonly kind: 'BUSY' }
  | { readonly kind: 'CONFIRM_IMPORT'; readonly plan: ImportPlan }
  | { readonly kind: 'DONE'; readonly message: 'EXPORTED' | 'IMPORTED' | 'RESET_PROGRESS' | 'RESET_SETTINGS' }
  | { readonly kind: 'IMPORT_ERROR'; readonly code: BackupErrorCode }
  | { readonly kind: 'ERROR' };

interface Options {
  /** Injected clock for the export date (the default is the only place this feature reads it). */
  readonly now?: () => number;
}

/**
 * Backup actions for the settings page. Every write goes through services/backup -> BackupRepository (one
 * transaction each). After an import or a reset the settings are read again; other screens reload on open.
 */
export function useBackup({ now = Date.now }: Options = {}) {
  const { backup, kanji, settings: settingsRepository } = useRepositories();
  const { reload } = useSettings();
  const [status, setStatus] = useState<BackupStatus>({ kind: 'IDLE' });
  const available = backup !== undefined;

  const run = useCallback(
    async (action: () => Promise<BackupStatus>, onError: (error: unknown) => BackupStatus) => {
      setStatus({ kind: 'BUSY' });
      try {
        setStatus(await action());
      } catch (error) {
        logError(error);
        setStatus(onError(error));
      }
    },
    [],
  );

  const exportBackup = useCallback(
    () =>
      run(
        async () => {
          if (backup === undefined) throw new Error('Backup is not available');
          const { backup: file, fileName } = await createBackup({ backup, kanji, now });
          downloadTextFile(fileName, JSON.stringify(file, null, 2));
          return { kind: 'DONE', message: 'EXPORTED' };
        },
        () => ({ kind: 'ERROR' }),
      ),
    [run, backup, kanji, now],
  );

  const chooseFile = useCallback(
    (file: File | undefined) =>
      run(
        async () => {
          if (backup === undefined) throw new Error('Backup is not available');
          if (file === undefined) throw new BackupError('INVALID_FILE', 'No file was chosen');
          let text: string;
          try {
            text = await file.text();
          } catch (cause) {
            throw new BackupError('INVALID_FILE', 'The file could not be read', { cause });
          }
          const plan = await prepareImport({ backup, kanji, now }, text);
          return { kind: 'CONFIRM_IMPORT', plan };
        },
        (error) => (error instanceof BackupError ? { kind: 'IMPORT_ERROR', code: error.code } : { kind: 'ERROR' }),
      ),
    [run, backup, kanji, now],
  );

  const confirmImport = useCallback(
    (plan: ImportPlan) =>
      run(
        async () => {
          if (backup === undefined) throw new Error('Backup is not available');
          await applyImport({ backup, kanji, now }, plan);
          await reload();
          return { kind: 'DONE', message: 'IMPORTED' };
        },
        (error) => (error instanceof BackupError ? { kind: 'IMPORT_ERROR', code: error.code } : { kind: 'ERROR' }),
      ),
    [run, backup, kanji, now, reload],
  );

  const resetAllProgress = useCallback(
    () =>
      run(
        async () => {
          if (backup === undefined) throw new Error('Backup is not available');
          await resetProgress({ backup });
          return { kind: 'DONE', message: 'RESET_PROGRESS' };
        },
        () => ({ kind: 'ERROR' }),
      ),
    [run, backup],
  );

  const resetAllSettings = useCallback(
    () =>
      run(
        async () => {
          if (settingsRepository === undefined) throw new Error('Settings are not available');
          await resetSettings(settingsRepository);
          await reload();
          return { kind: 'DONE', message: 'RESET_SETTINGS' };
        },
        () => ({ kind: 'ERROR' }),
      ),
    [run, settingsRepository, reload],
  );

  const dismiss = useCallback(() => setStatus({ kind: 'IDLE' }), []);

  return { status, available, exportBackup, chooseFile, confirmImport, resetAllProgress, resetAllSettings, dismiss };
}
