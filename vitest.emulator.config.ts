import { defineConfig } from 'vitest/config';

/**
 * L2 Firebase Auth Emulator integration tests (real firebase/auth against the local emulator, never a real project).
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run test:auth-emulator
 * Without the variable the suite reports BLOCKED and fails (never passes silently).
 */
export default defineConfig({
  test: { environment: 'node', include: ['tests/emulator/**/*.test.ts'], testTimeout: 20_000 },
});
