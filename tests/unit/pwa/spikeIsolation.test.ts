import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../../pwa.config';

// L0 Login Spike (branch login-spike only).
describe('L0 spike is outside the PWA', () => {
  it('the spike page and its chunk are never precached', () => {
    expect(pwaOptions.workbox?.globIgnores).toEqual(['login-spike.html', 'assets/loginSpike-*.js']);
  });
  it('the service worker never answers /login-spike with the app shell', () => {
    const deny = pwaOptions.workbox?.navigateFallbackDenylist ?? [];
    expect(deny.some((r) => r.test('/login-spike'))).toBe(true);
    expect(deny.some((r) => r.test('/'))).toBe(false);
    expect(deny.some((r) => r.test('/index.html'))).toBe(false);
  });
});
