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
| Reset / Import (D6) | `IndexedDbBackupRepository` + engine | **Superseded in L4-C1 (F2): see `l4-multidevice.md` — the cloud epoch is now raised first, atomically from the known epoch; `pendingReplace` is no longer created.** Original L3 behaviour: same IndexedDB transaction clears the ledger and, if bound, sets `pendingReplace`. Next sync: epoch + 1 (transaction), delete older-epoch logs, upload this device's logs, this device's settings win once. Another device then gets `remote-reset`: it uploads nothing, shows when and how many unsynced reviews it holds, and clears its progress only after "I understand" (backup export first is offered). |
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

## G1 findings and fixes (owner decision (ก), 2026-10-17)

Coordinator verdict on L3: CONDITIONAL ACCEPTANCE; G1–G3 to close. While running G1 (Preview, new test uid
`wGFnw9Bgz0MsBbiRi5TmLL5x5tQ2`; the earlier test uid was deleted by the Delete Account test):

| G1 step | Result |
|---|---|
| T1 binding prompt (Incognito, 2 reviews): prompt shown with e-mail and 3 choices; **Firestore empty until "Upload and sync"**; then root epoch 0 + 2 logs | PASS |
| T2 progress bound to another (deleted) uid: "belongs to another account", **no upload button**; cloud stays 2 logs; "delete this device's progress and use the account's data" → 2 | PASS |
| T3 Import (Replace) while bound (done in Incognito): cloud epoch 0→1, the 3 epoch-0 logs deleted, the 2 file logs re-uploaded with `epoch 1`, `uploadedAt` 1 s after `resetAt` | PASS |
| T3 another device after a replace: no upload, notice with time and unsynced count | PASS (shown twice, 14:30:17 and 14:35:13) |

Findings:
- **F1** (defect, C2): the Reset progress / Import confirmations still had the L1 local-only text; on a bound device
  they also replace the account's cloud data and every synced device. The tester pressed Reset progress expecting a
  local clear.
- **F2** (decision for the Coordinator): a device that has not yet seen another device's replace can still Reset /
  Import and replace the account again (by design: an explicit, confirmed action).
- **F3** (usability): the sync notice's "clear this device" and Danger-zone "Reset progress" sit on one page with
  similar wording and the same "I understand" box; while the notice was open the account was replaced again.
- **Unresolved**: the 14:35:13 raise (epoch 2→3) was made by the Incognito profile (it knew epoch 3 afterwards);
  the tester remembers only the notice's button, which cannot raise the epoch (code + regression test). The cloud
  was empty afterwards, which matches Reset progress, not Import. **Cause not provable: the app kept no record.**
- **F4** (risk found in review): a Firestore transaction re-run after a lost commit response would have raised the
  epoch twice.

Fixes in this commit:
- F1: on a bound device the Reset / Import confirmations add "the account's progress in the cloud is deleted /
  replaced and every synced device will be asked to clear" (+ how to clear only this device: sign out with the box).
- F3: while the remote-reset notice is unanswered, Reset progress and Import are disabled with a pointer to it.
- F4: `bumpEpoch` treats a re-run that finds exactly `from + 1` as its own commit (residual: a concurrent replace by
  another device in the same instant would be taken as ours; the lost-commit case cannot be produced in tests).
- F5: local sync log (last 40 entries, every tab of the origin, localStorage, never uploaded, no uid / e-mail /
  review data), shown under Account → Sync. Records Reset / Import requests (and whether they will replace the
  cloud), every epoch raise, remote resets, binding answers, accepted resets, failures, Delete Account.
- Tests: regression of the whole T1–T4 session (two profiles, two tabs, real bootstrap wiring) asserting the epoch
  only rises on Reset / Import and the log names the origin; F1/F3 UI; log ring buffer. Mutation checks: making
  "accept" leave a pending replace, or not blocking Reset during the notice, each fails a test.

## G1 re-run after `cc760e7` (2026-10-17, Preview, uid `wGFnw9…`)

| Step | Result |
|---|---|
| T6 F1: bound device, Reset confirmation shows the account / every-device warning (bold, TH+EN); Import confirmation likewise | PASS |
| T7 F3: during an unanswered remote-reset notice, Import file input disabled + pointer text; Reset progress disabled + pointer text (click does nothing) | PASS (the disabled Reset button did not look dimmed → fixed below) |
| T7 F5: log shows `[xkdy] Reset progress on this device…` → `raising the cloud epoch 3 -> 4` → `REPLACED the cloud`; other window `remote reset detected: cloud epoch 4, knew 3; nothing uploaded` → `user accepted…` with **no** raise after it (also 3 tabs at 15:03–15:04 accepted epoch 3 without raising) | PASS |
| T4 two tabs, 1 review, Sync now in both at once: 1 cloud log, epoch unchanged (4), both tabs show 1, no error | PASS (manual check shows no duplicate/no error; the lock itself is proven by unit test) |
| T5 rules edited to `&& false` (log create denied): "Sync failed, retries automatically", local review kept, epoch unchanged, nothing deleted; rules restored → Sync now → pending log uploaded (2 logs) | PASS, with **F6** |
| Quota exceeded | **BLOCKED** (cannot be produced on the Spark plan; unit test only) |

**F6** (found in T5, fixed here): the "page hidden" flush also fired while a back-off timer was pending, so every
tab switch retried and escalated the back-off (log: 7 denied attempts in 80 s; next retry 1 h). Now only a pending
30 s debounce of a local change is flushed on hide. Regression test added (fails on the old code). Also: disabled
secondary buttons are now visibly dimmed.

## G3 — security of the Dev data (live project `n5-kanji-review-dev`, separate from the emulator results)
- Emulator (CI): rules suite 24/24 on every run since `a335afc` (#2–#5).
- Live: the published rules were saved from the Console (Notepad, UTF-8) and compared with `firestore.rules` of
  `cc760e7`: `git diff --no-index --ignore-cr-at-eol --ignore-blank-lines` showed one hunk at line 1 only, identical
  text (`rules_version = '2';`) = the UTF-8 BOM PowerShell 5 adds; lines 2–101 identical.
- Live Rules Playground, `get /users/wGFnw9…/logs/log:0c530852…`, authenticated google.com:
  uid `wGFnw9…` → **allowed** (`isOwner`); uid `attacker-uid` → **denied**.
- Live stale epoch: not separately provable by hand — the app stops before sending (T3/T7: "nothing uploaded"), and
  the Playground cannot satisfy `uploadedAt == request.time`. Covered by: rules identical to the CI-tested file +
  emulator rules test "D6 stale/future epoch refused" + T5 showing the live rules do reject creates. **BLOCKED (live).**
