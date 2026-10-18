# L3 Release Candidate — sync (Login + Cloud Sync stay off in Production)

Coordinator: L3 Release Preparation AUTHORIZED (Development-First); Production stays `05dec77` (L2, dark,
deployment `8af4b990`); no Firebase config in Cloudflare; no Production user data on `n5-kanji-review-dev`.

## 1. Release Candidate

| Item | Value |
|---|---|
| RC | **`dff6d4c`** on `l4-l3-integration` (pushed) |
| Chain | `05dec77` (production) ⊂ `846513d` (merge of L2 RC into the L3/L4-R line) ⊂ `dff6d4c` (merge of the release docs from `l4-remediation`) |
| Code vs `3217a1d` (L4-R) | only the D3 pair (`src/utils/userMessage.ts`, `tests/unit/storage/newerDatabase.test.ts`); everything else is docs |
| Code vs `846513d` | none (`git diff 846513d dff6d4c -- . ':!docs'` empty) |
| Fixes contained (`git merge-base --is-ancestor <fix> dff6d4c` = 0) | D3 `05dec77` · L4-C1/F2 `7c6e5c7` · F7/O4 `49c7083` · F8 `a48f177` · F9 `bb69ef5` · F10-A `8726033` · L4-R head `3217a1d` |
| Fast-forward from production | `05dec77` is an ancestor of `dff6d4c` |
| Storage | **migration v4**: two new empty stores `syncLedger`, `syncMeta`; nothing existing read, changed or deleted. Backup format 2 unchanged; sync state never in a backup |

## 2. Replay (D4)

`scripts/qa/replayCheck.ts` run from the RC code (`846513d`, identical code to `dff6d4c`) on Windows/Node 24 against
**every backup file available (21)**: production backups before/after L1 and L2 (format 1 and 2, 18 logs), L4
multi-device files (up to 63 logs), the 50-log import file, the L1/L2/L3 Preview upgrade files (V*, P*, Q*).
Result: **21 / 21 PASS, `differing = 0` in every file**; no log without its card. Evidence:
`L3-replayCheck-846513d.txt` (counts only, no learning content).

## 3. Preview upgrade L2 → L3 (`l3-upgrade-test`, PC Chrome normal profile, not signed in, simulated data)

Pushes: `05dec77` → `dff6d4c` (fast-forward). Production `05dec77` before and after.

| Step | Result | Evidence |
|---|---|---|
| Q0 L2 | 5 reviews (GOOD 4, AGAIN 1), new cards/day 20, Dark | `Q0-L2.json`: format 2, **DB 3**, 5 logs, 10 cards, 1 session |
| Q1 → L3 | Banner → Update. Home 5 · 4 · 1 · 80 % · 0/20 · 5/20 · Due 0 · 15 (= Q0). Account section shows the L3 text ("Signed in, your learning progress can be synced…"); not signed in | `Q1-L3.json`: format 2, **DB 4**; cards, logs, sessions, settings **identical to Q0 in every field** (incl. settings `updatedAt`) |
| Q2 one review on L3 | New log `log:<uuid>` with a device id, NEW → LEARNING, `originalId` null; the 5 earlier logs unchanged; only the reviewed card changed; settings unchanged | `Q2-L3.json`: 6 logs; no uid / sync state in the file |
| Replay | Q0, Q1, Q2 | PASS, `differing = 0` |

Fields added by migration v4: **none on existing records** (only the two empty stores). Fields of a new log are the L1
fields (`deviceId`, `originalId`), unchanged by L3.

## 4. CI

| Run | Branch / commit | Steps |
|---|---|---|
| `39107421919` | `l4-ci-l3-int` = `846513d` + CI-only workflow | verify (typecheck, unit, build) · `vitest tests/unit/storage` (migration v3→v4, D3 regression) · account isolation · emulators Auth + sync on Firestore + rules · E2E Chromium — **success** |
| `39107417681` | `l4-l3-integration` = `846513d` (`emulator-tests`) | unit + typecheck + emulators + rules — **success** |
| `39111452461` | `l4-ci-l3-int` = `235877b` (`dff6d4c` + CI-only workflow) | verify · migration v3→v4 + D3 regression · account isolation · emulators Auth + sync + rules · E2E Chromium — **success** |
| `39111148978` | `l4-l3-integration` = **`dff6d4c`** (`emulator-tests`) | unit + typecheck + emulators + rules — **success** |
| `39111452471` | `l4-ci-l3-int` = `235877b` (`emulator-tests`) | unit + typecheck + emulators + rules — **success** |

F2/F8/F9/F10-A regression: covered by the unit/emulator suites above (L4-R tests are in the RC unchanged) and by the
manual L4-R results (P1 A1–A4, P2 F8, F9-M, F10-M, S2, K1 in `l-series-readiness.md` and `l4-multidevice.md`).

## 5. Firestore Production — setup checklist (prepare only; nothing done yet)

Project `n5-kanji-review-prod` (Spark). To be done by the owner **only after the L3 Release Gate decides how Sync is
activated**.

| # | Step | Note |
|---|---|---|
| S1 | Firestore → Create database: Standard edition, `(default)`, location **asia-southeast1** (same as dev), **production mode** | production mode = deny all until rules are published |
| S2 | Rules → paste `firestore.rules` of the **released commit** in full → Publish | the header comment says "Preview / n5-kanji-review-dev only": it is only a comment; update the comment in a later docs change, not in the rules logic |
| S3 | Save the published rules from the Console and diff with the repo (`git diff --no-index --ignore-cr-at-eol`) | method of L3 G3 |
| S4 | Rules Playground: owner get `users/<uid>` allowed; other uid denied (read + create log) | as P1 A3 |
| S5 | API key: add **Cloud Firestore API** to the key's API restrictions (now: Identity Toolkit, Token Service) | referrers unchanged |
| S6 | No indexes needed beyond the defaults (queries use single-field ordering only) | to be confirmed by the smoke test (S8) |
| S7 | Spark quota: no scheduled backups; real quota still BLOCKED (simulated only) | user Export is the only backup |
| S8 | Smoke test on Production **after** Login Activation: one account, two devices, sync + Reset + Delete Account | with the owner's account only |

## 6. Activation order and recovery

Production stays dark until separate Gates:
1. **L3 Release (dark):** deploy `dff6d4c` with **no** `VITE_FIREBASE_*` → no account section, no Firebase request;
   DB v3 → v4 on every device.
2. **Login Activation Gate:** privacy policy URL, support e-mail as project member, OAuth status, then
   `VITE_FIREBASE_*` of `n5-kanji-review-prod` in the Cloudflare **Production** environment → new build; sign-in only.
3. **Cloud Sync Activation:** Firestore S1–S5 before or with step 2 (the L3 code syncs as soon as a user signs in and
   agrees; without a database or rules every request is expected to fail → "sync failed", local data untouched —
   expected from the L3 error handling, **not tested** against a project without a database).

Recovery:
- **R-1 again (v4):** after the L3 release no rollback to L2/L1 (`d77b8f19`, `8af4b990`): those open v3 and show the
  D3 message only from L2 on — L1 shows the old text. Fix-forward only (runbook `l1-release.md`).
- Sync fault after activation: remove `VITE_FIREBASE_*` and rebuild (dark again; local data kept; cloud data stays
  until the user deletes the account) — to be tested in the Login/Sync Gate.
- Firestore rules fault: republish the last good rules (keep the published text in the repo record).

## 7. Privacy

The Privacy text (TH/EN) already describes Firestore storage, deletion order and the 180-day Firebase statement. Open
for the Login Activation Gate: a public privacy policy URL (Google consent screen), support e-mail. Optional: name
the storage location (asia-southeast1).

## 8. Open / pending

- Not tested: Android/PWA L2 → L3 upgrade; sign-in and sync on the RC build itself (the Preview alias is not an
  authorized domain of `n5-kanji-review-dev`; L3/L4 sync behaviour is the one tested in L4/L4-R, code unchanged).
- Real Spark quota: BLOCKED.
