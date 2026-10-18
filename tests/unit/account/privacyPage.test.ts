import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../../../pwa.config';
import { PRIVACY_CONTACT_EMAIL } from '../../../src/services/account';
import { PRIVACY_LINKS, PRIVACY_TEXT } from '../../../src/features/account/strings';
import { PRIVACY_PAGE_PATH, renderPrivacyPage } from '../../../src/features/account/privacyPage';

const html = renderPrivacyPage();
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('public privacy page (Login Activation: privacy policy URL)', () => {
  it('has the same Thai and English text as the in-app Privacy screen', () => {
    const terms = [...doc.querySelectorAll('dt')].map((e) => e.textContent);
    const texts = [...doc.querySelectorAll('dd')].map((e) => e.textContent);
    const sections = [...PRIVACY_TEXT.th.sections, ...PRIVACY_TEXT.en.sections];
    expect(terms).toEqual(sections.map(([t]) => t));
    expect(texts).toEqual(sections.map(([, d]) => d));
    expect(doc.querySelector('section[lang="th"] h2')?.textContent).toBe(PRIVACY_TEXT.th.heading);
    expect(doc.querySelector('section[lang="en"] h2')?.textContent).toBe(PRIVACY_TEXT.en.heading);
  });

  it('names the contact e-mail and links the Google and Firebase policies', () => {
    expect(doc.body.textContent).toContain(PRIVACY_CONTACT_EMAIL);
    const hrefs = [...doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([PRIVACY_LINKS.google, PRIVACY_LINKS.firebase, '/']);
  });

  it('is static: no script, no external stylesheet or image, no Firebase', () => {
    expect(doc.querySelectorAll('script, link[rel="stylesheet"], img, iframe')).toHaveLength(0);
    expect(html).not.toMatch(/firebaseapp|apiKey|gstatic|googleapis/i);
  });

  it('is served as its own page, never replaced by the app shell', () => {
    expect(PRIVACY_PAGE_PATH).toBe('/privacy.html');
    const deny = pwaOptions.workbox?.navigateFallbackDenylist ?? [];
    expect(deny.some((r) => r.test('/privacy.html'))).toBe(true);
    expect(deny.some((r) => r.test('/privacy'))).toBe(true);
    expect(deny.some((r) => r.test('/'))).toBe(false);
  });
});
