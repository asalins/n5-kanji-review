/**
 * L3b: the Firestore side of sync. Imported ONLY by firebaseAdapter.ts, so it lives in the same lazily loaded
 * chunk: a user who never signs in never downloads it. No offline cache (memory cache only): the app's own
 * IndexedDB + ledger is the outbox. Layout and rules: firestore.rules.
 */
import type { Auth } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { reviewLogSchema, userSettingsSchema } from '../../types/schemas';
import type { ReviewLog, UserSettings } from '../../types/entities';
import { CloudError, DELETE_BATCH, type CloudErrorKind, type CloudStore } from '../sync/cloudTypes';

const CODE_KIND: Record<string, CloudErrorKind> = {
  unavailable: 'network',
  'deadline-exceeded': 'network',
  'resource-exhausted': 'quota',
  unauthenticated: 'auth',
  'permission-denied': 'denied',
  'auth/network-request-failed': 'network',
  'auth/user-token-expired': 'auth',
  'auth/user-not-found': 'auth',
  'auth/user-disabled': 'auth',
  'auth/invalid-user-token': 'auth',
};

function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  return new CloudError(CODE_KIND[code] ?? 'unknown', `Cloud request failed${code === '' ? '' : ` (${code})`}`, { cause: error });
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toCloudError(error);
  }
}

const LOG_FIELDS = ['id', 'cardId', 'rating', 'reviewedAt', 'durationMs', 'stateBefore', 'stateAfter', 'datasetVersion', 'deviceId', 'originalId'] as const;
const SETTINGS_FIELDS = ['dailyNewCards', 'dailyReviewLimit', 'theme', 'uiLanguage', 'soundEnabled', 'autoPlay', 'studyMode', 'animationsEnabled', 'updatedAt'] as const;
const settingsData = (settings: UserSettings) => ({ ...pick(settings as unknown as Record<string, unknown>, SETTINGS_FIELDS), uploadedAt: serverTimestamp() });
const pick = <K extends string>(source: Record<string, unknown>, keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, source[k]])) as Record<K, unknown>;

export function createFirestoreCloud(db: Firestore, auth: Auth): CloudStore {
  const root = (uid: string) => doc(db, 'users', uid);
  const logs = (uid: string) => collection(db, 'users', uid, 'logs');
  const settingsDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'settings');
  const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : null);

  async function deleteQueryPages(uid: string, constraints: QueryConstraint[]): Promise<number> {
    let deleted = 0;
    for (;;) {
      const page = await getDocs(query(logs(uid), ...constraints, limit(DELETE_BATCH)));
      if (page.empty) return deleted;
      const batch = writeBatch(db);
      for (const d of page.docs) batch.delete(d.ref);
      await batch.commit();
      deleted += page.size;
    }
  }

  return {
    confirmedUid: () =>
      guarded(async () => {
        const user = auth.currentUser;
        if (user === null) return null;
        await user.getIdToken(); // refreshed by the SDK when expired; an invalid account fails here
        return user.uid;
      }),

    readOrCreateRoot: (uid) =>
      guarded(() =>
        runTransaction(db, async (tx) => {
          const snap = await tx.get(root(uid));
          if (snap.exists()) {
            const data = snap.data();
            return { epoch: Number(data.epoch), resetAt: millis(data.resetAt), created: false };
          }
          tx.set(root(uid), { schema: 1, epoch: 0, resetAt: null, createdAt: serverTimestamp() });
          return { epoch: 0, resetAt: null, created: true };
        }),
      ),

    // F4: the SDK re-runs a transaction whose commit result was lost (e.g. the connection dropped after the server
    // committed). A re-run that finds exactly from + 1 is this call's own commit, not another device's reset:
    // report success instead of a conflict, so the caller never raises the epoch a second time.
    bumpEpoch: (uid, from, token, settings) => {
      let attempts = 0;
      return guarded(() =>
        runTransaction(db, async (tx) => {
          attempts += 1;
          const snap = await tx.get(root(uid));
          const epoch = snap.exists() ? Number(snap.data().epoch) : null;
          if (attempts > 1 && epoch === from + 1 && snap.data()?.replacedBy === token) return from + 1;
          if (epoch !== from) throw new CloudError('conflict', `epoch is ${String(epoch)}, expected ${from}`);
          tx.update(root(uid), { epoch: from + 1, resetAt: serverTimestamp(), replacedBy: token });
          if (settings !== null) tx.set(settingsDoc(uid), settingsData(settings));
          return from + 1;
        }),
      );
    },

    pullLogs: (uid, after, size) =>
      guarded(async () => {
        const constraints: QueryConstraint[] = [orderBy('uploadedAt'), orderBy(documentId())];
        if (after !== null) constraints.push(startAfter(new Timestamp(after.seconds, after.nanoseconds), after.id));
        const page = await getDocs(query(logs(uid), ...constraints, limit(size)));
        const out: (ReviewLog & { epoch: number })[] = [];
        let invalid = 0;
        let cursor = after;
        for (const d of page.docs) {
          const data = d.data();
          const at = data.uploadedAt;
          if (at instanceof Timestamp) cursor = { seconds: at.seconds, nanoseconds: at.nanoseconds, id: d.id };
          const parsed = reviewLogSchema.safeParse(pick(data, LOG_FIELDS));
          if (parsed.success && parsed.data.id === d.id && typeof data.epoch === 'number') out.push({ ...parsed.data, epoch: data.epoch });
          else invalid += 1;
        }
        return { logs: out, invalid, cursor, last: page.size < size };
      }),

    pushLogs: (uid, epoch, batchLogs) =>
      guarded(async () => {
        const batch = writeBatch(db);
        for (const log of batchLogs) batch.set(doc(logs(uid), log.id), { ...pick(log as unknown as Record<string, unknown>, LOG_FIELDS), epoch, uploadedAt: serverTimestamp() });
        await batch.commit();
      }),

    deleteLogsBelow: (uid, epoch) => guarded(() => deleteQueryPages(uid, [where('epoch', '<', epoch)])),

    readSettings: (uid) =>
      guarded(async () => {
        const snap = await getDoc(settingsDoc(uid));
        if (!snap.exists()) return null;
        const parsed = userSettingsSchema.safeParse(pick(snap.data(), SETTINGS_FIELDS));
        return parsed.success ? parsed.data : null;
      }),

    // D-F9: a device that has not learned about a replace must never write its old settings over the new epoch's.
    writeSettings: (uid, epoch, settings: UserSettings) =>
      guarded(() =>
        runTransaction(db, async (tx) => {
          const snap = await tx.get(root(uid));
          const current = snap.exists() ? Number(snap.data().epoch) : null;
          if (current !== epoch) throw new CloudError('conflict', `epoch is ${String(current)}, expected ${epoch}`);
          tx.set(settingsDoc(uid), settingsData(settings));
        }),
      ),

    // users/{uid} goes FIRST: if the deletion stops half-way, every device then sees "the cloud was reset or
    // deleted" (remote-reset, the user decides) instead of syncing silently with a half-deleted cloud.
    deleteAll: (uid) =>
      guarded(async () => {
        await deleteDoc(root(uid));
        await deleteQueryPages(uid, []);
        await deleteDoc(settingsDoc(uid));
        await deleteDoc(root(uid)); // again: another device may have re-created it meanwhile (it holds no learning data)
      }),
  };
}
