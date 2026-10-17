import type { AuthErrorClass } from './accountTypes';

const ACCOUNT = new Set(['auth/user-token-expired', 'auth/user-not-found', 'auth/user-disabled', 'auth/invalid-user-token']);
const NETWORK = new Set(['auth/network-request-failed', 'auth/timeout', 'auth/internal-error-offline']);
const CANCELLED = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

export function authErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) return String((error as { code: unknown }).code);
  return '';
}

/** A failed dynamic import of the SDK chunk (offline, or a dropped connection) is a network problem. */
function isChunkLoadFailure(error: unknown): boolean {
  return error instanceof TypeError && /dynamically imported module|Failed to fetch|Importing a module script failed|error loading/i.test(error.message);
}

/** C1 / D-L2-4: account errors end the session; network and unknown errors never do. */
export function classifyAuthError(error: unknown, online: boolean): AuthErrorClass {
  const code = authErrorCode(error);
  if (ACCOUNT.has(code)) return 'account';
  if (CANCELLED.has(code)) return 'cancelled';
  if (code === 'auth/popup-blocked') return 'popup-blocked';
  if (code === 'auth/requires-recent-login') return 'recent-login';
  if (NETWORK.has(code) || isChunkLoadFailure(error) || !online) return 'network';
  return 'unknown';
}
