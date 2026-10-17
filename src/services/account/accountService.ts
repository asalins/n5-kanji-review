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

  const set = (next: AccountStatus) => {
    status = next;
    for (const listener of listeners) listener();
  };

  /** Server check of the cached session (D-L2-4). Only account errors end it. */
  async function verify(): Promise<void> {
    if (adapter === null || user === null) return;
    if (!network.isOnline()) {
      set({ kind: 'signed-in-offline', user });
      return;
    }
    try {
      await adapter.reload();
      if (user !== null) set({ kind: 'signed-in', user });
    } catch (error) {
      const kind = classifyAuthError(error, network.isOnline());
      if (kind === 'account') {
        await endInvalidSession();
      } else if (kind === 'network') {
        if (user !== null) set({ kind: 'signed-in-offline', user });
      } else {
        log(error); // unknown: keep the current state (C1)
      }
    }
  }

  async function endInvalidSession(): Promise<void> {
    pendingNotice = 'account-invalid';
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
    user = next;
    if (next === null) {
      // C1: a hint without a Firebase user is not a session.
      hint.clear();
      set({ kind: 'signed-out', notice: pendingNotice });
      pendingNotice = null;
      return;
    }
    hint.set();
    set(network.isOnline() ? { kind: 'signed-in', user: next } : { kind: 'signed-in-offline', user: next });
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
        if (status.kind === 'checking') void startFromHint();
        else if (status.kind === 'signed-in-offline') void verify();
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
        const signedIn = await loaded.signInWithPopup();
        hint.set();
        user = signedIn;
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
      set({ kind: 'signed-out', notice: null });
      return { signedOut: true, localData: deleteLocalProgress ? await resetLocal() : 'kept' };
    },

    async deleteAccount({ deleteLocalProgress }) {
      const result = (account: DeleteAccountResult['account'], reason: DeleteAccountResult['reason'], localData: LocalDataResult = 'kept'): DeleteAccountResult => ({
        account,
        reason,
        cloudData: 'none',
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
      // 2. cloud learning data: none in L2 (L3 must delete it HERE, before the account; D-L2-6)
      // 3. the account
      try {
        await adapter.deleteUser();
      } catch (error) {
        const reason = classifyAuthError(error, network.isOnline());
        if (reason === 'unknown') log(error);
        return result('failed', reason); // nothing local touched
      }
      hint.clear();
      user = null;
      set({ kind: 'signed-out', notice: null });
      // 4. local data: only after the account is gone, only if asked
      return result('deleted', null, deleteLocalProgress ? await resetLocal() : 'kept');
    },

    retryLocalDelete: () => resetLocal(),
  };
}

export const browserNetwork: NetworkState = {
  isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  onOnline(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
};
