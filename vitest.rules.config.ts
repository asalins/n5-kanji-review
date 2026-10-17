import { defineConfig } from 'vitest/config';

/**
 * L3a Firestore Security Rules tests against the Firestore Emulator (never a real project).
 *   firebase emulators:exec --only firestore "npm run test:rules"      (CI: .github/workflows/emulator-tests.yml)
 * Without FIRESTORE_EMULATOR_HOST the suite fails with "FIRESTORE EMULATOR BLOCKED" (never passes silently).
 */
export default defineConfig({
  test: { environment: 'node', include: ['tests/rules/**/*.test.ts'], testTimeout: 20_000, fileParallelism: false },
});
