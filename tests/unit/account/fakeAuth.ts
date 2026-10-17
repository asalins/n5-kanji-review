import type { AccountHint } from '../../../src/services/account/accountHint';
import type { AccountUser, AuthAdapter } from '../../../src/services/account/accountTypes';
import { createAccountService, type CloudDataDeleter, type NetworkState } from '../../../src/services/account/accountService';
import type { CloudStore } from '../../../src/services/sync/cloudTypes';

export const authError = (code: string) => Object.assign(new Error(code), { code });
export const USER: AccountUser = { uid: 'uid-1', email: 'learner@example.com' };

/** A controllable stand-in for Firebase Auth. `persisted` is what Firebase restores at start-up. */
export class FakeAuth implements AuthAdapter {
  persisted: AccountUser | null = null;
  reloadError: unknown = null;
  signInError: unknown = null;
  reauthError: unknown = null;
  deleteError: unknown = null;
  signOutError: unknown = null;
  /** When set, reload() waits for this promise (a slow / silent server). */
  reloadGate: Promise<void> | null = null;
  cloudStore: CloudStore | null = null;
  calls: string[] = [];
  private listeners = new Set<(user: AccountUser | null) => void>();

  onUserChange(listener: (user: AccountUser | null) => void) {
    this.listeners.add(listener);
    queueMicrotask(() => listener(this.persisted));
    return () => this.listeners.delete(listener);
  }
  emit(user: AccountUser | null) {
    this.persisted = user;
    for (const l of this.listeners) l(user);
  }
  async signInWithPopup() {
    this.calls.push('signIn');
    if (this.signInError !== null) throw this.signInError;
    this.emit(USER);
    return USER;
  }
  async reauthenticateWithPopup() {
    this.calls.push('reauth');
    if (this.reauthError !== null) throw this.reauthError;
  }
  async reload() {
    this.calls.push('reload');
    if (this.reloadGate !== null) await this.reloadGate;
    if (this.reloadError !== null) throw this.reloadError;
  }
  async signOut() {
    this.calls.push('signOut');
    if (this.signOutError !== null) throw this.signOutError;
    this.emit(null);
  }
  async deleteUser() {
    this.calls.push('deleteUser');
    if (this.deleteError !== null) throw this.deleteError;
    this.emit(null);
  }
  cloud() {
    return this.cloudStore;
  }
}

export class MemoryHint implements AccountHint {
  value = false;
  private listeners = new Set<(present: boolean) => void>();
  read = () => this.value;
  set = () => {
    this.value = true;
  };
  clear = () => {
    this.value = false;
  };
  subscribe(listener: (present: boolean) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Another tab changed the hint. */
  fromOtherTab(present: boolean) {
    this.value = present;
    for (const l of this.listeners) l(present);
  }
}

export class FakeNetwork implements NetworkState {
  online = true;
  private listeners = new Set<() => void>();
  private offlineListeners = new Set<() => void>();
  isOnline = () => this.online;
  onOnline(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onOffline(listener: () => void) {
    this.offlineListeners.add(listener);
    return () => this.offlineListeners.delete(listener);
  }
  goOnline() {
    this.online = true;
    for (const l of this.listeners) l();
  }
  goOffline() {
    this.online = false;
    for (const l of this.offlineListeners) l();
  }
}

/** Manually fired timers (the L-1 verify timeout). */
export class FakeTimers {
  private next = 1;
  readonly pending = new Map<number, { fn: () => void; ms: number }>();
  set = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.pending.set(id, { fn, ms });
    return id;
  };
  clear = (handle: unknown) => {
    this.pending.delete(handle as number);
  };
  fireAll() {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const t of all) t.fn();
  }
}

export function setup(options: { available?: boolean; loadFails?: unknown; resetFails?: boolean; cloudData?: CloudDataDeleter } = {}) {
  const auth = new FakeAuth();
  const hint = new MemoryHint();
  const network = new FakeNetwork();
  const timers = new FakeTimers();
  const events = { loads: 0, resets: 0 };
  let loadFails = options.loadFails ?? null;
  const service = createAccountService({
    available: options.available ?? true,
    loadAdapter: async () => {
      events.loads += 1;
      if (loadFails !== null) throw loadFails;
      return auth;
    },
    hint,
    network,
    resetLocalProgress: async () => {
      events.resets += 1;
      if (options.resetFails === true) throw new Error('reset failed');
    },
    setTimer: timers.set,
    clearTimer: timers.clear,
    ...(options.cloudData === undefined ? {} : { cloudData: options.cloudData }),
  });
  return { auth, hint, network, timers, events, service, stopLoadFailing: () => (loadFails = null) };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
