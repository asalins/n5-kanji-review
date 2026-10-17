import type { CloudStore } from '../sync/cloudTypes';

/** L2 account types. The account is optional: the app works fully without it (local-first). */

export interface AccountUser {
  readonly uid: string;
  readonly email: string | null;
}

/**
 * The account state the UI shows. The only source of truth for "signed in" is Firebase Auth (C1):
 * the local account hint only decides whether the SDK is loaded at start-up.
 *  - unavailable: no Firebase config or no privacy contact e-mail -> the account section is not shown at all.
 *  - signed-out: no user (notice explains why, when the app ended the session itself).
 *  - checking: a hint exists and the SDK is loading / the cached session is being read (offline: cannot load yet),
 *    or a cached user is being checked with the server (L-1: never shown as signed-in before the server answers).
 *  - signed-in: Firebase has a user and the server accepted it (or it was just signed in).
 *  - signed-in-offline: Firebase has a cached user, but the server could not be reached to check it.
 */
export type AccountStatus =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'signed-out'; readonly notice: 'account-invalid' | null }
  | { readonly kind: 'checking'; readonly offline: boolean }
  | { readonly kind: 'signed-in'; readonly user: AccountUser }
  | { readonly kind: 'signed-in-offline'; readonly user: AccountUser };

/** Error classes (C1 / D-L2-4). Only `account` ends a session; `network` and `unknown` keep the current state. */
export type AuthErrorClass = 'account' | 'network' | 'cancelled' | 'popup-blocked' | 'recent-login' | 'unknown';

export type SignInResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: Exclude<AuthErrorClass, 'account' | 'recent-login'> | 'account' };

export type LocalDataResult = 'kept' | 'deleted' | 'failed';

export interface SignOutResult {
  readonly signedOut: boolean;
  readonly localData: LocalDataResult;
}

/**
 * Delete Account outcome, reported part by part (C2). Nothing is ever summarised as "everything deleted".
 *  - account: deleted | not-deleted (cancelled before anything happened) | failed (an error; nothing local touched)
 *  - cloudData (L3b, D-L2-6): deleted BEFORE the account. 'failed' = the cloud data could not be deleted, so the
 *    account was NOT deleted either (try again). 'none' = no cloud store is wired (tests only).
 *  - localData: only touched after the account was deleted, and only if the user asked for it
 */
export interface DeleteAccountResult {
  readonly account: 'deleted' | 'not-deleted' | 'failed';
  readonly reason: AuthErrorClass | null;
  readonly cloudData: 'none' | 'deleted' | 'failed';
  readonly localData: LocalDataResult;
}

/** What the service needs from Firebase. The real one is loaded only on demand (lazy chunk). */
export interface AuthAdapter {
  /** Fires once with the persisted user (or null), then on every change, including changes made in other tabs. */
  onUserChange(listener: (user: AccountUser | null) => void): () => void;
  signInWithPopup(): Promise<AccountUser>;
  reauthenticateWithPopup(): Promise<void>;
  /** Asks the server about the current user (detects deleted/disabled accounts). */
  reload(): Promise<void>;
  signOut(): Promise<void>;
  deleteUser(): Promise<void>;
  /** L3b: the user's cloud data (Firestore, same lazy chunk). null when no cloud is configured (tests). */
  cloud(): CloudStore | null;
}

export type AdapterLoader = () => Promise<AuthAdapter>;
