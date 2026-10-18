# Release Readiness — L1 → L2 → L3 (P1 / P2 / P3)

Coordinator decision after L4-R: **L4-R Milestone PASS WITH ACCEPTED LIMITATIONS**, Development-First Mode for P1–P3,
Production Release **NOT AUTHORIZED**. Production stays `c6fdf23` (`ui-import-button`, tag `release-2026-10-12-c6fdf23`).
Dev / Preview only; Firebase project `n5-kanji-review-dev`.

Status legend: **PASS** · **FAIL** · **BLOCKED** (cannot be done for a reason outside the code; never counted as PASS) ·
**OPEN** (not run yet) · **DECISION** (needs the owner / Coordinator).

## 0. Baseline

| Item | Value | Checked |
|---|---|---|
| Production | `c6fdf23` = `origin/ui-import-button` | `git fetch` 2026-10-18 |
| Branch stack (linear, each a fast-forward of production) | `l1-local-ids` `4cbcf40` (+2) → `l2-account` `2852109` (+4) → `l3-sync` `9a1455c` (+10) → `l4-multidevice` `7c6e5c7` (+11) → `l4-remediation` `3217a1d` (+16) | `git merge-base --is-ancestor` exit 0 for every branch; every local head = `origin/<branch>` |
| Automated tests at `3217a1d` | CI #8: unit 871/871 · emulator 24/24 · rules 25/25 · local `verify:all` exit 0 (E2E 47 passed / 38 skipped) | from the L4-R report; not re-run here (no Node.js on this machine) |

## 1. P1 — A1–A4 with a real second account (Release Blocker)

**Needs from the owner:** Google account **U2** (new test Gmail), created and signed in by the owner. Claude does not
create accounts or enter passwords.

Pre-checks (before A1):
1. The Preview alias that is tested (e.g. `l4-remediation.n5-kanji-review.pages.dev`) is in Firebase Auth → Authorized
   domains of `n5-kanji-review-dev`. Otherwise the popup fails with `auth/unauthorized-domain`. That is a setup issue, not a FAIL.
2. Note U1's root `epoch` and the log count in Firestore, and Export a backup of A (`replayCheck` baseline).
3. Note the U1 uid and the U2 uid (Firebase Auth → Users) for A3/A4.

| # | Steps | Expected | Automated coverage already present | Result |
|---|---|---|---|---|
| A1 | A bound to U1 → sign out (keep local data) → sign in U2 | Notice "this device's data belongs to another account", **no upload button**. Firestore `users/<U2>` holds no U1 data | `tests/unit/sync/syncSafety.test.tsx` (binding guard) | **PASS** |
| A2 | A: "Do not sync this device" for U2 → sign out → sign in U1 | Sync with U1 continues, data complete, `replayCheck` `differing = 0`, U1 log count unchanged | — | **PASS** (see note on replay) |
| A3 | Rules Playground as U2's uid: get / create on `users/<U1>` and `users/<U1>/logs/<id>`. B signed in as U2 sees no U1 data | Denied for read and write | `tests/rules/firestoreRules.test.ts` "another user can neither read nor write" (root, logs, settings) | **PASS** |
| A4 | C signed in as U2 → B (U2) Delete Account | B: cloud data deleted first, then Auth. Firestore has no `users/<U2>`. C is signed out (L-2 accepted). **U1 untouched** (epoch and log count as in pre-check 2) | `accountService.test.ts` "C2: Delete Account" (order) | **PASS** |

Safety: before you confirm A4, check that the e-mail shown on B is U2's. A4 deletes only U2.
Evidence: sync logs of every device, Firestore screenshots (root epoch, log count for U1 and U2), times.

### P1 results (2026-10-18, Preview `l4-remediation.n5-kanji-review.pages.dev` = `3217a1d`, project `n5-kanji-review-dev`)
Devices: A = PC Chrome (device tag `e3k3`), B = PC Chrome Incognito (`onkx`), C = Android Chrome (`loz0`).
U1 = `asalins.khumyu@…` uid `wGFnw9Bgz0MsBbiRi5TmLL5x5tQ2`; U2 = test Gmail, uid `7icVsl1udZcPT3RwVVdUCltu2rr1`.
Evidence: owner screenshots (sync logs, Firestore, Authentication, Rules Playground), both backup files.

| Step | Observed |
|---|---|
| Pre-check | U1 root `epoch 9`, `replacedBy b56f3410…`, `resetAt` 11:22:48, **22 logs** (18 `kanji:…#n` + 4 `log:<uuid>`). Auth: U1 only. Baseline backup `A.json` (11:31:49): 20 cards, 22 logs |
| A1 | 11:50:19 A signed in U2: "This device's progress belongs to another account"; buttons only "Delete this device's progress and use the account's data" / "Do not sync this device" (no upload). Log `asking before binding (other-account); nothing uploaded`. U2 appears in Auth; Firestore: **no `users/<U2>`**, U1 unchanged (epoch 9, 22 logs). Same notice and log line on Android C at 12:11:09 (second device) |
| A2 | 11:54:37 `binding answered by the user: skip` → "not synced with this account". Sign out → sign in U1 → synced 11:55:37 with no "other account" notice and no log line (nothing pulled or pushed; the engine logs a cycle only when something changed, `syncEngine.ts:200`). U1 Firestore unchanged. `A-after-A2.json` (12:16) vs `A.json`: reviewCards 20/20, reviewLogs 22/22, studySessions 4/4, userSettings **identical** field by field; no uid / `syncMeta` / `syncLedger` in the file. A synced again 12:15:50 after A4 without error |
| A3 | Rules Playground (Authenticated, provider `google.com`): unauthenticated get `users/<U1>` **denied**; U1 get `users/<U1>` **allowed** (control); U2 get `users/<U1>` **denied**; U2 get `users/<U1>/meta/settings` **denied**; U2 create `users/<U1>/logs/a3-test` **denied**. B (U2): `bound … (this device had no progress)`, `following cloud epoch 0`, 12:00:35 `pulled 0, pushed 2`; Home shows only U2's 2 reviews (Learned 2/196). Firestore: `users/<U2>` epoch 0, 2 logs; U1 still 22 |
| A4 | B (U2) Delete account: confirm disabled until "I understand", delete-local box not pre-ticked; result three separate lines "account deleted / learning data in the cloud deleted / learning data on this device is kept"; B signed out. Firestore: only `users/<U1>` (epoch 9, `replacedBy`/`resetAt` unchanged). Auth: U1 only. C (signed in as U2, binding not answered) after reload: signed out, no notice (L-2), U1 progress on C kept (Reviews today 4, Due 9) |

Notes / limits:
- Replay: `scripts/qa/replayCheck.ts` was not run (no Node.js on this machine). `A-after-A2.json` is identical to `A.json`, the S2 export for which the L4-R report recorded `differing = 0`.
- A3 3d was run with an empty document body, so `validLog` alone could deny it; a valid log from another uid is covered by the rules test (CI rules 25/25). The Location field is truncated in the screenshots of 3c/3d; paths as entered by the owner.
- A4 on C: the binding question was still open (not "skip") when U2 was deleted.

## 2. P2 — F8 manual smoke test (one run)

Device: Android Chrome / PWA or PC on the Preview of `3217a1d`. Signed in as U1, bound, synced.

| # | Steps | Expected | Result |
|---|---|---|---|
| F8-1 | Review 1–2 cards → "Sync now" → cut the network while it says "Syncing…" (flight mode / DevTools Offline) | Shows "offline" at once, or after ≤ 30 s reports offline / network error. **Not stuck on "Syncing…"** | **PASS** |
| F8-2 | While still offline: try Reset progress | Refused ("must be online"); nothing changes | **PASS** |
| F8-3 | Back online | Sync resumes by itself (or with Sync now). Sync log has no duplicate lines in the same minute. Cloud log count = before + reviews, **no duplicate log** | **PASS** |
| F8-4 | Export → `scripts/qa/replayCheck.ts` | `differing = 0` | **NOT RUN** (no Node.js; see below) |

### P2 results (2026-10-18, machine A = PC Chrome, device tag `e3k3`, U1, Preview `3217a1d`)
Method: Chrome DevTools network profile `F8-slow` (10 kbit/s up/down, 20 000 ms latency) to keep a cycle in flight, then the `Offline` preset. Evidence: owner screenshots.

| Step | Observed |
|---|---|
| Baseline | Normal sync 12:21:57 `pulled 0, pushed 2` (2 reviews). |
| F8-1 timeout | `F8-slow`, 2 more reviews, Sync now → 12:26:30 `sync timed out after 30 s: still waiting for the network; nothing is sent twice`; status "Sync failed; it retries automatically at 12:27:00" (not stuck on "Syncing…"). The request still in flight completed at 12:27:39: `synced (epoch 9): pulled 0, pushed 2` + `late result of the timed-out sync: synced`. No second cycle ran meanwhile (the 12:27:00 retry did not send anything). |
| F8-1 offline | Switched to `Offline`: Sync box "Offline: syncs when you are back online. Study as usual."; account "Offline: still signed in, not checked with the server"; 12:28:04 `sync failed: network (offline)`. |
| F8-2 | Reset progress offline (twice): "You must be online so the account can be checked first. Nothing was changed."; 12:29:35 / 12:30:24 `Reset progress refused: offline; nothing changed`. Home before and after: Reviews today 8, Correct 5, Incorrect 3, 63 %, quota 8/10. |
| F8-3 | `No throttling` → Last synced 12:31:37, no error, no new log line (nothing left to send; the engine logs only changes). Firestore `users/<U1>/logs` = **26** (22 + 4), 18 `kanji:…#n` + 8 `log:<uuid>`, all ids distinct; root still `epoch 9`. Home unchanged. |

Note: the late completion means the case "the cloud wrote, the answer came late" was exercised for real; the 2 logs were not uploaded again on reconnect.

## 3. P3 — Release Readiness checklist

### 3.1 Release scope per step — DECISION
| Release | Proposed commit | Content | Note |
|---|---|---|---|
| L1 | `4cbcf40` | Sync-ready local data: `log:<uuid>` ids, **IndexedDB migration v3**, **backup format 2** | No login, no Firebase |
| L2 | `2852109` | Optional account (login, logout, Delete Account, Privacy) | Visible only if Production has a Firebase config (see 3.4) |
| L3 | **`3217a1d`** (`l4-remediation`), not `9a1455c` | Sync + **IndexedDB migration v4** + the L4/L4-R fixes | `9a1455c` contains F2 (Release Blocker, fixed in L4-C1). Releasing L3 without L4 is not advised |

### 3.2 Migration
| Check | Status |
|---|---|
| v2 (production) → v3: unit `migrationV3.test.ts`, E2E `migrationV3.spec.ts` | PASS (L1) |
| Real production build → L1 build on the same origin (`productionUpgrade.spec.ts`, needs `N5_BASELINE_DIST`; otherwise skipped, never passed) | PASS on L1 · **OPEN for L2 and L3** (re-run with the production `dist` before each Release Gate) |
| v3 → v4: `migrationV4.test.ts`, `migrationPath.test.ts` | PASS (unit) |
| Android: production PWA → Preview update with data kept, once per release step | OPEN (L1 done on `l1-upgrade-test*`, see `l1-local-data.md`) |

### 3.3 Backup compatibility
| From \ Into | `c6fdf23` (prod) | L1 / L2 / L3 |
|---|---|---|
| format 1 (prod) | yes | yes (`production-backup-v1.json` fixture; B2 PASS in L4) |
| format 2 (L1+) | **no**: "unsupported backup format version" | yes |
| sync state in a backup | — | none (B3: no `syncLedger`, `syncMeta`, uid) |

Consequence: after L1, a user's new backups cannot be restored on `c6fdf23`. This matters for rollback (3.6).

### 3.4 Firebase Production configuration — DECISION
Today Production has no `VITE_FIREBASE_*`, so a Production build of L2/L3 shows **no account section** and no sync
(D-L2-8). To make L2/L3 do anything in Production you need:
1. **Which Firebase project:** a separate production project (recommended, the L3 design excluded using a production
   project for dev testing) or `n5-kanji-review-dev`.
2. Google sign-in provider; OAuth consent screen with the support e-mail `n5kanjireview.support@gmail.com`.
3. Firestore (Standard, `(default)`, location as in dev: `asia-southeast1`, production mode). Spark plan: no scheduled
   backups and a real daily quota (still **BLOCKED** to test; only SIMULATED PASS).
4. Authorized domains: `n5-kanji-review.pages.dev` only (not preview aliases).
5. Cloudflare Pages: `VITE_FIREBASE_*` in the **Production** environment. They are build-time values, so the Production
   `dist` will differ from the Preview `dist`. Record the hashes of both.
6. Before L2: decide whether L2 goes live with the account visible, or with no config (a "dark" release, identical
   behaviour to L1).

### 3.5 Security Rules
- Publish the `firestore.rules` of the **release commit** to the production project **before** the L3 build is
  deployed. Paste the file in full, then save the published text and diff it with the repo (method in `l3-sync.md`).
- Dev has rules published from `e4fb7fb` (12:49, `l3-sync.md`), plus the L4-C1 change (`replacedBy`): `git diff e4fb7fb 3217a1d -- firestore.rules` = 6+/4−. Make sure the production project gets the `3217a1d` version.
- A3 (P1) is the live cross-uid check.

### 3.6 Rollback / Recovery — **finding R-1 (DECISION, risk for the rollback plan)**
`openAppDatabase` opens IndexedDB with the version of its own latest migration. A browser that has run L1 (DB v3) or
L3 (DB v4) and is then served an older build gets `VersionError` → `StorageError('Failed to open the database')`:
the app cannot open its data on that origin. The data is not lost, but it can be read only by a build with the same or
a newer DB version.

| Rollback | DB versions | Effect for users who already opened the new build |
|---|---|---|
| L1 → `c6fdf23` | v3 → v2 | app cannot open its data; their L1 backups (format 2) also do not import |
| L2 → L1 | v3 → v3 | safe |
| L3 → L2 / L1 | v4 → v3 | app cannot open its data |
| L3 → `c6fdf23` | v4 → v2 | as above |

So the Cloudflare Rollback in `deployment.md` is safe only **within the same DB version**. Across L1 and L3 the recovery
path is **roll forward** (a fix on top of the release). Options for the Coordinator:
- **a.** Accept: document "no rollback across a DB version, roll forward only", and keep a tested fix-forward procedure (no code change).
- **b.** Code change (needs separate approval, it touches storage): a build that opens a newer DB without downgrading,
  or a rollback build that carries migrations v3/v4 unchanged.

Other recovery items:
- Account data loss: Firestore on Spark has no scheduled backups; the user's own Export is the only backup. State this in the user docs.
- Sync-induced damage: the existing remote-reset path (Export, then accept) is the recovery for a raised epoch (L4-C1 step 3).

### 3.7 User documentation (Coordinator conditions)
- F10: keep the clock warning. State that offline reviews with a wrong device clock are recorded with the device time
  and may be ordered or counted on the wrong day. **Do not claim** that all time errors are detected.
- O2: daily limits are per device (done in Settings and `srs-v1.md`).
- Merge Import does not exist (Replace only).

### 3.8 Per-release gate checklist (each of L1, L2, L3)
1. `git status --short` empty; release commit = approved; parent chain fast-forwards production.
2. `verify:all` + `qa:mutations` + CI (unit, emulator, rules) green on the release commit.
3. `productionUpgrade.spec.ts` with the current production `dist`.
4. Preview on the alias: PWA update from production → data kept (PC + Android).
5. L3 only: rules published and diffed; production Firebase config present; authorized domain set.
6. Rollback/forward plan for this step per 3.6.
7. Release Gate decision → fast-forward push (`deployment.md`) → post-deployment check → `RELEASES.md` row + tag.

## 4. Open items

| Item | Owner | Status |
|---|---|---|
| U2 account | owner | done (deleted again in A4) |
| P1 A1–A4 | owner (with Claude guiding) | **PASS** 2026-10-18 |
| P2 F8 smoke | owner (with Claude guiding) | **PASS** 2026-10-18 (F8-4 replay not run) |
| 3.1 L3 = `3217a1d` | Coordinator | DECISION |
| 3.4 Firebase production project, dark L2 or not | Coordinator / owner | DECISION |
| 3.6 R-1 rollback across DB versions (a or b) | Coordinator | DECISION |
| Real quota | — | BLOCKED (Spark) |
