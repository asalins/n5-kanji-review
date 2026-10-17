import { describe, expect, it } from 'vitest';
import { PRIVACY_CONTACT_EMAIL, isAccountAvailable, isValidContactEmail, readFirebaseConfig } from '../../../src/services/account/accountConfig';
import { ACCOUNT_HINT_KEY, createAccountHint } from '../../../src/services/account/accountHint';

const ENV = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'n5-kanji-review-dev.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'n5-kanji-review-dev',
  VITE_FIREBASE_APP_ID: '1:2:web:3',
};

describe('account feature switch (D-L2-8 / C3)', () => {
  it('the privacy contact is the project mailbox', () => {
    expect(PRIVACY_CONTACT_EMAIL).toBe('n5kanjireview.support@gmail.com');
    expect(isValidContactEmail(PRIVACY_CONTACT_EMAIL)).toBe(true);
  });
  it('needs all four config values', () => {
    expect(readFirebaseConfig(ENV)).not.toBeNull();
    for (const key of Object.keys(ENV)) expect(readFirebaseConfig({ ...ENV, [key]: '' }), key).toBeNull();
    expect(readFirebaseConfig({})).toBeNull();
  });
  it('no config -> unavailable; no / invalid contact e-mail -> unavailable (no Login button)', () => {
    expect(isAccountAvailable(readFirebaseConfig(ENV), PRIVACY_CONTACT_EMAIL)).toBe(true);
    expect(isAccountAvailable(null, PRIVACY_CONTACT_EMAIL)).toBe(false);
    expect(isAccountAvailable(readFirebaseConfig(ENV), '')).toBe(false);
    expect(isAccountAvailable(readFirebaseConfig(ENV), 'not-an-email')).toBe(false);
  });
  it('the test/production build has no config -> the account is unavailable', () => {
    expect(readFirebaseConfig(import.meta.env)).toBeNull();
  });
});

describe('account hint', () => {
  it('stores only "1" under its own key; never an e-mail or token', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    const hint = createAccountHint(storage, null);
    expect(hint.read()).toBe(false);
    hint.set();
    expect([...data.entries()]).toEqual([[ACCOUNT_HINT_KEY, '1']]);
    expect(hint.read()).toBe(true);
    hint.clear();
    expect(data.size).toBe(0);
  });
  it('blocked storage never throws', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const hint = createAccountHint(broken, null);
    expect(() => { hint.set(); hint.clear(); }).not.toThrow();
    expect(hint.read()).toBe(false);
  });
});
