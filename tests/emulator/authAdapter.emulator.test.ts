import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithCredential, type Auth } from 'firebase/auth';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { adapterForAuth } from '../../src/services/account/firebaseAdapter';
import { classifyAuthError } from '../../src/services/account/authErrors';
import { createAccountService } from '../../src/services/account/accountService';
import type { AccountUser } from '../../src/services/account/accountTypes';

const HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
const PROJECT = 'demo-n5';
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

beforeAll(() => {
  if (HOST === '') throw new Error('AUTH EMULATOR BLOCKED — FIREBASE_AUTH_EMULATOR_HOST is not set (no emulator running).');
});

let app: FirebaseApp | null = null;
afterEach(async () => {
  if (app !== null) await deleteApp(app);
  app = null;
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
});

let counter = 0;
async function signedInAuth(): Promise<{ auth: Auth; uid: string; email: string }> {
  counter += 1;
  app = initializeApp({ apiKey: 'fake-api-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:0:web:0' }, `t${counter}`);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, `http://${HOST}`, { disableWarnings: true });
  const email = `learner${counter}@example.com`;
  // The emulator accepts an unsigned Google id token: a Google sign-in without a popup.
  const credential = GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${counter}`, email, email_verified: true }));
  const { user } = await signInWithCredential(auth, credential);
  return { auth, uid: user.uid, email };
}

const admin = (path: string, body: object) =>
  fetch(`http://${HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/${path}`, { method: 'POST', headers: OWNER, body: JSON.stringify(body) }).then((r) => {
    if (!r.ok) throw new Error(`emulator ${path}: ${r.status}`);
  });

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO ERROR';
  } catch (error) {
    return String((error as { code?: unknown }).code);
  }
}

describe('real Firebase Auth (emulator) through the app adapter', () => {
  it('reports the signed-in Google user (uid + e-mail only)', async () => {
    const { auth, uid, email } = await signedInAuth();
    const seen: (AccountUser | null)[] = [];
    adapterForAuth(auth).onUserChange((u) => seen.push(u));
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toEqual({ uid, email });
  });

  it('reload succeeds for a live account', async () => {
    const { auth } = await signedInAuth();
    expect(await codeOf(() => adapterForAuth(auth).reload())).toBe('NO ERROR');
  });

  it('account deleted elsewhere (console) -> reload fails with an ACCOUNT error class', async () => {
    const { auth, uid } = await signedInAuth();
    await admin('accounts:delete', { localId: uid });
    const code = await codeOf(() => adapterForAuth(auth).reload());
    expect(['auth/user-token-expired', 'auth/user-not-found']).toContain(code);
    expect(classifyAuthError({ code }, true)).toBe('account');
  });

  it('account disabled -> reload fails with auth/user-disabled (account class)', async () => {
    const { auth, uid } = await signedInAuth();
    await admin('accounts:update', { localId: uid, disableUser: true });
    const code = await codeOf(() => adapterForAuth(auth).reload());
    expect(code).toBe('auth/user-disabled');
    expect(classifyAuthError({ code }, true)).toBe('account');
  });

  it('signOut -> the adapter reports no user', async () => {
    const { auth } = await signedInAuth();
    const seen: (AccountUser | null)[] = [];
    const adapter = adapterForAuth(auth);
    adapter.onUserChange((u) => seen.push(u));
    await adapter.signOut();
    await expect.poll(() => seen.at(-1)).toBeNull();
  });

  it('deleteUser removes the account from Auth (a new sign-in gets a new uid)', async () => {
    const { auth, uid } = await signedInAuth();
    await adapterForAuth(auth).deleteUser();
    expect(auth.currentUser).toBeNull();
    const lookup = await fetch(`http://${HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: [uid] }) });
    expect(((await lookup.json()) as { users?: unknown[] }).users ?? []).toEqual([]);
  });

  it('service + real Auth: a console-deleted account ends the session with the notice and clears the hint (C1)', async () => {
    const { auth, uid } = await signedInAuth();
    let hint = true;
    const service = createAccountService({
      available: true,
      loadAdapter: async () => adapterForAuth(auth),
      hint: { read: () => hint, set: () => void (hint = true), clear: () => void (hint = false), subscribe: () => () => undefined },
      network: { isOnline: () => true, onOnline: () => () => undefined },
      resetLocalProgress: async () => undefined,
    });
    await admin('accounts:delete', { localId: uid });
    service.start();
    await expect.poll(() => service.getStatus()).toEqual({ kind: 'signed-out', notice: 'account-invalid' });
    expect(hint).toBe(false);
  });

  it('service + real Auth: Delete Account deletes the Auth user; cloud "none"; local kept', async () => {
    const { auth, uid } = await signedInAuth();
    const adapter = adapterForAuth(auth);
    // re-authentication needs a popup; the emulator path re-uses the same credential instead
    const noPopup = { ...adapter, reauthenticateWithPopup: async () => undefined };
    let hint = true;
    const service = createAccountService({
      available: true,
      loadAdapter: async () => noPopup,
      hint: { read: () => hint, set: () => void (hint = true), clear: () => void (hint = false), subscribe: () => () => undefined },
      network: { isOnline: () => true, onOnline: () => () => undefined },
      resetLocalProgress: async () => undefined,
    });
    service.start();
    await expect.poll(() => service.getStatus().kind).toBe('signed-in');
    expect(await service.deleteAccount({ deleteLocalProgress: false })).toEqual({ account: 'deleted', reason: null, cloudData: 'none', localData: 'kept' });
    const lookup = await fetch(`http://${HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: [uid] }) });
    expect(((await lookup.json()) as { users?: unknown[] }).users ?? []).toEqual([]);
    expect(hint).toBe(false);
  });
});
