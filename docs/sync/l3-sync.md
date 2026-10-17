# L3 — Sync (status)

Plan: `docs/sync/l3-design-plan.md`.

**Gate record (2026-10-17):** the Coordinator opened the L3 *Design* Gate only (L2 Implementation: PASS WITH
DOCUMENTED DEVIATIONS; L-1 must be closed before sync is enabled). The **project owner decided to proceed without
waiting for the Coordinator's L3 Design decision** ("ทำเลยไม่รอ coordinator แล้ว"). This is recorded as an owner
decision, not as a Coordinator approval. Production stays `c6fdf23`.

## L3a (this branch, first commit)

- `firestore.rules` + `firebase.json` (emulators only; nothing is deployed).
- `tests/rules/firestoreRules.test.ts` (`npm run test:rules`, `@firebase/rules-unit-testing` 5.0.2): owner-only
  access, signed-out denied, logs create-only, stale/future epoch refused (D6), schema/size/extra-field checks,
  collision-renamed ids accepted, owner batch delete, settings validation, default deny.
- `.github/workflows/emulator-tests.yml`: Java 21 + firebase-tools 14.27.0 on GitHub Actions, runs the Auth emulator
  suite and the rules suite. **The development sandbox cannot run the Firestore emulator** (download of the emulator
  from storage.googleapis.com is blocked), so the rules suite is **BLOCKED here** and PASSES or FAILS only in CI.
- `src/services/sync/replay.ts` (D4 proof): cards derived from logs. Proven equal in every field on 10 random histories
  (2,000 reviews each), on the production-written backup, and on reviews recorded through the real app wiring; order of
  arrival does not matter. `scripts/qa/replayCheck.ts <backup.json>` runs the same check on any real backup.
- `tests/unit/sync/rulesContract.test.ts`: the enums/options/fields in the rules equal the app's.

Not in L3a: no sync code in the app, no Firestore SDK in the app bundle, no IndexedDB change, L-1 not changed yet
(L3b).
