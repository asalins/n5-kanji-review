# L2 Release Candidate — dark deployment

Coordinator (after L1 Post-deploy PASS): prepare L2 in Development-First Mode; **no Production deploy** until a separate
L2 Release Gate. Production stays `4cbcf40` (L1, deployment `d77b8f19`).

## 1. Release Candidate

| Item | Value |
|---|---|
| RC | **`05dec77`** on `l2-release` (pushed) |
| Chain | `4cbcf40` (production) → `9874b80` (L2 code, Gate PASS) → `2852109` (docs) → `05dec77` (D3) |
| Change since L2 Gate | `05dec77` only: `src/utils/userMessage.ts` +17, new `tests/unit/storage/newerDatabase.test.ts` |
| Storage | **no new migration**: DB stays v3, backup format 2 → L2 ↔ L1 are on the same DB version |
| Config / deps vs `4cbcf40` | `package.json` (+`firebase` 12.19.0, `test:auth-emulator`), `pwa.config.ts` (Firebase chunk excluded from precache) |

### D3 — storage error text
`isNewerDatabaseError`: a `StorageError` whose cause is named `VersionError` (the browser holds a database written by a
newer build). Message: data is still here · close every tab and window and reopen to load the latest version · do not
clear site data (TH + EN). No claim about a rollback. Every other `StorageError` keeps the previous text.

## 2. Checks

| Check | Result |
|---|---|
| CI on Linux (branch `l4-ci-l2-rc` = `05dec77` + a CI-only workflow, never released), run `39105925225` | **success**: `npm run verify` (typecheck, all unit tests, build), Auth emulator tests, E2E (Chromium) via `scripts/qa/e2e.ts` |
| Local (Windows, Node 24) | typecheck PASS; new tests 3/3; full unit: 4 suites cannot load `virtual:pwa-register` on Windows and 1 SRS property test times out (5 s) — **identical on baseline `2852109`**, so environmental; all pass on CI |
| Dark build (no `VITE_FIREBASE_*`, like Production) | build PASS; `scripts/qa/accountIsolation.ts dist`: one account chunk, Firebase only there, not in `index.html`, not precached → **PASS**; no `n5-kanji-review-dev`, `firebaseapp.com` or API key string anywhere in `dist` |
| Without config the account section is not rendered | by design (D-L2-8) and unit-tested ("hidden without config"); the Preview build has the dev config, so the section is visible there |

Limits: the per-step test counts of the CI run were not read (log download needs a GitHub login); `productionUpgrade.spec.ts`
was not run with `N5_BASELINE_DIST` = the `4cbcf40` dist.

## 3. Preview test (`l2-upgrade-test`, PC Chrome normal profile, simulated data)

Pushes, one at a time, all fast-forward: `4cbcf40` → `05dec77` → `1a7f86e` (L3 tree `3217a1d`, test only) →
`f460894` (L2 RC tree `05dec77`, test only). Production `4cbcf40` before and after every push.

| Step | Result | Observed |
|---|---|---|
| P0 L1 | PASS | 3 reviews, new cards/day 20. Home 3 · 3 · 0 · 100 % · 0/20 · 3/20 · 0 · 17. `P0-L1.json`: format 2, DB 3, 3 logs, 10 cards |
| P1 L1 → L2 RC | PASS | Reload → banner → Update. Home identical. Settings 20 / 20 / System; account section visible (Preview config), not signed in. 1 review → 4 · 4 · 0 · 4/20 · 16. `P1-L2.json`: format 2, DB 3; the 3 P0 logs identical in every field; only the reviewed card changed; settings identical; one new `log:<uuid>`; no uid / sync state / device record in the file |
| P2 L2 → L3 tree | PASS | Banner → Update. Home 4 · 4 · 0 · 4/20 · 16; account text of L3 ("synced between your devices … asked before anything is uploaded"); not signed in |
| P3 L3 → L2 RC tree (DB v4 → v3) | **D3 PASS** | "เริ่มแอปไม่สำเร็จ" + the new text "ข้อมูลในเครื่องนี้สร้างโดยแอปเวอร์ชันที่ใหม่กว่า ข้อมูลของคุณยังอยู่ · ปิดแอปนี้ทุกแท็บและทุกหน้าต่าง … · อย่าล้างข้อมูลเว็บไซต์ · …Do not clear site data."; no "ตรวจพื้นที่ว่าง" |

The `l2-upgrade-test` origin is left at DB v4 with the L2 tree (test data only). Commits `1a7f86e` and `f460894` exist
only on `l2-upgrade-test`.

## 4. Git path to L3 (finding)

`3217a1d` (L3 RC) does **not** contain `05dec77`: both branch from `2852109`. After L2 is released at `05dec77`, the
L3 release cannot be a fast-forward of `3217a1d`. `git merge-tree l4-remediation 05dec77` is clean (no conflict; the two
files of `05dec77` are untouched on the L3 line). Proposal: L3 RC = merge of `05dec77` into `l4-remediation`, re-run CI
on the merge, then the L3 Gate. The L4/L4-R code is unchanged; the release docs on `l4-remediation` then reach
`ui-import-button` with the L3 release (no extra production deployment for docs).

## 5. Firebase Production project — preparation only (for the later Login Gate)

Nothing below is done yet; it needs the owner (Google account) and a Gate before Login is enabled.

| # | Item | Note |
|---|---|---|
| F1 | New project, e.g. `n5-kanji-review` (not `-dev`), Spark plan | no Analytics |
| F2 | Authentication → Google provider; support e-mail `n5kanjireview.support@gmail.com`; OAuth consent screen (app name, privacy link) | |
| F3 | Authorized domains: `n5-kanji-review.pages.dev` only; remove `localhost` if not needed | no preview aliases |
| F4 | Web app → config (`apiKey`, `authDomain`, `projectId`, `appId`) | client config, not a secret |
| F5 | API key restrictions (Google Cloud Console): HTTP referrer `https://n5-kanji-review.pages.dev/*`; APIs: Identity Toolkit, Token Service (+ Firestore only at L3) | |
| F6 | **No Firestore database** until the L3 Gate (Cloud Sync stays off) | L3: Standard, `(default)`, `asia-southeast1`, rules from the L3 RC |
| F7 | Cloudflare: `VITE_FIREBASE_*` **Production** environment only, set in the same change as the Login release | build-time values → the Login build is a new Production build |
| F8 | Smoke after the Login release: sign in/out (PC, Android, PWA), Privacy, Delete Account, offline start-up | as the L2 manual matrix |
