import { useId, useState } from 'react';
import { ConfirmPanel } from '../../components/ConfirmPanel';
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import type { DeleteAccountResult, SignInResult, SignOutResult } from '../../services/account';
import { ACCOUNT_TEXT as T } from './strings';
import { SyncPanel } from './SyncPanel';
import { useAccount } from './useAccount';

type Message = { readonly lines: readonly string[]; readonly error: boolean; readonly retryLocal?: boolean };

function signInMessage(result: SignInResult): Message | null {
  if (result.ok || result.reason === 'cancelled') return null;
  if (result.reason === 'popup-blocked') return { lines: [T.signInBlocked], error: true };
  if (result.reason === 'network') return { lines: [T.signInNetwork], error: true };
  return { lines: [T.signInFailed], error: true };
}

function localLine(local: SignOutResult['localData']): string {
  return local === 'deleted' ? T.localDeleted : local === 'failed' ? T.localFailed : T.localKept;
}

/** C2: one line per part; never "everything deleted". */
export function deleteMessage(result: DeleteAccountResult): Message {
  if (result.account === 'not-deleted') return { lines: [T.deleteCancelled], error: false };
  if (result.cloudData === 'failed') return { lines: [T.cloudFailed], error: true };
  if (result.account === 'failed' && result.cloudData === 'deleted') return { lines: [T.cloudDeleted, T.accountFailedAfterCloud], error: true };
  if (result.account === 'failed') return { lines: [result.reason === 'network' ? T.deleteNetwork : T.deleteFailed], error: true };
  const cloud = result.cloudData === 'deleted' ? T.cloudDeleted : T.noCloudData;
  return { lines: [T.accountDeleted, cloud, localLine(result.localData)], error: result.localData === 'failed', retryLocal: result.localData === 'failed' };
}

function LocalChoice({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="delete-local-progress" />
        {T.deleteLocal}
      </label>
      <p className="text-sm">{T.sharedDevice}</p>
    </>
  );
}

/** Settings → Account (L2). Not rendered at all when the account feature is unavailable (no config / no contact). */
export function AccountSection({ onPrivacy }: { onPrivacy: () => void }) {
  const { service, status } = useAccount();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'signout' | 'delete' | null>(null);
  const [deleteLocal, setDeleteLocal] = useState(false); // never pre-ticked (D-L2-2)
  const [message, setMessage] = useState<Message | null>(null);

  if (service === null || status.kind === 'unavailable') return null;

  const run = async (action: () => Promise<Message | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await action());
    } finally {
      setBusy(false);
      setConfirming(null);
      setDeleteLocal(false);
    }
  };

  const signedIn = status.kind === 'signed-in' || status.kind === 'signed-in-offline';

  return (
    <section aria-labelledby={id} data-testid="account-section" className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
      <h2 id={id} className="text-lg font-semibold">
        {T.title}
      </h2>

      {status.kind === 'signed-out' && (
        <>
          <p className="text-sm">{T.optional}</p>
          {status.notice === 'account-invalid' && (
            <p role="status" className="text-sm font-medium">
              {T.accountInvalid}
            </p>
          )}
          <button type="button" className={`${SECONDARY_BUTTON} underline`} onClick={onPrivacy}>
            {T.readPrivacy}
          </button>
          <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void run(async () => signInMessage(await service.signIn()))}>
            {busy ? T.busy : T.signIn}
          </button>
        </>
      )}

      {status.kind === 'checking' && <p role="status">{status.offline ? T.checkingOffline : T.checking}</p>}

      {signedIn && (
        <>
          <p className="break-all">
            {T.signedInAs} <strong data-testid="account-email">{status.user.email ?? status.user.uid}</strong>
          </p>
          {status.kind === 'signed-in-offline' && <p className="text-sm">{T.offlineSignedIn}</p>}
          <SyncPanel email={status.user.email ?? status.user.uid} />
          {confirming === null && (
            <>
              <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming('signout')}>
                {T.signOut}
              </button>
              <p className="text-sm">{T.signOutScope}</p>
              <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming('delete')}>
                {T.deleteAccount}
              </button>
              <button type="button" className={`inline-flex min-h-11 items-center underline underline-offset-4 ${FOCUS_RING}`} onClick={onPrivacy}>
                {T.privacy}
              </button>
            </>
          )}
          {confirming === 'signout' && (
            <div role="dialog" aria-label={T.signOut} className="flex flex-col gap-3 rounded-xl border border-stone-300 p-4 dark:border-neutral-600">
              <p className="text-sm">{T.signOutScope}</p>
              <LocalChoice checked={deleteLocal} onChange={setDeleteLocal} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${PRIMARY_BUTTON} flex-1`}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await service.signOut({ deleteLocalProgress: deleteLocal });
                      if (!result.signedOut) return { lines: [T.signOutFailed], error: true };
                      return { lines: [T.signedOut, localLine(result.localData)], error: result.localData === 'failed', retryLocal: result.localData === 'failed' };
                    })
                  }
                >
                  {T.signOutConfirm}
                </button>
                <button type="button" className={`${SECONDARY_BUTTON} flex-1`} disabled={busy} onClick={() => setConfirming(null)}>
                  {T.cancel}
                </button>
              </div>
            </div>
          )}
          {confirming === 'delete' && (
            <ConfirmPanel
              title={T.deleteAccount}
              acknowledge={T.understand}
              confirmLabel={T.deleteConfirm}
              cancelLabel={T.cancel}
              busy={busy}
              onConfirm={() => void run(async () => deleteMessage(await service.deleteAccount({ deleteLocalProgress: deleteLocal })))}
              onCancel={() => {
                setConfirming(null);
                setDeleteLocal(false);
              }}
            >
              <p>{T.deleteExplain}</p>
              <LocalChoice checked={deleteLocal} onChange={setDeleteLocal} />
            </ConfirmPanel>
          )}
        </>
      )}

      <div role={message?.error === true ? 'alert' : 'status'} data-testid="account-message" className="flex min-h-6 flex-col gap-1 text-sm">
        {message?.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {message?.retryLocal === true && (
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const local = await service.retryLocalDelete();
                return { lines: [localLine(local)], error: local === 'failed', retryLocal: local === 'failed' };
              })
            }
          >
            {T.retryLocal}
          </button>
        )}
      </div>
    </section>
  );
}
