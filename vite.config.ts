import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config';
import { renderPrivacyPage } from './src/features/account/privacyPage';

/** Emits the public privacy notice (dist/privacy.html) from the same text as the in-app Privacy screen. */
function privacyPage(): Plugin {
  return {
    name: 'n5-privacy-page',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'privacy.html', source: renderPrivacyPage() });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    privacyPage(),
    VitePWA(pwaOptions),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
