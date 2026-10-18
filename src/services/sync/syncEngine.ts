import type { SyncRepository } from '../../repositories/interfaces';
import type { SyncMeta } from '../../types/entities';
import { newUuid } from '../../utils/uuid';
import { CloudError, PULL_PAGE, PUSH_BATCH, type CloudRoot, type CloudStore } from './cloudTypes';
import type { SyncLogAddOptions } from './syncLog';

/**
 * One sync cycle (L3b). Order: gate -> binding -> root/epoch -> pending replace -> pull -> push -> settings.
 *  - Only ReviewLogs and UserSettings travel; cards are recomputed from logs on every change (D4).
 *  - Logs are create-only on the cloud; a log is "synced" when it has a ledger entry.
 *  - Epoch (D6): a device that has not learned about a reset uploads nothing (the rules refuse it too).
 * Never deletes local learning data except on an explicit user decision made elsewhere (acceptRemoteReset /
 * forgetLocalProgress). Any cloud failure throws CloudError; what has been stored so far stays stored.
 */

export type SyncOutcome =
  | { readonly kind: 'no-user' }
  | { readonly kind: 'needs-binding'; readonly reason: 'unbound' | 'other-account'; readonly uid: string }
  | { readonly kind: 'declined'; readonly uid: string }
  | { readonly kind: 'remote-reset'; readonly uid: string; readonly epoch: number; readonly resetAt: number | null; readonly unsynced: number }
  | {
      readonly kind: 'synced';
      readonly uid: string;
      readonly pulled: number;
      readonly pushed: number;
      readonly renamed: number;
      readonly cardsUpdated: number;
      readonly settings: 'kept' | 'uploaded' | 'downloaded';
      readonly replaced: boolean;
    };

export interface SyncEngineDeps {
  readonly repo: SyncRepository;
  readonly cloud: CloudStore;
  readonly now: () => number;
  /** F5: diagnostic log of decisions (no uid, e-mail or review content). */
  readonly log?: (event: string, options?: SyncLogAddOptions) => void;
}

async function pull(deps: SyncEngineDeps, uid: string, meta: SyncMeta, epoch: number) {
  let cursor = meta.pullCursor;
  let pulled = 0;
  let renamed = 0;
  let cardsUpdated = 0;
  for (;;) {
    const page = await deps.cloud.pullLogs(uid, cursor, PULL_PAGE);
    // Leftovers of an older epoch (a reset whose cleanup has not finished yet) are ignored.
    const current = page.logs.filter((l) => l.epoch === epoch).map(({ epoch: _e, ...log }) => log);
    if (current.length > 0) {
      const applied = await deps.repo.applyRemoteLogs(current, epoch);
      pulled += applied.added;
      renamed += applied.renamed;
      cardsUpdated += applied.cardsUpdated;
    }
    cursor = page.cursor;
    await deps.repo.updateMeta({ pullCursor: cursor });
    if (page.last) break;
  }
  return { pulled, renamed, cardsUpdated };
}

async function push(deps: SyncEngineDeps, uid: string, epoch: number): Promise<number> {
  const pending = await deps.repo.pendingLogs();
  let pushed = 0;
  for (let i = 0; i < pending.length; i += PUSH_BATCH) {
    const batch = pending.slice(i, i + PUSH_BATCH);
    await deps.cloud.pushLogs(uid, epoch, batch);
    await deps.repo.markUploaded(batch.map((l) => l.id), epoch);
    pushed += batch.length;
  }
  return pushed;
}

async function syncSettings(deps: SyncEngineDeps, uid: string, force: boolean): Promise<'kept' | 'uploaded' | 'downloaded'> {
  const local = await deps.repo.getSettings();
  if (force && local !== null) {
    await deps.cloud.writeSettings(uid, local);
    return 'uploaded';
  }
  const remote = await deps.cloud.readSettings(uid);
  // D5: newer updatedAt wins; equal keeps this device's. Clocks differ: this is a convention, not proof of order.
  if (remote !== null && (local === null || remote.updatedAt > local.updatedAt)) {
    await deps.repo.applyRemoteSettings(remote);
    return 'downloaded';
  }
  if (local !== null && (remote === null || local.updatedAt > remote.updatedAt)) {
    await deps.cloud.writeSettings(uid, local);
    return 'uploaded';
  }
  return 'kept';
}

/**
 * Legacy only: `pendingReplace` was set by builds up to 9a1455c (Reset / Import marked the cloud for replacement
 * and the next sync raised the epoch from whatever the cloud then had, F2). Current builds replace the cloud BEFORE
 * changing local data (syncService.replaceAccount) and never set it. A leftover is honoured only if the cloud is
 * still at this device's known epoch (atomic precondition); otherwise nothing is raised and the user decides.
 */
async function legacyReplace(deps: SyncEngineDeps, uid: string, meta: SyncMeta, root: CloudRoot): Promise<number | null> {
  if (meta.knownEpoch === null || root.epoch !== meta.knownEpoch) return null;
  deps.log?.(`legacy pending replace: asking the cloud to raise epoch ${meta.knownEpoch} -> ${meta.knownEpoch + 1} (only if it is still ${meta.knownEpoch})`);
  try {
    const epoch = await deps.cloud.bumpEpoch(uid, meta.knownEpoch, newUuid());
    deps.log?.(`legacy pending replace: the cloud raised the epoch to ${epoch}`);
    await deps.repo.updateMeta({ knownEpoch: epoch, pendingReplace: false, cleanupBelow: epoch, pushSettings: true, pullCursor: null });
    return epoch;
  } catch (error) {
    if (error instanceof CloudError && error.kind === 'conflict') return null;
    throw error;
  }
}

export async function runSyncCycle(deps: SyncEngineDeps): Promise<SyncOutcome> {
  const { repo, cloud } = deps;
  // L-1 gate: a server-issued token for the current Firebase user. The UI state and the hint are never used.
  const uid = await cloud.confirmedUid();
  if (uid === null) return { kind: 'no-user' };

  let meta = await repo.getMeta();
  const log = deps.log ?? (() => undefined);
  if (meta.declinedUid === uid) return { kind: 'declined', uid };
  if (meta.uid === null) {
    // D-L3-8: progress on this device is uploaded only after the user agreed. No progress: nothing to ask.
    if (await repo.hasLocalProgress()) return { kind: 'needs-binding', reason: 'unbound', uid };
    await repo.bind(uid);
    log('bound to the signed-in account (this device had no progress)');
    meta = await repo.getMeta();
  } else if (meta.uid !== uid) {
    // Never upload account A's progress into account B.
    return { kind: 'needs-binding', reason: 'other-account', uid };
  }

  let root = await cloud.readOrCreateRoot(uid); // first Firestore request: the server accepted this user
  let replaced = false;

  if (meta.pendingReplace) {
    const raised = await legacyReplace(deps, uid, meta, root);
    if (raised === null) {
      await repo.updateMeta({ pendingReplace: false });
      log(`legacy pending replace NOT applied: the cloud is at epoch ${root.epoch}, this device knew ${String(meta.knownEpoch)}; nothing raised`);
      return { kind: 'remote-reset', uid, epoch: root.epoch, resetAt: root.resetAt, unsynced: (await repo.pendingLogs()).length };
    }
    replaced = true;
    meta = await repo.getMeta();
    root = { ...root, epoch: raised, created: false };
  } else if (meta.knownEpoch === null) {
    meta = await repo.updateMeta({ knownEpoch: root.epoch, pullCursor: null });
    log(`first sync of this binding: following cloud epoch ${root.epoch}`);
  } else if (root.epoch !== meta.knownEpoch || (root.created && meta.lastSyncAt !== null)) {
    // Another device reset / imported (or the cloud data was deleted). Upload nothing; the user decides.
    log(`remote reset detected: cloud epoch ${root.epoch}${root.created ? ' (cloud data was missing)' : ''}, this device knew ${meta.knownEpoch}; nothing uploaded`, { once: true });
    return { kind: 'remote-reset', uid, epoch: root.epoch, resetAt: root.resetAt, unsynced: (await repo.pendingLogs()).length };
  }
  const epoch = meta.knownEpoch!;

  if (meta.cleanupBelow !== null) {
    const deleted = await cloud.deleteLogsBelow(uid, meta.cleanupBelow);
    log(`replace: deleted ${deleted} cloud logs of epochs below ${meta.cleanupBelow}`);
    meta = await repo.updateMeta({ cleanupBelow: null });
  }

  const pulled = await pull(deps, uid, meta, epoch);
  let pushed: number;
  try {
    pushed = await push(deps, uid, epoch);
  } catch (error) {
    if (!(error instanceof CloudError) || error.kind !== 'denied') throw error;
    // Refused: the epoch moved (a reset elsewhere) or another device took a legacy id meanwhile.
    log('upload refused by the cloud: re-checking the epoch, pulling, retrying once');
    const now = await cloud.readOrCreateRoot(uid);
    if (now.epoch !== epoch) return { kind: 'remote-reset', uid, epoch: now.epoch, resetAt: now.resetAt, unsynced: (await repo.pendingLogs()).length };
    const again = await pull(deps, uid, await repo.getMeta(), epoch);
    pulled.pulled += again.pulled;
    pulled.renamed += again.renamed;
    pulled.cardsUpdated += again.cardsUpdated;
    pushed = await push(deps, uid, epoch);
  }

  const settings = await syncSettings(deps, uid, meta.pushSettings);
  await repo.updateMeta({ pushSettings: false, lastSyncAt: deps.now() });
  if (replaced || pulled.pulled > 0 || pushed > 0 || pulled.renamed > 0 || settings !== 'kept') {
    log(`synced (epoch ${epoch}): pulled ${pulled.pulled}, pushed ${pushed}, renamed ${pulled.renamed}, settings ${settings}${replaced ? ', REPLACED the cloud' : ''}`);
  }
  return { kind: 'synced', uid, ...pulled, pushed, settings, replaced };
}
