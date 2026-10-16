import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './pwa.config';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions),
  ],
  build: {
    rollupOptions: {
      // L0 Login Spike (branch login-spike only): a second, separate page. Firebase is bundled only into its chunk.
      input: { main: 'index.html', loginSpike: 'login-spike.html' },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
