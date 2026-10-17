import type { SyncRepository } from '../../repositories/interfaces';
import type { SyncMeta } from '../../types/entities';
import { CloudError, PULL_PAGE, PUSH_BATCH, type CloudRoot, type CloudStore } from './cloudTypes';

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
  readonly log?: (event: string) => void;
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

/** Raise the cloud epoch for a local Reset / Import (the epoch may have moved meanwhile: retry once). */
async function startReplace(deps: SyncEngineDeps, uid: string, root: CloudRoot): Promise<number> {
  let from = root.epoch;
  for (let attempt = 0; ; attempt += 1) {
    try {
      deps.log?.(`replace: raising the cloud epoch ${from} -> ${from + 1} (a Reset / Import on this device is pending)`);
      const epoch = await deps.cloud.bumpEpoch(uid, from);
      await deps.repo.updateMeta({ knownEpoch: epoch, pendingReplace: false, cleanupBelow: epoch, pushSettings: true, pullCursor: null });
      return epoch;
    } catch (error) {
      if (!(error instanceof CloudError) || error.kind !== 'conflict' || attempt > 0) throw error;
      from = (await deps.cloud.readOrCreateRoot(uid)).epoch;
      deps.log?.(`replace: the epoch moved meanwhile (now ${from}); retrying once`);
    }
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
    await startReplace(deps, uid, root);
    replaced = true;
    meta = await repo.getMeta();
    root = { ...root, epoch: meta.knownEpoch!, created: false };
  } else if (meta.knownEpoch === null) {
    meta = await repo.updateMeta({ knownEpoch: root.epoch, pullCursor: null });
    log(`first sync of this binding: following cloud epoch ${root.epoch}`);
  } else if (root.epoch !== meta.knownEpoch || (root.created && meta.lastSyncAt !== null)) {
    // Another device reset / imported (or the cloud data was deleted). Upload nothing; the user decides.
    log(`remote reset detected: cloud epoch ${root.epoch}${root.created ? ' (cloud data was missing)' : ''}, this device knew ${meta.knownEpoch}; nothing uploaded`);
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
