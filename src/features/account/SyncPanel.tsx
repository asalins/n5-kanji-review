import { useState } from 'react';
import { ConfirmPanel } from '../../components/ConfirmPanel';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import type { BindingChoice } from '../../services/sync/syncService';
import { SYNC_TEXT as T } from './strings';
import { useSync, useSyncLog } from './useSync';

const time = (ms: number) => new Date(ms).toLocaleString();

/**
 * Settings → Account → Sync (L3b). Shows what sync is doing and asks the user every decision that could
 * upload or delete learning data: binding this device to the account (D-L3-8) and a reset made elsewhere (D6).
 */
export function SyncPanel({ email }: { email: string }) {
  const { service, status } = useSync();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'replace-local' | 'accept-reset' | null>(null);
  const [failed, setFailed] = useState(false);
  if (service === null) return null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await fn();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };
  const choose = (choice: BindingChoice) => act(() => service.resolveBinding(choice));
  const syncNow = (
    <button type="button" className={SECONDARY_BUTTON} disabled={busy || status.kind === 'syncing'} onClick={() => void act(() => service.syncNow())}>
      {T.syncNow}
    </button>
  );

  return (
    <div data-testid="sync-panel" className="flex flex-col gap-2 rounded-xl border border-stone-300 p-3 dark:border-neutral-600">
      <h3 className="font-semibold">{T.title}</h3>
      <div role="status" data-testid="sync-status" className="flex flex-col gap-2 text-sm">
        {status.kind === 'off' && <p>{T.waiting}</p>}
        {status.kind === 'syncing' && <p>{T.syncing}</p>}
        {status.kind === 'offline' && <p>{T.offline}</p>}
        {status.kind === 'idle' && (
          <>
            <p>{status.lastSyncAt === null ? T.never : `${T.synced}: ${time(status.lastSyncAt)}`}</p>
            {syncNow}
          </>
        )}
        {status.kind === 'paused-quota' && <p>{`${T.quota} ${time(status.retryAt)}`}</p>}
        {status.kind === 'error' && (
          <>
            <p>{`${T.error} ${time(status.retryAt)}`}</p>
            {syncNow}
          </>
        )}
        {status.kind === 'declined' && (
          <>
            <p>{T.declined}</p>
            <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => void act(() => service.enable())}>
              {T.enable}
            </button>
          </>
        )}
      </div>

      {status.kind === 'needs-binding' && confirming === null && (
        <div role="dialog" aria-label={status.reason === 'unbound' ? T.bindTitle : T.otherTitle} className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">{status.reason === 'unbound' ? T.bindTitle : T.otherTitle}</p>
          <p className="break-all">{email}</p>
          <p>{status.reason === 'unbound' ? T.bindExplain : T.otherExplain}</p>
          {status.reason === 'unbound' && (
            <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void choose('upload')}>
              {T.bindUpload}
            </button>
          )}
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming('replace-local')}>
            {T.replaceLocal}
          </button>
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => void choose('skip')}>
            {T.skip}
          </button>
        </div>
      )}

      {status.kind === 'remote-reset' && confirming === null && (
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">{T.resetTitle}</p>
          <p>{status.resetAt === null ? T.resetUnknownWhen : `${T.resetWhen} ${time(status.resetAt)}`}</p>
          <p>
            {T.resetUnsynced} <strong data-testid="sync-unsynced">{status.unsynced}</strong>
          </p>
          <p>{T.resetExplain}</p>
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming('accept-reset')}>
            {T.resetAccept}
          </button>
        </div>
      )}

      {confirming !== null && (
        <ConfirmPanel
          title={confirming === 'replace-local' ? T.replaceLocal : T.resetAccept}
          acknowledge={T.understand}
          confirmLabel={confirming === 'replace-local' ? T.replaceLocal : T.resetAccept}
          cancelLabel={T.cancel}
          busy={busy}
          onConfirm={() => void (confirming === 'replace-local' ? choose('replace-local') : act(() => service.acceptRemoteReset()))}
          onCancel={() => setConfirming(null)}
        >
          <p>{confirming === 'replace-local' ? T.replaceLocalExplain : T.resetAcceptExplain}</p>
        </ConfirmPanel>
      )}
      {failed && (
        <p role="alert" className="text-sm">
          {T.failed}
        </p>
      )}
      <SyncLogView />
    </div>
  );
}

/** F5: what sync decided on this device (local diagnostics). */
function SyncLogView() {
  const entries = useSyncLog();
  return (
    <details data-testid="sync-log" className="text-xs">
      <summary className="min-h-11 cursor-pointer py-3 underline underline-offset-4">{T.logTitle}</summary>
      <p className="mb-2">{T.logNote}</p>
      {entries.length === 0 ? (
        <p>{T.logEmpty}</p>
      ) : (
        <ol className="flex flex-col gap-1 font-mono">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              {new Date(e.at).toLocaleString()} [{e.tab}] {e.event}
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
