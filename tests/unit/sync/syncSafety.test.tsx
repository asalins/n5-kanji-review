import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAppServices } from '../../../src/app/bootstrap';
import { SettingsProvider } from '../../../src/features/settings/SettingsProvider';
import { SettingsScreen } from '../../../src/features/settings/SettingsScreen';
import { TEXT } from '../../../src/features/settings/strings';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import { createIndexedDbRepositories } from '../../../src/repositories/indexeddb';
import type { AccountService, AccountStatus } from '../../../src/services/account';
import { MAX_ENTRIES, SYNC_LOG_KEY, createSyncLog, type LogStorage } from '../../../src/services/sync/syncLog';
import type { SyncEnvironment, SyncService, SyncStatus } from '../../../src/services/sync/syncService';
import { validBackup } from '../../helpers/backupFixtures';
import { MemoryCloud } from '../../helpers/memoryCloud';
import { CloudError } from '../../../src/services/sync/cloudTypes';
import { openTestDatabase } from '../../helpers/testDatabase';
import { openRealRepositories } from '../../helpers/realData';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of disposers.splice(0)) await d();
  net.online = true;
});
const settle = () => new Promise((r) => setTimeout(r, 30));

class MemoryStorage implements LogStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

/** A signed-in account whose cloud is the in-memory one (uid 'U'). */
function fakeAccount(cloud: MemoryCloud): AccountService {
  const status: AccountStatus = { kind: 'signed-in', user: { uid: 'U', email: 'u@example.com' } };
  return {
    getStatus: () => status,
    subscribe: () => () => undefined,
    start: () => undefined,
    signIn: async () => ({ ok: true }),
    signOut: async () => ({ signedOut: true, localData: 'kept' }),
    deleteAccount: async () => ({ account: 'not-deleted', reason: null, cloudData: 'none', localData: 'kept' }),
    retryLocalDelete: async () => 'kept',
    getCloud: () => cloud.as(() => 'U'),
  };
}
const net = { online: true };
const quietEnv = (): SyncEnvironment => ({ isOnline: () => net.online, onOnline: () => () => undefined, onHidden: () => () => undefined, setTimer: () => 0, clearTimer: () => undefined, now: () => Date.now(), locks: null });

let clock = 1_800_000_000_000;
/** One browser profile: its own IndexedDB and log storage; `tab()` = one more tab of it (real bootstrap wiring). */
async function profile(cloud: MemoryCloud) {
  const { db, dispose } = await openTestDatabase();
  disposers.push(dispose);
  const repos = createIndexedDbRepositories(db);
  const storage = new MemoryStorage();
  const tab = (name: string) => buildAppServices(repos, { account: fakeAccount(cloud), syncEnv: quietEnv(), syncLog: createSyncLog(storage, Date.now, name) });
  const first = tab('t1');
  const review = async (app: AppRepositories, k: string) => {
    clock += 60_000;
    await app.reviewOrchestrator!.submit({ item: { itemType: 'kanji', itemId: `kanji:U+${k}` }, mode: 'A', rating: 'GOOD', answeredAt: clock, durationMs: 1 });
  };
  return { repos, first, tab, review, events: () => createSyncLog(storage).list().map((e) => `${e.tab}: ${e.event}`) };
}

describe('F5: local sync log', () => {
  it('keeps the newest entries, is shared by tabs of one origin, and never throws on broken storage', () => {
    const storage = new MemoryStorage();
    const a = createSyncLog(storage, () => 1, 'a');
    const b = createSyncLog(storage, () => 2, 'b');
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) a.add(`e${i}`);
    b.add('from b');
    const all = a.list();
    expect(all).toHaveLength(MAX_ENTRIES);
    expect(all.at(-1)).toEqual({ at: 2, tab: 'b', event: 'from b' });
    storage.setItem(SYNC_LOG_KEY, '{broken');
    expect(() => a.add('x')).not.toThrow();
    const blocked = createSyncLog({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    blocked.add('memory only');
    expect(blocked.list().map((e) => e.event)).toEqual(['memory only']);
  });
});

describe('regression for the G1 T3 session (14:14-14:35): only informed Reset / Import raise the epoch (F2), and the log says who', () => {
  it('accepting a remote reset never raises the epoch; every raise is logged with its origin', async () => {
    const cloud = new MemoryCloud();
    const inc = await profile(cloud);
    const nor = await profile(cloud);
    await nor.review(nor.first, '4E00');
    await nor.repos.sync.bind('OLD'); // left over from a deleted account
    await inc.review(inc.first, '4E01');
    await inc.review(inc.first, '4E02');
    inc.first.sync!.setActive(true);
    nor.first.sync!.setActive(true);
    await inc.first.sync!.syncNow();
    expect(inc.first.sync!.getStatus()).toMatchObject({ kind: 'needs-binding', reason: 'unbound' });
    await inc.first.sync!.resolveBinding('upload');
    await nor.first.sync!.syncNow();
    expect(nor.first.sync!.getStatus()).toMatchObject({ kind: 'needs-binding', reason: 'other-account' });
    await nor.first.sync!.resolveBinding('replace-local');
    const file = await nor.repos.backup.readUserData();
    await nor.review(nor.first, '4E03');
    await nor.first.sync!.syncNow();
    expect(cloud.logsOf('U')).toHaveLength(3);
    // Import on the incognito profile -> epoch 1
    await inc.first.backup!.replaceUserData({ reviewCards: file.reviewCards, reviewLogs: file.reviewLogs, studySessions: [], userSettings: null });
    await inc.first.sync!.syncNow();
    expect(cloud.account('U').root?.epoch).toBe(1);
    // F2: the normal profile has NOT seen that replace (it still knows epoch 0). Its Reset progress is REFUSED:
    // nothing local changes, the cloud is not touched, and it then shows the remote-reset notice.
    const norBefore = await nor.repos.backup.readUserData();
    await expect(nor.first.backup!.resetProgress()).rejects.toMatchObject({ name: 'ReplaceError', code: 'conflict' });
    expect(await nor.repos.backup.readUserData()).toEqual(norBefore);
    expect(cloud.account('U').root?.epoch).toBe(1);
    expect(cloud.logsOf('U')).toHaveLength(2);
    await settle();
    expect(nor.first.sync!.getStatus()).toMatchObject({ kind: 'remote-reset', epoch: 1 });
    // the user accepts the account's data there, THEN a Reset is an informed, new action -> epoch 2
    await nor.first.sync!.acceptRemoteReset();
    await nor.first.backup!.resetProgress();
    await settle();
    expect(cloud.account('U').root?.epoch).toBe(2);
    expect(cloud.logsOf('U')).toEqual([]);
    // incognito: notice, then "clear this device and use the account's data"
    await inc.first.sync!.syncNow();
    expect(inc.first.sync!.getStatus()).toMatchObject({ kind: 'remote-reset', epoch: 2 });
    await inc.first.sync!.acceptRemoteReset();
    expect(cloud.account('U').root?.epoch).toBe(2); // NOT raised
    // T4: two tabs of the normal profile sync together
    const second = nor.tab('t2');
    second.sync!.setActive(true);
    await nor.review(nor.first, '4E04');
    await Promise.all([nor.first.sync!.syncNow(), second.sync!.syncNow()]);
    await settle();
    expect(cloud.account('U').root?.epoch).toBe(2);
    expect(cloud.logsOf('U')).toHaveLength(1);
    expect(cloud.bumps).toHaveLength(2); // exactly the two informed replaces

    const incLog = inc.events();
    const norLog = nor.events();
    expect(incLog.filter((e) => e.includes('raising the cloud epoch'))).toEqual(['t1: Import (Replace) on this device: raising the cloud epoch 0 -> 1 only if still 0']);
    expect(incLog).toContain('t1: user accepted the remote reset: local progress cleared, following epoch 2');
    expect(norLog).toContain('t1: Reset progress refused: the account was already replaced from another device (epoch is no longer 0); nothing changed');
    expect(norLog.filter((e) => e.includes('raising the cloud epoch'))).toEqual([
      't1: Reset progress on this device: raising the cloud epoch 0 -> 1 only if still 0',
      't1: Reset progress on this device: raising the cloud epoch 1 -> 2 only if still 1',
    ]);
  });
});

/** Settings screen with a stand-in sync service (status + binding). */
function showSettings(app: AppRepositories, status: SyncStatus, bound: boolean) {
  const sync: SyncService = { ...app.sync!, getStatus: () => status, subscribe: () => () => undefined, isBound: async () => bound };
  render(
    <RepositoriesProvider value={{ ...app, sync }}>
      <SettingsProvider>
        <SettingsScreen onExit={() => undefined} />
      </SettingsProvider>
    </RepositoriesProvider>,
  );
}

describe('F1 / F3: Reset and Import say what they do to a synced account', () => {
  const app = async () => {
    const { repos, dispose } = await openRealRepositories(); // the real dataset: an import can be validated
    disposers.push(dispose);
    return buildAppServices(repos, { account: fakeAccount(new MemoryCloud()), syncEnv: quietEnv(), syncLog: createSyncLog(null) });
  };

  it('F1: bound -> the Reset confirmation says the account cloud data and every synced device are affected', async () => {
    showSettings(await app(), { kind: 'idle', lastSyncAt: 1 }, true);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.resetProgress }));
    expect(await screen.findByTestId('bound-reset-warning')).toBeTruthy();
    expect(screen.getByTestId('bound-reset-warning').textContent).toBe(TEXT.boundResetWarning);
  });

  it('F1: not bound -> the old local-only text, no account warning', async () => {
    showSettings(await app(), { kind: 'off' }, false);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.resetProgress }));
    await settle();
    expect(screen.queryByTestId('bound-reset-warning')).toBeNull();
  });

  it('F1: bound -> the Import confirmation says the account cloud data is replaced by the file', async () => {
    showSettings(await app(), { kind: 'idle', lastSyncAt: 1 }, true);
    await settle();
    const input = screen.getByLabelText(/Import backup/) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([JSON.stringify(validBackup())], 'b.json', { type: 'application/json' })] } });
    });
    await waitFor(() => expect(screen.getByTestId('bound-import-warning').textContent).toBe(TEXT.boundImportWarning));
  });

  it('F3: while another device reset is unanswered, Reset progress and Import are blocked with a pointer to the notice', async () => {
    showSettings(await app(), { kind: 'remote-reset', epoch: 3, resetAt: 1, unsynced: 0 }, true);
    expect(((await screen.findByRole('button', { name: TEXT.resetProgress })) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Import backup/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('reset-blocked').textContent).toBe(TEXT.blockedByRemoteReset);
    expect(screen.getByTestId('import-blocked').textContent).toBe(TEXT.blockedByRemoteReset);
  });
});

/** Two profiles bound to U and synced at the same epoch, each with its own reviews on the cloud. */
async function twoSynced() {
  const cloud = new MemoryCloud();
  const a = await profile(cloud);
  const b = await profile(cloud);
  for (const p of [a, b]) {
    p.first.sync!.setActive(true);
    await p.repos.sync.bind('U');
  }
  await a.review(a.first, '4E00');
  await a.first.sync!.syncNow();
  await b.first.sync!.syncNow();
  return { cloud, a, b };
}
const snapshot = async (p: Awaited<ReturnType<typeof profile>>) => ({ data: await p.repos.backup.readUserData(), meta: await p.repos.sync.getMeta() });

describe('L4-C1 (F2): Reset / Import on a bound device replace the cloud FIRST, atomically, or change nothing', () => {
  it('offline: refused before anything; no pendingReplace, no cloud request, local data unchanged', async () => {
    const { cloud, a } = await twoSynced();
    const before = await snapshot(a);
    const calls = cloud.ops.pulls;
    net.online = false;
    await expect(a.first.backup!.resetProgress()).rejects.toMatchObject({ code: 'offline' });
    await expect(a.first.backup!.replaceUserData({ reviewCards: [], reviewLogs: [], studySessions: [], userSettings: null })).rejects.toMatchObject({ code: 'offline' });
    expect(await snapshot(a)).toEqual(before);
    expect((await a.repos.sync.getMeta()).pendingReplace).toBe(false);
    expect(cloud.bumps).toEqual([]);
    expect(cloud.ops.pulls).toBe(calls);
    net.online = true;
    await a.first.sync!.syncNow(); // back online: nothing is replaced later either
    expect(cloud.bumps).toEqual([]);
    expect(cloud.logsOf('U')).toHaveLength(1);
  });

  it('the cloud check fails (unavailable / quota / denied): refused, nothing changed anywhere', async () => {
    for (const kind of ['network', 'quota', 'denied'] as const) {
      const { cloud, a } = await twoSynced();
      const before = await snapshot(a);
      cloud.failOnce = { op: 'bumpEpoch', error: new CloudError(kind, kind) };
      await expect(a.first.backup!.resetProgress()).rejects.toMatchObject({ code: kind === 'network' ? 'offline' : 'cloud-failed' });
      expect(await snapshot(a)).toEqual(before);
      expect(cloud.account('U').root?.epoch).toBe(0);
      expect(cloud.logsOf('U')).toHaveLength(1);
    }
  });

  it('the epoch changes between the read and the commit (another device commits first): conflict, nothing changed', async () => {
    const { cloud, a, b } = await twoSynced();
    const before = await snapshot(b);
    // device A's replace lands while B's transaction is in flight (between B's known epoch and its commit)
    cloud.beforeBump = () => {
      cloud.beforeBump = null;
      cloud.account('U').root = { epoch: 1, resetAt: 1 }; // A committed epoch 0 -> 1 first
    };
    await expect(b.first.backup!.resetProgress()).rejects.toMatchObject({ code: 'conflict' });
    expect(await snapshot(b)).toEqual(before); // no local clear
    expect(cloud.logsOf('U')).toHaveLength(1); // no cloud overwrite
    expect(cloud.account('U').root?.epoch).toBe(1); // only A's raise
    await settle();
    expect(b.first.sync!.getStatus()).toMatchObject({ kind: 'remote-reset', epoch: 1 }); // the conflict is shown
    expect(b.events().some((e) => e.includes('refused: the account was already replaced from another device'))).toBe(true);
    expect(a.repos).toBeDefined();
  });

  it('two devices replace from the SAME epoch at the same time: exactly one succeeds', async () => {
    const { cloud, a, b } = await twoSynced();
    const results = await Promise.allSettled([a.first.backup!.resetProgress(), b.first.backup!.resetProgress()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ code: 'conflict' });
    expect(cloud.account('U').root?.epoch).toBe(1);
    expect(cloud.bumps).toHaveLength(1);
  });

  it('the cloud is replaced but the local write fails: reported as such, local data unchanged, no cloud log deleted', async () => {
    const { cloud, a } = await twoSynced();
    const before = await snapshot(a);
    const real = a.repos.backup.resetProgress.bind(a.repos.backup);
    a.repos.backup.resetProgress = async () => {
      throw new Error('IndexedDB quota / tab closing');
    };
    await expect(a.first.backup!.resetProgress()).rejects.toMatchObject({ code: 'local-failed' });
    a.repos.backup.resetProgress = real;
    expect(await snapshot(a)).toEqual(before);
    expect(cloud.account('U').root?.epoch).toBe(1);
    expect(cloud.logsOf('U')).toHaveLength(1); // old-epoch logs are only deleted after a successful local write
    await settle();
    expect(a.first.sync!.getStatus()).toMatchObject({ kind: 'remote-reset', epoch: 1 }); // the user decides
  });

  it('not synced yet with the account, or signed in to another account: refused, nothing changed', async () => {
    const cloud = new MemoryCloud();
    const a = await profile(cloud);
    await a.review(a.first, '4E00');
    await a.repos.sync.bind('U'); // bound but never synced: knownEpoch null
    cloud.failOnce = { op: 'readOrCreateRoot', error: new CloudError('network', 'down') }; // its first sync fails
    a.first.sync!.setActive(true);
    await settle();
    expect((await a.repos.sync.getMeta()).knownEpoch).toBeNull();
    const before = await snapshot(a);
    await expect(a.first.backup!.resetProgress()).rejects.toMatchObject({ code: 'not-synced' });
    await settle();
    await a.repos.sync.updateMeta({ uid: 'SOMEONE-ELSE', knownEpoch: 0 });
    await expect(a.first.backup!.resetProgress()).rejects.toMatchObject({ code: 'not-signed-in' });
    expect((await snapshot(a)).data).toEqual(before.data);
    expect(cloud.bumps).toEqual([]);
  });

  it('a successful replace is reported only after both commits, and the old cloud logs are then deleted', async () => {
    const { cloud, a } = await twoSynced();
    await a.first.backup!.resetProgress();
    await settle();
    expect(cloud.account('U').root?.epoch).toBe(1);
    expect(cloud.logsOf('U')).toEqual([]);
    expect(await a.repos.sync.getMeta()).toMatchObject({ knownEpoch: 1, cleanupBelow: null });
  });

  it('legacy pendingReplace (set by builds <= 9a1455c) never raises from a stale epoch', async () => {
    const { cloud, a, b } = await twoSynced();
    await a.first.backup!.resetProgress(); // epoch 1 (informed)
    await settle();
    await b.repos.sync.updateMeta({ pendingReplace: true }); // B was left with an old-style pending replace at epoch 0
    await b.first.sync!.syncNow();
    expect(cloud.account('U').root?.epoch).toBe(1);
    expect(b.first.sync!.getStatus()).toMatchObject({ kind: 'remote-reset', epoch: 1 });
    expect((await b.repos.sync.getMeta()).pendingReplace).toBe(false);
  });
});

describe('L4-C2 (SIMULATED, not a real quota test): resource-exhausted / unavailable during sync', () => {
  it.each([
    ['quota', 'paused-quota'],
    ['network', 'error'],
  ] as const)('%s while uploading: no log lost, epoch unchanged, retry by the existing policy, then everything arrives', async (kind, shown) => {
    const { cloud, a } = await twoSynced();
    await a.review(a.first, '4E01');
    await a.review(a.first, '4E02');
    cloud.failure = new CloudError(kind, kind);
    await a.first.sync!.syncNow();
    expect(a.first.sync!.getStatus().kind).toBe(shown);
    expect((await a.repos.sync.pendingLogs()).length).toBe(2); // still queued locally
    expect(cloud.account('U').root?.epoch).toBe(0);
    cloud.failure = null;
    await a.first.sync!.syncNow();
    expect(cloud.logsOf('U')).toHaveLength(3);
    expect(cloud.account('U').root?.epoch).toBe(0);
    expect(cloud.bumps).toEqual([]);
  });
});
