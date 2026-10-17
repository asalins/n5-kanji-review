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
import { openTestDatabase } from '../../helpers/testDatabase';
import { openRealRepositories } from '../../helpers/realData';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of disposers.splice(0)) await d();
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
const quietEnv = (): SyncEnvironment => ({ isOnline: () => true, onOnline: () => () => undefined, onHidden: () => () => undefined, setTimer: () => 0, clearTimer: () => undefined, now: () => Date.now(), locks: null });

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

describe('regression for the G1 T3 session (14:14-14:35): only Reset / Import raise the epoch, and the log says who', () => {
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
    // Reset progress on the normal profile -> epoch 2
    await nor.first.backup!.resetProgress();
    await nor.first.sync!.syncNow();
    expect(cloud.account('U').root?.epoch).toBe(2);
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

    const incLog = inc.events();
    const norLog = nor.events();
    expect(incLog.filter((e) => e.includes('raising the cloud epoch'))).toEqual(['t1: replace: raising the cloud epoch 0 -> 1 (a Reset / Import on this device is pending)']);
    expect(incLog).toContain("t1: Import (Replace) on this device: the account's cloud data will be replaced on the next sync");
    expect(incLog).toContain('t1: user accepted the remote reset: local progress cleared, following epoch 2');
    expect(norLog.filter((e) => e.includes('raising the cloud epoch'))).toEqual(['t1: replace: raising the cloud epoch 1 -> 2 (a Reset / Import on this device is pending)']);
    expect(norLog).toContain("t1: Reset progress on this device: the account's cloud data will be replaced on the next sync");
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
