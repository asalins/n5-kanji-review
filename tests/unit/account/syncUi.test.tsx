import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { deleteMessage } from '../../../src/features/account/AccountSection';
import { PrivacyScreen } from '../../../src/features/account/PrivacyScreen';
import { SyncPanel } from '../../../src/features/account/SyncPanel';
import { ACCOUNT_TEXT, SYNC_TEXT } from '../../../src/features/account/strings';
import { RepositoriesProvider, type AppRepositories } from '../../../src/hooks/useRepositories';
import type { BindingChoice, SyncService, SyncStatus } from '../../../src/services/sync/syncService';
import { createSyncLog } from '../../../src/services/sync/syncLog';

function fakeSync(status: SyncStatus) {
  const calls: string[] = [];
  const service: SyncService = {
    getStatus: () => status,
    subscribe: () => () => undefined,
    subscribeDataChanged: () => () => undefined,
    setActive: () => undefined,
    notifyLocalChange: () => undefined,
    syncNow: async () => void calls.push('syncNow'),
    resolveBinding: async (c: BindingChoice) => void calls.push(`bind:${c}`),
    acceptRemoteReset: async () => void calls.push('acceptReset'),
    enable: async () => void calls.push('enable'),
    deleteCloudData: async () => 'deleted',
    resume: () => undefined,
    isBound: async () => true,
    log: createSyncLog(null),
  };
  return { service, calls };
}
const show = (status: SyncStatus) => {
  const fake = fakeSync(status);
  render(
    <RepositoriesProvider value={{ sync: fake.service } as unknown as AppRepositories}>
      <SyncPanel email="learner@example.com" />
    </RepositoriesProvider>,
  );
  return fake;
};
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};
const acknowledgeAndConfirm = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('checkbox'));
  });
  const buttons = screen.getAllByRole('button', { name });
  await act(async () => {
    fireEvent.click(buttons.at(-1)!);
  });
};

describe('Sync panel (L3b)', () => {
  it('not rendered without a sync service', () => {
    render(
      <RepositoriesProvider value={{} as AppRepositories}>
        <SyncPanel email="x" />
      </RepositoriesProvider>,
    );
    expect(screen.queryByTestId('sync-panel')).toBeNull();
  });

  it('idle: last sync time and "Sync now"', async () => {
    const { calls } = show({ kind: 'idle', lastSyncAt: 1_800_000_000_000 });
    expect(screen.getByTestId('sync-status').textContent).toContain(SYNC_TEXT.synced);
    await click(SYNC_TEXT.syncNow);
    expect(calls).toEqual(['syncNow']);
  });

  it.each([
    [{ kind: 'offline' } as SyncStatus, SYNC_TEXT.offline],
    [{ kind: 'paused-quota', retryAt: 1 } as SyncStatus, SYNC_TEXT.quota],
    [{ kind: 'error', retryAt: 1, reason: 'network' } as SyncStatus, SYNC_TEXT.error],
    [{ kind: 'off' } as SyncStatus, SYNC_TEXT.waiting],
  ])('%o is explained', (status, text) => {
    show(status);
    expect(screen.getByTestId('sync-status').textContent).toContain(text);
  });

  it('unbound device: asks before uploading; upload / skip need no extra step', async () => {
    const { calls } = show({ kind: 'needs-binding', reason: 'unbound' });
    expect(screen.getByRole('dialog', { name: SYNC_TEXT.bindTitle })).toBeTruthy();
    await click(SYNC_TEXT.bindUpload);
    await click(SYNC_TEXT.skip);
    expect(calls).toEqual(['bind:upload', 'bind:skip']);
  });

  it('other account: there is NO upload option; deleting local progress needs "I understand"', async () => {
    const { calls } = show({ kind: 'needs-binding', reason: 'other-account' });
    expect(screen.queryByRole('button', { name: SYNC_TEXT.bindUpload })).toBeNull();
    await click(SYNC_TEXT.replaceLocal);
    expect(calls).toEqual([]);
    await acknowledgeAndConfirm(SYNC_TEXT.replaceLocal);
    expect(calls).toEqual(['bind:replace-local']);
  });

  it('remote reset: shows when and how many reviews are unsynced; clearing needs "I understand"', async () => {
    const { calls } = show({ kind: 'remote-reset', epoch: 2, resetAt: 1_800_000_000_000, unsynced: 3 });
    expect(screen.getByRole('alert').textContent).toContain(SYNC_TEXT.resetTitle);
    expect(screen.getByTestId('sync-unsynced').textContent).toBe('3');
    await click(SYNC_TEXT.resetAccept);
    expect(calls).toEqual([]);
    await acknowledgeAndConfirm(SYNC_TEXT.resetAccept);
    expect(calls).toEqual(['acceptReset']);
  });

  it('declined: can be turned back on', async () => {
    const { calls } = show({ kind: 'declined' });
    await click(SYNC_TEXT.enable);
    expect(calls).toEqual(['enable']);
  });
});

describe('Delete Account messages with cloud data (C2, D-L2-6)', () => {
  it('each part is reported as it happened', () => {
    expect(deleteMessage({ account: 'deleted', reason: null, cloudData: 'deleted', localData: 'kept' }).lines).toEqual([ACCOUNT_TEXT.accountDeleted, ACCOUNT_TEXT.cloudDeleted, ACCOUNT_TEXT.localKept]);
    expect(deleteMessage({ account: 'failed', reason: 'unknown', cloudData: 'failed', localData: 'kept' }).lines).toEqual([ACCOUNT_TEXT.cloudFailed]);
    expect(deleteMessage({ account: 'failed', reason: 'network', cloudData: 'deleted', localData: 'kept' }).lines).toEqual([ACCOUNT_TEXT.cloudDeleted, ACCOUNT_TEXT.accountFailedAfterCloud]);
  });
  it('a failed cloud deletion never claims "nothing was deleted" (part of it may be gone)', () => {
    const text = deleteMessage({ account: 'failed', reason: 'unknown', cloudData: 'failed', localData: 'kept' }).lines.join(' ');
    expect(text).not.toContain(ACCOUNT_TEXT.deleteFailed);
    expect(text).toMatch(/may already be deleted/);
  });
});

describe('Privacy notice describes the cloud learning data (L3b)', () => {
  it('names Cloud Firestore, what a review record holds, the random device id, and Reset replacing the cloud', () => {
    render(<PrivacyScreen onBack={() => undefined} />);
    const text = document.body.textContent ?? '';
    expect(text.match(/Cloud Firestore/g)?.length).toBe(2);
    expect(text).toMatch(/random device id created by the app/);
    expect(text).toMatch(/รหัสอุปกรณ์แบบสุ่ม/);
    expect(text).toMatch(/also replaces the learning data in the cloud/);
    expect(text).not.toMatch(/stores no learning data in the cloud|sends the device id nowhere/);
  });
});
