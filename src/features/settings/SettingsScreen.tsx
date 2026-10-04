import { useId, useState, type ReactNode } from 'react';
import { ConfirmPanel } from '../../components/ConfirmPanel';
import { StateMessage } from '../../components/StateMessage';
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import { NEW_CARD_OPTIONS, REVIEW_LIMIT_OPTIONS } from '../../services/settings/defaults';
import { THEMES, type Theme, type UserSettings } from '../../types/entities';
import { IMPORT_ERROR, TEXT, THEME_LABEL } from './strings';
import { useSettings } from './SettingsProvider';
import { useBackup, type BackupStatus } from './useBackup';

const SELECT = `min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 ${FOCUS_RING}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function StudyLimits() {
  const { status, settings, save, reload } = useSettings();
  const [result, setResult] = useState<'saved' | 'failed' | null>(null);
  const newId = useId();
  const reviewId = useId();
  const themeId = useId();

  const update = async (patch: Partial<UserSettings>) => {
    setResult(null);
    try {
      await save({ ...settings, ...patch });
      setResult('saved');
    } catch {
      setResult('failed');
    }
  };

  return (
    <Section title={TEXT.limits}>
      {status === 'ERROR' && (
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p>{TEXT.loadFailed}</p>
          <button type="button" className={SECONDARY_BUTTON} onClick={() => void reload()}>
            {TEXT.retry}
          </button>
        </div>
      )}
      <label htmlFor={newId} className="text-sm font-medium">
        {TEXT.newCards}
      </label>
      <select id={newId} className={SELECT} value={settings.dailyNewCards} onChange={(e) => void update({ dailyNewCards: Number(e.target.value) })}>
        {NEW_CARD_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label htmlFor={reviewId} className="text-sm font-medium">
        {TEXT.reviews}
      </label>
      <select id={reviewId} className={SELECT} value={settings.dailyReviewLimit} onChange={(e) => void update({ dailyReviewLimit: Number(e.target.value) })}>
        {REVIEW_LIMIT_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label htmlFor={themeId} className="text-sm font-medium">
        {TEXT.theme}
      </label>
      <select id={themeId} className={SELECT} value={settings.theme} onChange={(e) => void update({ theme: e.target.value as Theme })}>
        {THEMES.map((theme) => (
          <option key={theme} value={theme}>
            {THEME_LABEL[theme]}
          </option>
        ))}
      </select>
      <p role="status" className="min-h-5 text-sm">
        {result === 'saved' ? TEXT.saved : result === 'failed' ? TEXT.saveFailed : ''}
      </p>
    </Section>
  );
}

function statusMessage(status: BackupStatus): { text: string; error: boolean } | null {
  switch (status.kind) {
    case 'DONE':
      return {
        text: { EXPORTED: TEXT.exported, IMPORTED: TEXT.imported, RESET_PROGRESS: TEXT.resetDone, RESET_SETTINGS: TEXT.resetSettingsDone }[status.message],
        error: false,
      };
    case 'IMPORT_ERROR':
      return { text: `${IMPORT_ERROR[status.code]} ${TEXT.unchanged}`, error: true };
    case 'ERROR':
      return { text: TEXT.actionFailed, error: true };
    case 'BUSY':
      return { text: TEXT.checking, error: false };
    default:
      return null;
  }
}

export function SettingsScreen({ onExit, onAbout }: { onExit: () => void; onAbout?: () => void }) {
  const backup = useBackup();
  const [confirming, setConfirming] = useState<'progress' | 'settings' | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const fileId = useId();
  const busy = backup.status.kind === 'BUSY';
  const message = statusMessage(backup.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{TEXT.title}</h1>
        <button type="button" className={SECONDARY_BUTTON} onClick={onExit}>
          {TEXT.back}
        </button>
      </div>

      <StudyLimits />

      <Section title={TEXT.backup}>
        {!backup.available ? (
          <StateMessage tone="error" title={TEXT.actionFailed} />
        ) : (
          <>
            <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void backup.exportBackup()}>
              {TEXT.export}
            </button>
            <label htmlFor={fileId} className="text-sm font-medium">
              {TEXT.importLabel}
            </label>
            <input
              key={fileKey}
              id={fileId}
              type="file"
              accept=".json,application/json"
              disabled={busy}
              className={`min-h-12 w-full text-sm ${FOCUS_RING}`}
              onChange={(e) => void backup.chooseFile(e.target.files?.[0])}
            />
            {backup.status.kind === 'CONFIRM_IMPORT' && (
              <ImportConfirm
                status={backup.status}
                onConfirm={(plan) => void backup.confirmImport(plan)}
                onCancel={() => {
                  backup.dismiss();
                  setFileKey((k) => k + 1);
                }}
              />
            )}
          </>
        )}
      </Section>

      {onAbout !== undefined && (
        <Section title={TEXT.about}>
          <button type="button" className={SECONDARY_BUTTON} onClick={onAbout}>
            {TEXT.openAbout}
          </button>
        </Section>
      )}

      <Section title={TEXT.danger}>
        {confirming === 'progress' ? (
          <ConfirmPanel
            title={TEXT.resetProgress}
            acknowledge={TEXT.understand}
            confirmLabel={TEXT.confirmReset}
            cancelLabel={TEXT.cancel}
            busy={busy}
            onConfirm={() => {
              setConfirming(null);
              void backup.resetAllProgress();
            }}
            onCancel={() => setConfirming(null)}
          >
            <p>{TEXT.resetProgressWarning}</p>
          </ConfirmPanel>
        ) : confirming === 'settings' ? (
          <ConfirmPanel
            title={TEXT.resetSettings}
            acknowledge={TEXT.understand}
            confirmLabel={TEXT.confirmResetSettings}
            cancelLabel={TEXT.cancel}
            busy={busy}
            onConfirm={() => {
              setConfirming(null);
              void backup.resetAllSettings();
            }}
            onCancel={() => setConfirming(null)}
          >
            <p>{TEXT.resetSettingsWarning}</p>
          </ConfirmPanel>
        ) : (
          <div className="flex flex-col gap-2">
            <button type="button" className={SECONDARY_BUTTON} disabled={busy || !backup.available} onClick={() => setConfirming('progress')}>
              {TEXT.resetProgress}
            </button>
            <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming('settings')}>
              {TEXT.resetSettings}
            </button>
          </div>
        )}
      </Section>

      <p role={message?.error === true ? 'alert' : 'status'} className="min-h-6 text-sm">
        {message?.text ?? ''}
      </p>
    </div>
  );
}

function ImportConfirm({
  status,
  onConfirm,
  onCancel,
}: {
  status: Extract<BackupStatus, { kind: 'CONFIRM_IMPORT' }>;
  onConfirm: (plan: Extract<BackupStatus, { kind: 'CONFIRM_IMPORT' }>['plan']) => void;
  onCancel: () => void;
}) {
  const { plan } = status;
  return (
    <ConfirmPanel title={TEXT.importWarningTitle} acknowledge={TEXT.understand} confirmLabel={TEXT.importConfirm} cancelLabel={TEXT.cancel} onConfirm={() => onConfirm(plan)} onCancel={onCancel}>
      <p className="mb-2 font-medium">{TEXT.importWarning}</p>
      {plan.datasetWarning !== null && (
        <p role="alert" className="mb-2 rounded-lg border-2 border-amber-600 bg-amber-50 p-2 font-medium text-amber-950 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-100">
          ⚠ {TEXT.datasetWarning(plan.datasetWarning.backupVersion, plan.datasetWarning.currentVersion)}
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt>{TEXT.summaryDate}</dt>
        <dd>{plan.exportedAt}</dd>
        <dt>{TEXT.summaryDataset}</dt>
        <dd>{plan.datasetVersion}</dd>
        <dt>{TEXT.summaryCards}</dt>
        <dd>{plan.counts.reviewCards}</dd>
        <dt>{TEXT.summaryLogs}</dt>
        <dd>{plan.counts.reviewLogs}</dd>
        <dt>{TEXT.summarySessions}</dt>
        <dd>{plan.counts.studySessions}</dd>
        <dt>{TEXT.summarySettings}</dt>
        <dd>{plan.hasSettings ? TEXT.yes : TEXT.no}</dd>
      </dl>
    </ConfirmPanel>
  );
}
