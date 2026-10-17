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

### L3a CI result

- Run #1 (`39ed2ea`): **FAIL** — 23/24 rules tests passed; the batch-delete test failed with "Provided document
  reference is from a different Firestore instance": the TEST created a new Firestore instance per call, so the
  batch was never evaluated by the rules. Fixed in the test only (`a335afc`); rules unchanged.
- Run #2 (`a335afc`): **PASS** — job green; the step runs `test:auth-emulator && test:rules`, so both suites exited 0 (any failing test exits 1). Per-test counts were not captured in a screenshot.

## L3b (sync in the app) — owner decision, no Coordinator Gate

Same record as above: built on the owner's instruction to proceed without waiting for the Coordinator.

| Part | Where | What it does |
|---|---|---|
| L-1 fix | `services/account/accountService.ts` | A cached session is `checking` until `reload()` answers; no answer within 10 s or a network/unknown error → `signed-in-offline`; the `offline` event downgrades `signed-in`. A popup sign-in is the server answer (signed-in at once). Sync never reads the UI state or the hint: it needs a fresh id token (`confirmedUid`) and a successful Firestore request. |
| Migration v4 | `migrations/v4SyncState.ts` | Two new, empty stores `syncLedger` (logId → epoch) and `syncMeta` (binding, epoch, cursor, pending replace). Nothing existing touched; a failure keeps v3. Backups unchanged (format 2, no sync state). |
| Sync engine | `services/sync/syncEngine.ts` | gate → binding → root/epoch → pending replace → pull → push → settings. Only logs + settings travel; cards are recomputed from logs (replay) on every change. Cloud ids are final: a local unsynced log whose legacy id is taken by a different cloud log is renamed (`id~hash`, `originalId`) and uploaded. |
| Cloud | `services/account/firestoreCloud.ts` | Firestore code, imported only by the lazy `firebaseAdapter` chunk (signed-out users never download it). Push batches of 20 (each create's rule reads `users/{uid}`), pull pages of 300 ordered by (`uploadedAt`, id), deletes in batches of 400. No offline cache: IndexedDB + ledger is the outbox. |
| Scheduler | `services/sync/syncService.ts` | after the account is active, 30 s after a review/settings change, on `online`, when the page is hidden, "Sync now"; Web Locks `n5-sync`; backoff 30 s → 2 min → 10 min → 1 h; quota → paused 1 h; offline → nothing attempted. |
| Binding (D-L3-8) | engine + `SyncPanel` | Unbound device with progress: asks "upload / delete this device's progress and use the account's / do not sync". Progress bound to account A is never uploaded into B (no upload option). No progress: binds silently. |
| Reset / Import (D6) | `IndexedDbBackupRepository` + engine | Same IndexedDB transaction clears the ledger and, if bound, sets `pendingReplace`. Next sync: epoch + 1 (transaction), delete older-epoch logs, upload this device's logs, this device's settings win once. Another device then gets `remote-reset`: it uploads nothing, shows when and how many unsynced reviews it holds, and clears its progress only after "I understand" (backup export first is offered). |
| Delete Account (D-L2-6) | account service + `deleteCloudData` | re-authenticate → sync suspended, cross-tab lock → delete `users/{uid}` first, all logs, settings, root again → only then `deleteUser`. Cloud deletion failing stops everything (account kept) and says part may already be gone. |
| UI / Privacy | `SyncPanel.tsx`, `strings.ts` | Sync status, prompts above; Privacy (TH/EN) now states what is stored in Cloud Firestore (each review incl. the random device id, settings), that Reset/Import replace the cloud copy, and the deletion order. |

**Tests.** Unit: engine on an in-memory cloud that mirrors the rules (two devices, order independence, no
duplicates on resend, legacy collisions, D6, import twice, binding, settings, batching, failure in the middle),
scheduler (debounce, hidden, backoff, quota, offline, lock, binding, remote reset, delete), migration v4, L-1,
cloud-first deletion, UI. Mutation spot-checks: removing the epoch check, the card recompute or the rename each fails
tests. **Emulator (CI only):** `tests/emulator/sync.emulator.test.ts` runs the same scenarios through the real
Firestore code against the Firestore + Auth emulators with the real `firestore.rules`, plus isolation between users,
the full Delete Account order, and L-1 against the real Auth emulator. The in-memory cloud is never counted as
evidence for the rules.

**Known limits (recorded, not hidden).**
- Order of reviews comes from each device's clock; reviews of one card on two offline devices closer together than
  their clock difference may be replayed in a different order than they happened (no review is lost).
- A review recorded while a pull rewrites the same card is corrected at its own upload (cards follow logs).
- Quota exhaustion is tested only with the in-memory cloud (the emulator has no quotas).
- No browser E2E signs in (Google popup needs a real account): sync and L-1 in the browser are checked manually on
  Preview (L4).

## L3b results (2026-10-17)

### CI — emulator-tests run #3 (`e4fb7fb`): PASS
From the job summary (Vitest reports):
- Unit tests: 63 files, **819/819** passed.
- Emulator suite (Auth + sync on Firestore, real `firestore.rules`): 2 files, **22/22** passed
  (`authAdapter.emulator.test.ts` 10, `sync.emulator.test.ts` 12).
- Rules suite: 1 file, **24/24** passed.
(The delivery message had predicted "25" for the emulator suite; the actual file contents are 10 + 12 = 22, all run.)

### Firestore set-up on `n5-kanji-review-dev` (owner, Console)
- Cloud Firestore, Standard edition, database `(default)`, location **asia-southeast1**, production mode;
  no scheduled backups (Blaze-only; the project stays on Spark).
- Rules published 12:49 = `firestore.rules` of `e4fb7fb` (pasted in full; a first paste of the GitHub URL failed to
  save and was never published).
- Authorized domain added: `l3-sync.n5-kanji-review.pages.dev` (branch alias of the Preview).
- The Realtime Database setup dialog was opened by mistake and cancelled; no Realtime Database was created.

### Manual test on Preview (`l3-sync.n5-kanji-review.pages.dev`, PC Chrome + Android Chrome), owner
| # | Check | Result |
|---|---|---|
| 1–2 | Sign in on PC; new origin without progress binds silently; "Last synced" | PASS |
| 3 | 3 reviews on PC → `users/{uid}` (schema 1, epoch 0, resetAt null, server createdAt) + 3 `logs` with 12 fields, `epoch 0`, server `uploadedAt`, random `deviceId` | PASS |
| 4 | Android signs in → pulls → dashboard 3 = PC | PASS |
| 5 | 1 review on Android → uploaded when the app was left (4 logs) → PC syncs → 4 | PASS |
| 6 | L-1, PC offline + reload: "Offline: the account will be checked when you are back online" (`checking`, the Firebase chunk is not cached — L2 limitation); never "signed in" | PASS |
| 6b | L-1, connection lost on an open page: "Offline: still signed in, not checked with the server" + sync "Offline"; back online → synced by itself, no click | PASS |
| D6 | Android (airplane mode) reviews 1; PC Reset progress + sync → cloud logs deleted, `epoch 1`, server `resetAt`; PC reviews 1 (epoch 1). Android back online → **nothing uploaded**, "reset or replaced from another device at 13:29:45", unsynced 1; after "I understand" → Android = PC (1) | PASS |
| D-L2-6 | PC Delete account (local data kept): messages "account deleted / cloud learning data deleted / local data kept"; Firestore `users/{uid}` gone, `logs` empty; Authentication: no users; PC local progress still 1 | PASS |
| — | Android after the account was deleted elsewhere: signed out on reload, **without** the "account expired or deleted" notice | PASS with known limitation **L-2** (the SDK drops the session at start-up) |

Not tested by hand (covered by unit + emulator tests only): Import (Replace) while bound, binding prompt with
existing progress / another account, quota pause, cross-tab lock.
Production unchanged throughout: `ui-import-button` = `c6fdf23` (deployment `90ae9e05`).
