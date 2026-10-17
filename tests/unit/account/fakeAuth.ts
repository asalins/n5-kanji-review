import type { AccountHint } from '../../../src/services/account/accountHint';
import type { AccountUser, AuthAdapter } from '../../../src/services/account/accountTypes';
import { createAccountService, type NetworkState } from '../../../src/services/account/accountService';

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
  isOnline = () => this.online;
  onOnline(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  goOnline() {
    this.online = true;
    for (const l of this.listeners) l();
  }
}

export function setup(options: { available?: boolean; loadFails?: unknown; resetFails?: boolean } = {}) {
  const auth = new FakeAuth();
  const hint = new MemoryHint();
  const network = new FakeNetwork();
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
  });
  return { auth, hint, network, events, service, stopLoadFailing: () => (loadFails = null) };
}

export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
