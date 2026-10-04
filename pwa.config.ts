import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * PWA layer = asset / app-shell caching and the update lifecycle ONLY. The generated service worker never
 * touches IndexedDB, repositories, the SRS, statistics or search; it caches no network/API responses.
 */
export const PWA_THEME_COLOR = '#b91c1c';
export const PWA_BACKGROUND_COLOR = '#fafaf9';

export const pwaManifest = {
  id: '/',
  name: 'N5 Kanji Review',
  short_name: 'N5 Kanji',
  description: 'ทบทวนคันจิ JLPT N5 ด้วยแฟลชการ์ดและระบบทบทวนแบบเว้นระยะ · N5 kanji flashcards with spaced repetition',
  lang: 'th',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  // orientation deliberately not locked (approved): phones, tablets and desktops choose freely
  theme_color: PWA_THEME_COLOR,
  background_color: PWA_BACKGROUND_COLOR,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
} satisfies Partial<VitePWAOptions['manifest']>;

export const pwaOptions: Partial<VitePWAOptions> = {
  // 'prompt': a new version waits until the user accepts it; nothing reloads by itself (approved).
  registerType: 'prompt',
  // Registration happens in src/app/pwaUpdate.ts (virtual:pwa-register/react), not via an injected script.
  injectRegister: false,
  // globPatterns below already precache the icons/favicon; do not list them a second time.
  includeManifestIcons: false,
  manifest: pwaManifest,
  workbox: {
    // App shell + bundled dataset chunks + icons: the app works offline after the first successful load.
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    // No runtime caching: no API or network response is ever cached (backups are local files, never fetched).
    runtimeCaching: [],
  },
};
