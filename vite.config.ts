import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Basic PWA only. Offline strategy, dataset caching, update flow and icons are Phase 10.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'N5 Kanji Review',
        short_name: 'N5 Kanji',
        display: 'standalone',
        start_url: '/',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
