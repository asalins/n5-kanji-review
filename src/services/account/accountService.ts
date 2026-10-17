import type { CloudStore } from '../sync/cloudTypes';
import type { AccountHint } from './accountHint';
import { classifyAuthError } from './authErrors';
import type {
  AccountStatus,
  AccountUser,
  AdapterLoader,
  AuthAdapter,
  DeleteAccountResult,
  LocalDataResult,
  SignInResult,
  SignOutResult,
} from './accountTypes';

export interface NetworkState {
  isOnline(): boolean;
  onOnline(listener: () => void): () => void;
  /** L-1: going offline downgrades a confirmed session to signed-in-offline. */
  onOffline?(listener: () => void): () => void;
}

/** L-1: how long a cached session may wait for the server before it is shown as signed-in-offline. */
export const VERIFY_TIMEOUT_MS = 10_000;

/** L3b (D-L2-6): the cloud learning data, deleted before the account. Provided by the sync service. */
export interface CloudDataDeleter {
  delete(uid: string): Promise<'deleted' | 'failed'>;
  /** The account was not deleted after all: syncing may continue. */
  resume(): void;
}

export interface AccountServiceDeps {
  /** false = no config or no privacy contact e-mail: status stays `unavailable`, nothing is ever loaded. */
  readonly available: boolean;
  readonly loadAdapter: AdapterLoader;
  readonly hint: AccountHint;
  readonly network: NetworkState;
  /** The existing Reset progress (cards, logs, sessions). Used only when the user ticks the box. */
  readonly resetLocalProgress: () => Promise<void>;
  readonly logError?: (error: unknown) => void;
  readonly cloudData?: CloudDataDeleter;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface AccountService {
  getStatus(): AccountStatus;
  subscribe(listener: () => void): () => void;
  /** Start-up: loads the SDK only if the hint says this browser had a session. Never throws. */
  start(): void;
  signIn(): Promise<SignInResult>;
  signOut(options: { readonly deleteLocalProgress: boolean }): Promise<SignOutResult>;
  deleteAccount(options: { readonly deleteLocalProgress: boolean }): Promise<DeleteAccountResult>;
  /** C2: the account is gone but deleting local data failed — let the user try again. */
  retryLocalDelete(): Promise<LocalDataResult>;
  /** The cloud store of the loaded SDK (null while it is not loaded). Sync gates itself on the server, not on this. */
  getCloud(): CloudStore | null;
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  const { hint, network } = deps;
  const log = deps.logError ?? (() => undefined);
  let status: AccountStatus = deps.available ? { kind: 'signed-out', notice: null } : { kind: 'unavailable' };
  const listeners = new Set<() => void>();
  let adapter: AuthAdapter | null = null;
  let loading: Promise<AuthAdapter | null> | null = null;
  let user: AccountUser | null = null;
  /** Set just before the app itself ends an invalid session, so the following "no user" event keeps the notice. */
  let pendingNotice: 'account-invalid' | null = null;
  let started = false;
  /** The uid the server last confirmed (reload succeeded or a popup sign-in just happened). */
  let confirmedUid: string | null = null;
  /** A popup sign-in is running: the user it produces comes straight from the server. */
  let popupInProgress = false;
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));

  const set = (next: AccountStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };

  /**
   * Server check of the cached session (D-L2-4, L-1). Until the server answers the state is `checking`; after
   * VERIFY_TIMEOUT_MS without an answer it becomes signed-in-offline (the answer may still upgrade it). Only
   * account errors end the session.
   */
  async function verify(): Promise<void> {
    if (adapter === null || user === null) return;
    if (!network.isOnline()) {
      set({ kind: 'signed-in-offline', user });
      return;
    }
    const checking = user;
    const timeout = setTimer(() => {
      if (status.kind === 'checking' && user === checking) set({ kind: 'signed-in-offline', user: checking });
    }, VERIFY_TIMEOUT_MS);
    try {
      await adapter.reload();
      clearTimer(timeout);
      if (user !== null && user.uid === checking.uid) {
        confirmedUid = user.uid;
        set({ kind: 'signed-in', user });
      }
    } catch (error) {
      clearTimer(timeout);
      const kind = classifyAuthError(error, network.isOnline());
      if (kind === 'account') {
        await endInvalidSession();
      } else if (kind === 'network') {
        if (user !== null) set({ kind: 'signed-in-offline', user });
      } else {
        log(error); // unknown: never ends the session (C1), and never counts as the server's confirmation (L-1)
        if (status.kind === 'checking' && user !== null) set({ kind: 'signed-in-offline', user });
      }
    }
  }

  async function endInvalidSession(): Promise<void> {
    pendingNotice = 'account-invalid';
    confirmedUid = null;
    hint.clear();
    user = null;
    set({ kind: 'signed-out', notice: 'account-invalid' });
    try {
      await adapter?.signOut(); // drop the cached credentials too
    } catch (error) {
      log(error);
    }
  }

  function onUserChange(next: AccountUser | null): void {
    const already = next !== null && confirmedUid === next.uid && status.kind === 'signed-in';
    user = next;
    if (next === null) {
      // C1: a hint without a Firebase user is not a session.
      confirmedUid = null;
      hint.clear();
      set({ kind: 'signed-out', notice: pendingNotice });
      pendingNotice = null;
      return;
    }
    hint.set();
    if (already) return;
    if (popupInProgress) {
      confirmedUid = next.uid; // the popup sign-in itself was the server's answer
      set({ kind: 'signed-in', user: next });
      return;
    }
    // L-1: a cached user is NOT shown as signed-in before the server answered.
    if (!network.isOnline()) set({ kind: 'signed-in-offline', user: next });
    else set({ kind: 'checking', offline: false });
    void verify();
  }

  /** Loads the SDK chunk once. On a network failure the state stays `checking` (offline) and retries when online. */
  function ensureAdapter(): Promise<AuthAdapter | null> {
    if (adapter !== null) return Promise.resolve(adapter);
    if (loading !== null) return loading;
    loading = deps
      .loadAdapter()
      .then((loaded) => {
        adapter = loaded;
        loaded.onUserChange(onUserChange);
        return loaded;
      })
      .catch((error: unknown) => {
        log(error);
        loading = null;
        return null;
      });
    return loading;
  }

  async function startFromHint(): Promise<void> {
    if (adapter !== null) return;
    set({ kind: 'checking', offline: !network.isOnline() });
    const loaded = await ensureAdapter();
    if (loaded === null) set({ kind: 'checking', offline: true }); // keep the hint; retry when online (C1)
  }

  async function resetLocal(): Promise<LocalDataResult> {
    try {
      await deps.resetLocalProgress();
      return 'deleted';
    } catch (error) {
      log(error);
      return 'failed';
    }
  }

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (!deps.available || started) return;
      started = true;
      network.onOnline(() => {
        if (status.kind === 'checking' && adapter === null) void startFromHint();
        else if (status.kind === 'signed-in-offline') void verify();
      });
      network.onOffline?.(() => {
        if (status.kind === 'signed-in') set({ kind: 'signed-in-offline', user: status.user });
      });
      // Another tab signed in: load the SDK here too (it then follows that session). Sign-outs arrive via Firebase.
      hint.subscribe((present) => {
        if (present && adapter === null) void startFromHint();
      });
      if (hint.read()) void startFromHint();
    },

    async signIn() {
      if (!deps.available) return { ok: false, reason: 'unknown' };
      const loaded = await ensureAdapter();
      if (loaded === null) return { ok: false, reason: network.isOnline() ? 'unknown' : 'network' };
      try {
        popupInProgress = true;
        const signedIn = await loaded.signInWithPopup().finally(() => {
          popupInProgress = false;
        });
        hint.set();
        user = signedIn;
        confirmedUid = signedIn.uid;
        set({ kind: 'signed-in', user: signedIn });
        return { ok: true };
      } catch (error) {
        const reason = classifyAuthError(error, network.isOnline());
        if (reason === 'unknown') log(error);
        return { ok: false, reason: reason === 'recent-login' ? 'unknown' : reason };
      }
    },

    async signOut({ deleteLocalProgress }) {
      if (adapter === null) return { signedOut: false, localData: 'kept' };
      try {
        await adapter.signOut();
      } catch (error) {
        log(error);
        return { signedOut: false, localData: 'kept' }; // nothing local is touched if the sign-out failed
      }
      hint.clear();
      user = null;
      confirmedUid = null;
      set({ kind: 'signed-out', notice: null });
      return { signedOut: true, localData: deleteLocalProgress ? await resetLocal() : 'kept' };
    },

    async deleteAccount({ deleteLocalProgress }) {
      let cloudData: DeleteAccountResult['cloudData'] = 'none';
      const result = (account: DeleteAccountResult['account'], reason: DeleteAccountResult['reason'], localData: LocalDataResult = 'kept'): DeleteAccountResult => ({
        account,
        reason,
        cloudData,
        localData,
      });
      if (adapter === null || user === null) return result('failed', 'unknown');
      // 1. re-authenticate (Firebase requires a recent sign-in). Cancelling here deletes nothing.
      try {
        await adapter.reauthenticateWithPopup();
      } catch (error) {
        const reason = classifyAuthError(error, network.isOnline());
        if (reason === 'unknown') log(error);
        return result(reason === 'cancelled' ? 'not-deleted' : 'failed', reason);
      }
      // 2. cloud learning data FIRST (D-L2-6). If it cannot be deleted, stop: the account is not deleted either.
      const uid = user.uid;
      if (deps.cloudData !== undefined) {
        cloudData = await deps.cloudData.delete(uid);
        if (cloudData === 'failed') {
          deps.cloudData.resume();
          return result('failed', network.isOnline() ? 'unknown' : 'network');
        }
      }
      // 3. the account
      try {
        await adapter.deleteUser();
      } catch (error) {
        const reason = classifyAuthError(error, network.isOnline());
        if (reason === 'unknown') log(error);
        deps.cloudData?.resume();
        return result('failed', reason); // nothing local touched (the cloud data, if any, is already gone)
      }
      deps.cloudData?.resume();
      hint.clear();
      user = null;
      confirmedUid = null;
      set({ kind: 'signed-out', notice: null });
      // 4. local data: only after the account is gone, only if asked
      return result('deleted', null, deleteLocalProgress ? await resetLocal() : 'kept');
    },

    retryLocalDelete: () => resetLocal(),
    getCloud: () => adapter?.cloud() ?? null,
  };
}

export const browserNetwork: NetworkState = {
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  onOnline(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
  onOffline(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('offline', listener);
    return () => window.removeEventListener('offline', listener);
  },
};
