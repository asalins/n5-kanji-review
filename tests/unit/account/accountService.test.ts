import { describe, expect, it } from 'vitest';
import { classifyAuthError } from '../../../src/services/account/authErrors';
import { USER, authError, settle, setup } from './fakeAuth';
import { VERIFY_TIMEOUT_MS } from '../../../src/services/account/accountService';

describe('availability and lazy loading (D-L2-1, D-L2-8)', () => {
  it('unavailable (no config or no contact e-mail): nothing is ever loaded, sign-in is refused', async () => {
    const { service, events, hint } = setup({ available: false });
    hint.value = true;
    service.start();
    expect(service.getStatus()).toEqual({ kind: 'unavailable' });
    expect(await service.signIn()).toEqual({ ok: false, reason: 'unknown' });
    expect(events.loads).toBe(0);
  });

  it('no hint at start-up: signed out and the SDK is NOT loaded', async () => {
    const { service, events } = setup();
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: null });
    expect(events.loads).toBe(0);
  });

  it('with a hint: checking, then the Firebase session decides', async () => {
    const { service, events, hint, auth } = setup();
    hint.value = true;
    auth.persisted = USER;
    service.start();
    expect(service.getStatus()).toEqual({ kind: 'checking', offline: false });
    await settle();
    expect(events.loads).toBe(1);
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
    expect(auth.calls).toContain('reload'); // server check at start-up (D-L2-4)
  });

  it('signing in loads the SDK only on the user action', async () => {
    const { service, events, hint } = setup();
    service.start();
    expect(events.loads).toBe(0);
    expect(await service.signIn()).toEqual({ ok: true });
    expect(events.loads).toBe(1);
    expect(hint.value).toBe(true);
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });
});

describe('C1: the hint is never proof of a sign-in', () => {
  it('hint present but Firebase has no user -> signed out, hint removed, no error shown', async () => {
    const { service, hint } = setup();
    hint.value = true;
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: null });
    expect(hint.value).toBe(false);
  });

  it.each(['auth/user-token-expired', 'auth/user-not-found', 'auth/user-disabled', 'auth/invalid-user-token'])(
    'account error %s -> signed out with the notice, hint removed, cached session dropped',
    async (code) => {
      const { service, hint, auth } = setup();
      hint.value = true;
      auth.persisted = USER;
      auth.reloadError = authError(code);
      service.start();
      await settle();
      await settle();
      expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: 'account-invalid' });
      expect(hint.value).toBe(false);
      expect(auth.calls).toContain('signOut');
    },
  );

  it('network error on the check -> stays signed in (offline), hint kept, re-checked when online', async () => {
    const { service, hint, auth, network } = setup();
    hint.value = true;
    auth.persisted = USER;
    auth.reloadError = authError('auth/network-request-failed');
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in-offline', user: USER });
    expect(hint.value).toBe(true);
    auth.reloadError = null;
    network.goOnline();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });

  it('offline at start-up with a cached session -> signed-in-offline, no server call', async () => {
    const { service, hint, auth, network } = setup();
    network.online = false;
    hint.value = true;
    auth.persisted = USER;
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in-offline', user: USER });
    expect(auth.calls).not.toContain('reload');
  });

  it('the SDK cannot be loaded (offline) -> stays checking, hint kept, loads when back online', async () => {
    const { service, hint, network, stopLoadFailing, auth } = setup({ loadFails: new TypeError('Failed to fetch dynamically imported module') });
    network.online = false;
    hint.value = true;
    auth.persisted = USER;
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'checking', offline: true });
    expect(hint.value).toBe(true);
    stopLoadFailing();
    network.goOnline();
    await settle();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });

  it('unknown error on the check -> never signed out on a guess, and never shown as confirmed (L-1)', async () => {
    const { service, hint, auth } = setup();
    hint.value = true;
    auth.persisted = USER;
    auth.reloadError = authError('auth/something-new');
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in-offline', user: USER });
    expect(hint.value).toBe(true);
  });

  it('error classes', () => {
    expect(classifyAuthError(authError('auth/user-disabled'), true)).toBe('account');
    expect(classifyAuthError(authError('auth/network-request-failed'), true)).toBe('network');
    expect(classifyAuthError(authError('auth/whatever'), false)).toBe('network'); // offline wins over unknown
    expect(classifyAuthError(authError('auth/whatever'), true)).toBe('unknown');
    expect(classifyAuthError(authError('auth/popup-closed-by-user'), true)).toBe('cancelled');
    expect(classifyAuthError(authError('auth/popup-blocked'), true)).toBe('popup-blocked');
    expect(classifyAuthError(authError('auth/requires-recent-login'), true)).toBe('recent-login');
    expect(classifyAuthError(new TypeError('error loading dynamically imported module'), true)).toBe('network');
  });
});

describe('shared session across tabs / the installed app (L0 finding)', () => {
  it('another tab signs in -> this tab loads the SDK and follows', async () => {
    const { service, hint, auth, events } = setup();
    service.start();
    expect(events.loads).toBe(0);
    auth.persisted = USER;
    hint.fromOtherTab(true);
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });

  it('another tab signs out -> Firebase tells this tab -> signed out', async () => {
    const { service, auth } = setup();
    service.start();
    await service.signIn();
    auth.emit(null);
    expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: null });
  });
});

describe('sign-in errors', () => {
  it.each([
    ['auth/popup-closed-by-user', 'cancelled'],
    ['auth/popup-blocked', 'popup-blocked'],
    ['auth/network-request-failed', 'network'],
    ['auth/internal-error', 'unknown'],
  ])('%s -> %s, still signed out, no hint', async (code, reason) => {
    const { service, auth, hint } = setup();
    service.start();
    auth.signInError = authError(code);
    expect(await service.signIn()).toEqual({ ok: false, reason });
    expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: null });
    expect(hint.value).toBe(false);
  });
});

describe('sign out (D-L2-2, D-L2-3)', () => {
  it('keeps local data by default', async () => {
    const { service, events, hint } = setup();
    await service.signIn();
    expect(await service.signOut({ deleteLocalProgress: false })).toEqual({ signedOut: true, localData: 'kept' });
    expect(events.resets).toBe(0);
    expect(hint.value).toBe(false);
    expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: null });
  });
  it('deletes local progress only when asked (existing Reset progress)', async () => {
    const { service, events } = setup();
    await service.signIn();
    expect(await service.signOut({ deleteLocalProgress: true })).toEqual({ signedOut: true, localData: 'deleted' });
    expect(events.resets).toBe(1);
  });
  it('a failed sign-out touches nothing local', async () => {
    const { service, events, auth } = setup();
    await service.signIn();
    auth.signOutError = authError('auth/network-request-failed');
    expect(await service.signOut({ deleteLocalProgress: true })).toEqual({ signedOut: false, localData: 'kept' });
    expect(events.resets).toBe(0);
  });
});

describe('C2: Delete Account reports every part separately', () => {
  const signedIn = async (opts: { resetFails?: boolean } = {}) => {
    const s = setup(opts);
    await s.service.signIn();
    return s;
  };

  it('cancelling the re-authentication deletes nothing', async () => {
    const { service, auth, events } = await signedIn();
    auth.reauthError = authError('auth/popup-closed-by-user');
    expect(await service.deleteAccount({ deleteLocalProgress: true })).toEqual({ account: 'not-deleted', reason: 'cancelled', cloudData: 'none', localData: 'kept' });
    expect(auth.calls).not.toContain('deleteUser');
    expect(events.resets).toBe(0);
    expect(service.getStatus().kind).toBe('signed-in');
  });

  it('deleteUser fails -> account failed, local data untouched', async () => {
    const { service, auth, events } = await signedIn();
    auth.deleteError = authError('auth/network-request-failed');
    expect(await service.deleteAccount({ deleteLocalProgress: true })).toEqual({ account: 'failed', reason: 'network', cloudData: 'none', localData: 'kept' });
    expect(events.resets).toBe(0);
  });

  it('order: re-authenticate -> delete the account -> then (only if asked) local data', async () => {
    const { service, auth, events, hint } = await signedIn();
    expect(await service.deleteAccount({ deleteLocalProgress: true })).toEqual({ account: 'deleted', reason: null, cloudData: 'none', localData: 'deleted' });
    expect(auth.calls.slice(-2)).toEqual(['reauth', 'deleteUser']);
    expect(events.resets).toBe(1);
    expect(hint.value).toBe(false);
    expect(service.getStatus()).toEqual({ kind: 'signed-out', notice: null });
  });

  it('account deleted but local delete failed -> reported separately; retry works', async () => {
    const { service } = await signedIn({ resetFails: true });
    expect(await service.deleteAccount({ deleteLocalProgress: true })).toEqual({ account: 'deleted', reason: null, cloudData: 'none', localData: 'failed' });
    expect(await service.retryLocalDelete()).toBe('failed');
  });

  it('local data kept when not asked', async () => {
    const { service, events } = await signedIn();
    expect((await service.deleteAccount({ deleteLocalProgress: false })).localData).toBe('kept');
    expect(events.resets).toBe(0);
  });

  it('cloud data is always reported as "none" in L2 (nothing is claimed to be deleted in the cloud)', async () => {
    const { service } = await signedIn();
    expect((await service.deleteAccount({ deleteLocalProgress: false })).cloudData).toBe('none');
  });
});

describe('L-1: a cached session is never shown as signed-in before the server answered', () => {
  it('checking until reload succeeds, then signed-in', async () => {
    const { service, hint, auth } = setup();
    hint.value = true;
    auth.persisted = USER;
    let answer!: () => void;
    auth.reloadGate = new Promise<void>((r) => (answer = r));
    service.start();
    await settle();
    expect(auth.calls).toContain('reload');
    expect(service.getStatus()).toEqual({ kind: 'checking', offline: false });
    answer();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });

  it(`no answer within ${VERIFY_TIMEOUT_MS / 1000} s -> signed-in-offline; a late answer still confirms`, async () => {
    const { service, hint, auth, timers } = setup();
    hint.value = true;
    auth.persisted = USER;
    let answer!: () => void;
    auth.reloadGate = new Promise<void>((r) => (answer = r));
    service.start();
    await settle();
    expect([...timers.pending.values()].map((t) => t.ms)).toEqual([VERIFY_TIMEOUT_MS]);
    timers.fireAll();
    expect(service.getStatus()).toEqual({ kind: 'signed-in-offline', user: USER });
    answer();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });

  it('a network error on the check -> signed-in-offline (not signed-in), then confirmed when back online', async () => {
    const { service, hint, auth, network } = setup();
    hint.value = true;
    auth.persisted = USER;
    auth.reloadError = authError('auth/network-request-failed');
    service.start();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in-offline', user: USER });
    auth.reloadError = null;
    network.goOnline();
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
  });

  it('going offline downgrades a confirmed session to signed-in-offline', async () => {
    const { service, hint, auth, network } = setup();
    hint.value = true;
    auth.persisted = USER;
    service.start();
    await settle();
    expect(service.getStatus().kind).toBe('signed-in');
    network.goOffline();
    expect(service.getStatus()).toEqual({ kind: 'signed-in-offline', user: USER });
  });

  it('a popup sign-in is the server answer: signed-in at once, no extra checking state', async () => {
    const { service, auth } = setup();
    service.start();
    const seen: string[] = [];
    service.subscribe(() => seen.push(service.getStatus().kind));
    expect(await service.signIn()).toEqual({ ok: true });
    await settle();
    expect(service.getStatus()).toEqual({ kind: 'signed-in', user: USER });
    expect(seen).not.toContain('checking');
    expect(auth.calls.filter((c) => c === 'reload')).toEqual([]);
  });
});

describe('D-L2-6 (L3b): Delete Account deletes the cloud learning data first', () => {
  const signedIn = async (cloud: 'deleted' | 'failed') => {
    const order: string[] = [];
    const deleter = {
      delete: async (uid: string) => {
        order.push(`cloud:${uid}`);
        return cloud;
      },
      resume: () => order.push('resume'),
    };
    const ctx = setup({ cloudData: deleter });
    ctx.service.start();
    await ctx.service.signIn();
    return { ...ctx, order };
  };

  it('re-authenticate -> cloud data -> account -> (local); reported part by part', async () => {
    const { service, auth, order } = await signedIn('deleted');
    const result = await service.deleteAccount({ deleteLocalProgress: false });
    expect(result).toEqual({ account: 'deleted', reason: null, cloudData: 'deleted', localData: 'kept' });
    expect(auth.calls.slice(-2)).toEqual(['reauth', 'deleteUser']);
    expect(order).toEqual([`cloud:${USER.uid}`, 'resume']);
  });

  it('cloud deletion fails -> STOP: the account is not deleted and nothing local is touched', async () => {
    const { service, auth, events, order } = await signedIn('failed');
    const result = await service.deleteAccount({ deleteLocalProgress: true });
    expect(result).toEqual({ account: 'failed', reason: 'unknown', cloudData: 'failed', localData: 'kept' });
    expect(auth.calls).not.toContain('deleteUser');
    expect(events.resets).toBe(0);
    expect(order).toEqual([`cloud:${USER.uid}`, 'resume']);
    expect(service.getStatus().kind).toBe('signed-in');
  });

  it('cancelled re-authentication -> the cloud data is not touched', async () => {
    const { service, auth, order } = await signedIn('deleted');
    auth.reauthError = authError('auth/popup-closed-by-user');
    expect((await service.deleteAccount({ deleteLocalProgress: true })).account).toBe('not-deleted');
    expect(order).toEqual([]);
  });
});
