import 'fake-indexeddb/auto';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithCredential } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore, setDoc, serverTimestamp } from 'firebase/firestore';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildAppServices } from '../../src/app/bootstrap';
import { createIndexedDbRepositories } from '../../src/repositories/indexeddb';
import { adapterForAuth } from '../../src/services/account/firebaseAdapter';
import { createAccountService } from '../../src/services/account/accountService';
import { DEFAULT_USER_SETTINGS } from '../../src/services/settings/defaults';
import { CloudError, PUSH_BATCH, type CloudStore } from '../../src/services/sync/cloudTypes';
import { replayAll } from '../../src/services/sync/replay';
import { runSyncCycle, type SyncOutcome } from '../../src/services/sync/syncEngine';
import { createSyncService, type SyncEnvironment } from '../../src/services/sync/syncService';
import type { ReviewLog, ReviewRating, StudyMode } from '../../src/types/entities';
import { openTestDatabase } from '../helpers/testDatabase';

/**
 * L3b sync integration against the REAL Firestore + Auth emulators with the REAL firestore.rules (firebase.json),
 * through the app's own Firestore code (firestoreCloud.ts via the adapter). Never a real project.
 *   firebase emulators:exec --only auth,firestore --project demo-n5 "npm run test:auth-emulator"   (CI)
 * Without the emulators the suite fails with "... EMULATOR BLOCKED" (never passes silently).
 */
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const PROJECT = 'demo-n5';

beforeAll(() => {
  if (AUTH_HOST === '' || FS_HOST === '') throw new Error('SYNC EMULATOR BLOCKED — FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST not set (no emulators running).');
});

const apps: FirebaseApp[] = [];
const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const d of disposers.splice(0)) await d();
  for (const app of apps.splice(0)) await deleteApp(app);
  await fetch(`http://${FS_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
});

let appCounter = 0;
/** One "device": its own Firebase app (Auth + Firestore) signed in as `who`, and its own IndexedDB. */
async function device(who: string) {
  appCounter += 1;
  const app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:0:web:0' }, `device${appCounter}`);
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = initializeFirestore(app, {});
  const [host, port] = FS_HOST.split(':');
  connectFirestoreEmulator(firestore, host!, Number(port));
  const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email: `${who}@example.com`, email_verified: true })));
  const adapter = adapterForAuth(auth, () => firestore);
  const cloud = adapter.cloud()!;

  const { db, dispose } = await openTestDatabase();
  disposers.push(dispose);
  const repos = createIndexedDbRepositories(db);
  const services = buildAppServices(repos);
  return {
    uid: user.uid,
    firestore,
    adapter,
    cloud,
    repos,
    async review(code: string, mode: StudyMode, rating: ReviewRating, at: number) {
      await services.reviewOrchestrator!.submit({ item: { itemType: 'kanji', itemId: `kanji:U+${code}` }, mode, rating, answeredAt: at, durationMs: 800 });
    },
    sync: (store: CloudStore = cloud): Promise<SyncOutcome> => runSyncCycle({ repo: repos.sync, cloud: store, now: () => Date.now() }),
    data: () => repos.backup.readUserData(),
  };
}
type Device = Awaited<ReturnType<typeof device>>;

const synced = (o: SyncOutcome) => {
  expect(o.kind, JSON.stringify(o)).toBe('synced');
  return o as Extract<SyncOutcome, { kind: 'synced' }>;
};
async function expectConverged(...devices: Device[]) {
  const [first, ...rest] = await Promise.all(devices.map((d) => d.data()));
  for (const other of rest) {
    expect(other.reviewLogs).toEqual(first!.reviewLogs);
    expect(other.reviewCards).toEqual(first!.reviewCards);
  }
  expect(first!.reviewCards).toEqual([...replayAll(first!.reviewLogs).values()].sort((a, b) => (a.id < b.id ? -1 : 1)));
}
const cloudLogs = async (d: Device) => (await getDocs(collection(d.firestore, 'users', d.uid, 'logs'))).docs.map((x) => x.data());

const T0 = 1_800_000_000_000;

describe('sync on the Firestore emulator with the real rules', () => {
  it('two devices review offline, then sync: same logs and cards on both, equal to the replay', async () => {
    const a = await device('alice');
    const b = await device('alice');
    expect(b.uid).toBe(a.uid);
    await a.review('6C34', 'A', 'GOOD', T0);
    await b.review('6C34', 'A', 'AGAIN', T0 + 5_000); // the same card
    await a.review('706B', 'B', 'EASY', T0 + 10_000);
    await b.review('5C71', 'C', 'HARD', T0 + 20_000);
    for (const d of [a, b]) await d.repos.sync.bind(a.uid);
    synced(await a.sync());
    expect(synced(await b.sync())).toMatchObject({ pulled: 2, pushed: 2 });
    synced(await a.sync());
    await expectConverged(a, b);
    const docs = await cloudLogs(a);
    expect(docs).toHaveLength(4);
    expect(docs.every((d) => d.epoch === 0 && d.uploadedAt !== null)).toBe(true);
  });

  it('the order of syncing does not change the cards', async () => {
    const run = async (who: string, aFirst: boolean) => {
      const a = await device(who);
      const b = await device(who);
      await a.review('6C34', 'A', 'GOOD', T0);
      await b.review('6C34', 'A', 'HARD', T0 + 1);
      await a.review('6C34', 'A', 'EASY', T0 + 2);
      for (const d of [a, b]) await d.repos.sync.bind(a.uid);
      for (const d of aFirst ? [a, b, a] : [b, a, b]) synced(await d.sync());
      await expectConverged(a, b);
      return (await a.data()).reviewCards;
    };
    expect(await run('order1', true)).toEqual(await run('order2', false));
  });

  it(`uploads in batches of ${PUSH_BATCH} (each create reads users/{uid} in the rules) and pulls in pages`, async () => {
    const a = await device('bulk');
    const b = await device('bulk');
    await a.repos.sync.bind(a.uid);
    const n = PUSH_BATCH * 2 + 5;
    for (let i = 0; i < n; i += 1) await a.review((0x4e00 + (i % 9)).toString(16).toUpperCase(), (['A', 'B', 'C', 'D'] as const)[i % 4]!, 'GOOD', T0 + i * 1000);
    expect(synced(await a.sync()).pushed).toBe(n);
    expect(synced(await b.sync()).pulled).toBe(n);
    await expectConverged(a, b);
  });

  it('sending again never duplicates (a lost ledger write is recognised by the next pull)', async () => {
    const a = await device('resend');
    await a.repos.sync.bind(a.uid);
    await a.review('6C34', 'A', 'GOOD', T0);
    const real = a.repos.sync.markUploaded.bind(a.repos.sync);
    let lose = true;
    a.repos.sync.markUploaded = async (ids, epoch) => {
      if (lose) {
        lose = false;
        throw new Error('closed');
      }
      return real(ids, epoch);
    };
    await expect(a.sync()).rejects.toThrow('closed');
    expect(synced(await a.sync()).pushed).toBe(0);
    expect(await cloudLogs(a)).toHaveLength(1);
  });

  it('the rules refuse overwriting an existing log; the engine then pulls and renames a colliding legacy log', async () => {
    const a = await device('legacy');
    const b = await device('legacy');
    const cardId = 'kanji:kanji:U+6C34:A';
    const legacy = (rating: ReviewRating, at: number): ReviewLog => ({ id: `${cardId}#1`, cardId, rating, reviewedAt: at, durationMs: 1, stateBefore: 'NEW', stateAfter: 'LEARNING', datasetVersion: null, deviceId: null, originalId: null });
    await a.repos.backup.replaceUserData({ reviewCards: [], reviewLogs: [legacy('GOOD', T0)], studySessions: [], userSettings: null });
    await b.repos.backup.replaceUserData({ reviewCards: [], reviewLogs: [legacy('AGAIN', T0 + 1)], studySessions: [], userSettings: null });
    for (const d of [a, b]) await d.repos.sync.bind(a.uid);
    synced(await a.sync());
    // direct overwrite attempt: refused by the rules (create-only)
    await expect(b.cloud.pushLogs(b.uid, 0, [legacy('AGAIN', T0 + 1)])).rejects.toMatchObject({ kind: 'denied' });
    expect(synced(await b.sync()).renamed).toBe(1);
    synced(await a.sync());
    await expectConverged(a, b);
    const ids = (await cloudLogs(a)).map((d) => d.id as string).sort();
    expect(ids[0]).toBe(`${cardId}#1`);
    expect(ids[1]).toMatch(new RegExp(`^${cardId.replace(/[+]/g, '\\+')}#1~[0-9a-f]{16}$`));
  });

  it('D6: reset on A -> B (unaware) uploads nothing, is asked, and the rules refuse its stale epoch anyway', async () => {
    const a = await device('reset');
    const b = await device('reset');
    for (const d of [a, b]) await d.repos.sync.bind(a.uid);
    await a.review('6C34', 'A', 'GOOD', T0);
    synced(await a.sync());
    synced(await b.sync());
    await b.review('706B', 'A', 'GOOD', T0 + 1_000);

    await a.repos.backup.resetProgress();
    expect(synced(await a.sync()).replaced).toBe(true);
    expect(await cloudLogs(a)).toEqual([]);
    expect((await getDoc(doc(a.firestore, 'users', a.uid))).data()?.epoch).toBe(1);

    expect(await b.sync()).toMatchObject({ kind: 'remote-reset', epoch: 1, unsynced: 1 });
    await expect(b.cloud.pushLogs(b.uid, 0, await b.repos.sync.pendingLogs())).rejects.toMatchObject({ kind: 'denied' });
    expect(await cloudLogs(a)).toEqual([]);

    await b.repos.sync.acceptRemoteReset(1);
    synced(await b.sync());
    await expectConverged(a, b);
  });

  it('Import (Replace) twice: the cloud holds exactly the imported logs, in the newest epoch', async () => {
    const a = await device('import');
    await a.repos.sync.bind(a.uid);
    await a.review('6C34', 'A', 'GOOD', T0);
    synced(await a.sync());
    const imported: ReviewLog[] = [{ id: 'log:00000000-0000-4000-8000-000000000001', cardId: 'kanji:kanji:U+6728:B', rating: 'EASY', reviewedAt: T0 - 1, durationMs: 5, stateBefore: 'NEW', stateAfter: 'LEARNING', datasetVersion: null, deviceId: null, originalId: null }];
    for (let round = 1; round <= 2; round += 1) {
      await a.repos.backup.replaceUserData({ reviewCards: [...replayAll(imported).values()], reviewLogs: imported, studySessions: [], userSettings: { ...DEFAULT_USER_SETTINGS, theme: 'dark', updatedAt: 1 } });
      expect(synced(await a.sync())).toMatchObject({ replaced: true, settings: 'uploaded' });
      const docs = await cloudLogs(a);
      expect(docs.map((d) => [d.id, d.epoch])).toEqual([[imported[0]!.id, round]]);
    }
    expect((await getDoc(doc(a.firestore, 'users', a.uid, 'meta', 'settings'))).data()?.theme).toBe('dark');
  });

  it('settings follow the newer updatedAt between devices', async () => {
    const a = await device('settings');
    const b = await device('settings');
    await a.repos.settings.save({ ...DEFAULT_USER_SETTINGS, studyMode: 'C' });
    expect(synced(await a.sync()).settings).toBe('uploaded');
    expect(synced(await b.sync()).settings).toBe('downloaded');
    expect((await b.repos.sync.getSettings())?.studyMode).toBe('C');
  });

  it('isolation: another user can neither read nor write this user’s cloud data', async () => {
    const a = await device('owner');
    const mallory = await device('mallory');
    await a.repos.sync.bind(a.uid);
    await a.review('6C34', 'A', 'GOOD', T0);
    synced(await a.sync());
    await expect(mallory.cloud.pullLogs(a.uid, null, 10)).rejects.toMatchObject({ kind: 'denied' });
    await expect(mallory.cloud.readSettings(a.uid)).rejects.toMatchObject({ kind: 'denied' });
    await expect(mallory.cloud.pushLogs(a.uid, 0, (await a.data()).reviewLogs)).rejects.toBeInstanceOf(CloudError);
    await expect(mallory.cloud.deleteAll(a.uid)).rejects.toMatchObject({ kind: 'denied' });
    expect(await cloudLogs(a)).toHaveLength(1);
  });

  it('Delete Account (cloud part): every document of the user is gone; the other user is untouched', async () => {
    const a = await device('leaver');
    const other = await device('stayer');
    for (const d of [a, other]) {
      await d.repos.sync.bind(d.uid);
      await d.review('6C34', 'A', 'GOOD', T0);
      await d.repos.settings.save(DEFAULT_USER_SETTINGS);
      synced(await d.sync());
    }
    const env: SyncEnvironment = { isOnline: () => true, onOnline: () => () => undefined, onHidden: () => () => undefined, setTimer: () => 0, clearTimer: () => undefined, now: () => Date.now(), locks: null };
    const service = createSyncService({ repo: a.repos.sync, getCloud: () => a.cloud, env });
    expect(await service.deleteCloudData(a.uid)).toBe('deleted');
    expect(await cloudLogs(a)).toEqual([]);
    expect((await getDoc(doc(a.firestore, 'users', a.uid))).exists()).toBe(false);
    expect((await getDoc(doc(a.firestore, 'users', a.uid, 'meta', 'settings'))).exists()).toBe(false);
    expect(await cloudLogs(other)).toHaveLength(1);
    expect((await a.data()).reviewLogs).toHaveLength(1); // local data is a separate choice
  });

  it('a hand-written document with a client time or extra field is refused (the app never writes one)', async () => {
    const a = await device('forger');
    synced(await a.sync());
    await expect(setDoc(doc(a.firestore, 'users', a.uid, 'logs', 'log:x'), { id: 'log:x', uploadedAt: serverTimestamp() })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('Delete Account through the account service: cloud data first, then the Auth user (D-L2-6)', async () => {
    const a = await device('deleter');
    await a.repos.sync.bind(a.uid);
    await a.review('6C34', 'A', 'GOOD', T0);
    synced(await a.sync());
    const env: SyncEnvironment = { isOnline: () => true, onOnline: () => () => undefined, onHidden: () => () => undefined, setTimer: () => 0, clearTimer: () => undefined, now: () => Date.now(), locks: null };
    const order: string[] = [];
    const noPopup = { ...a.adapter, reauthenticateWithPopup: async () => undefined, deleteUser: async () => {
      order.push(`auth (cloud docs left: ${(await cloudLogs(a)).length})`);
      await a.adapter.deleteUser();
    } };
    const sync = createSyncService({ repo: a.repos.sync, getCloud: () => a.cloud, env });
    const account = createAccountService({
      available: true,
      loadAdapter: async () => noPopup,
      hint: { read: () => true, set: () => undefined, clear: () => undefined, subscribe: () => () => undefined },
      network: { isOnline: () => true, onOnline: () => () => undefined },
      resetLocalProgress: () => a.repos.sync.forgetLocalProgress(),
      cloudData: { delete: async (uid) => (order.push('cloud'), sync.deleteCloudData(uid)), resume: () => sync.resume() },
    });
    account.start();
    await expect.poll(() => account.getStatus().kind).toBe('signed-in');
    expect(await account.deleteAccount({ deleteLocalProgress: true })).toEqual({ account: 'deleted', reason: null, cloudData: 'deleted', localData: 'deleted' });
    expect(order).toEqual(['cloud', 'auth (cloud docs left: 0)']);
    expect(await a.repos.sync.hasLocalProgress()).toBe(false);
  });
});
