import { defineConfig } from 'vitest/config';

/**
 * Firebase Emulator integration tests (real firebase/auth + firebase/firestore against local emulators, never a
 * real project): L2 Auth adapter, L3b sync engine + real firestore.rules.
 *   firebase emulators:exec --only auth,firestore --project demo-n5 "npm run test:auth-emulator"   (CI)
 * Without the emulator variables the suites report BLOCKED and fail (never pass silently).
 * Files run one after another: they share (and clear) the emulators' data.
 */
export default defineConfig({
  test: { environment: 'node', include: ['tests/emulator/**/*.test.ts'], testTimeout: 30_000, fileParallelism: false },
});
