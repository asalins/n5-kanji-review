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

## 3a. Pre-deploy conditions (Coordinator: L2 Release Gate CONDITIONAL APPROVAL)

**Dark build in a browser** (`05dec77` built without `VITE_FIREBASE_*`, served locally with `vite preview`, Chrome):
Settings shows only Study limits, Kanji font, Backup & Restore, About & Sources, Danger zone — **no Account, no
Privacy**; Resource Timing: **no request** to any Google / Firebase / gstatic host and the `firebaseAdapter` chunk is not
loaded; service-worker precache 18 entries, none Firebase; `localStorage` empty; IndexedDB version **3**.
Production environment variables in Cloudflare: `NODE_VERSION = 22` only (screenshot 2026-10-18 13:35; to be re-checked
right before the deploy).

**Android, short run** (Preview `l2-android-test`, Android Chrome tab + installed PWA from that alias):
| Step | Result |
|---|---|
| A0 L1 (`4cbcf40`) | PWA installed; 3 reviews, new cards/day 20; tab and PWA both 3 · 3 · 0 · 100 % · 0/20 · 3/20 · 0 · 17 (one screenshot showed 3/10 · 7, most likely taken before the setting was changed; after closing and reopening the PWA: 3/20 · 17, setting 20) |
| A1 → L2 RC (`05dec77`) | PWA: banner → Update → Home identical, setting 20, L2 account section visible (Preview config; not signed in), export "Backup file created" (6.22 KB). Chrome tab: banner shown with identical figures |

The exported Android file was not compared field by field (it stays on the phone).

## 4. Git path to L3 (finding)

`3217a1d` (L3 RC) does **not** contain `05dec77`: both branch from `2852109`. After L2 is released at `05dec77`, the
L3 release cannot be a fast-forward of `3217a1d`. `git merge-tree l4-remediation 05dec77` is clean (no conflict; the two
files of `05dec77` are untouched on the L3 line). Proposal: L3 RC = merge of `05dec77` into `l4-remediation`, re-run CI
on the merge, then the L3 Gate. The L4/L4-R code is unchanged; the release docs on `l4-remediation` then reach
`ui-import-button` with the L3 release (no extra production deployment for docs).

**Done (Coordinator: approved, must be tested before any L3 Gate):** L3 Integration Candidate **`846513d`** on
`l4-l3-integration` = `--no-ff` merge of `05dec77` into `l4-remediation` (`96add42`). Contains both `3217a1d` and
`05dec77`; compared with `3217a1d` the only code change is the D3 pair (`userMessage.ts`, `newerDatabase.test.ts`), the
rest is docs. CI:
- run `39107421919` (CI-only branch `l4-ci-l3-int` = `846513d` + workflow): `npm run verify`, `vitest tests/unit/storage`
  (migration v3→v4 + D3 `VersionError` regression), account isolation, emulators (Auth + sync on Firestore + rules),
  E2E Chromium — **all success**
- run `39107417681` (`l4-l3-integration` itself, existing `emulator-tests`): unit + typecheck + emulators + rules — **success**

Still open for the L3 Gate: `replayCheck.ts` across baseline → RC (D4), Preview upgrade L2 → L3, Firebase Production project.

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

## 6. Production release (2026-10-18)

Coordinator: L2 Release Gate **APPROVED** (one dark deployment). Pre-deploy: `origin/ui-import-button` = `4cbcf40`,
`l2-release` = `05dec77` (local = origin), fast-forward, clean tree; no `.env*` (other than `.env.example`, not loaded
by Vite), `wrangler.toml` or Functions in the repo; Cloudflare Production variables `NODE_VERSION = 22` only, no deploy
hooks (screenshot 14:38).

Deploy: `git push origin l2-release:ui-import-button` → `4cbcf40..05dec77` (no force) → Production deployment
**`8af4b990`** `ui-import-button · 05dec77` Success.

| Device | Post-deploy |
|---|---|
| PC Chrome | Banner → Update. Home 0 · 0 · 0 · — · 0/10 · 0/10 · Due 10 · New 10 · Learned 3/196 (= before). Settings 10 / 10 / Dark; **no account section**. Network filter `google`: 0 / 10 requests; `firebase`: 0 / 20 requests (reload + Settings). `PROD-pc-after-L2.json`: format 2, DB 3; cards, logs, sessions, settings **identical to `PROD-pc-after-L1.json`** |
| Android Chrome (production) | Update tapped (owner). Home 0 · 0 · 0 · — · 0/100 · 0/30 · Due 10 · New 30 (= before); Settings **no account section**; export "Backup file created" (16.46 KB) |

Limits: the Android banner before Update was not captured (owner confirmed tapping it); the Android export was not
compared field by field; the installed production PWA was not checked separately from the Chrome tab.

## 7. Firebase Production project — created (2026-10-18, Coordinator: authorized, no Login / Sync)

Done by the owner in the console, guided step by step; evidence: owner screenshots. No config was put anywhere; the
API key is not recorded in the repository.

| # | Result |
|---|---|
| F1 | Project **`n5-kanji-review-prod`** (Project ID = name), project number `780014542375`, **Spark** plan, Analytics off |
| F2 | Authentication: **Google** provider only, Enabled. Project support e-mail = owner's account `asalins…@gmail.com` (`n5kanjireview.support@gmail.com` is not a project member yet) |
| F2b | Google Auth Platform: app name `N5 Kanji Review`, support e-mail as above, User type **External**. Publishing status **In production** (set by Firebase when Google sign-in was enabled; nothing was published by hand). Branding: no logo, no home page / privacy / terms link saved (Google requires a privacy link once a home page is set; changes discarded). Verification not requested |
| F3 | Authorized domains: `n5-kanji-review-prod.firebaseapp.com`, `n5-kanji-review-prod.web.app`, `n5-kanji-review.pages.dev`; `localhost` removed; no preview alias |
| F4 | Web app `n5-kanji-review-web`, App ID `1:780014542375:web:fe40c5f961d9ca8a4bb802`, authDomain `n5-kanji-review-prod.firebaseapp.com`, no Hosting |
| F5 | Browser key (auto created by Firebase): **Websites** `https://n5-kanji-review.pages.dev/*`, `https://n5-kanji-review-prod.firebaseapp.com/*`; **2 APIs**: Identity Toolkit API, Token Service API (was 25 APIs by default) |
| — | **No Firestore database**, no Cloudflare variable, no Blaze, no Identity Platform upgrade, no billing |

Open for the Login Gate:
1. Privacy policy URL: the Privacy page exists only inside the app (no own URL). Google requires a privacy link with a home page and for brand verification.
2. Support e-mail: add `n5kanjireview.support@gmail.com` as a project member, then select it in Authentication and Branding.
3. Publishing status is already "In production" (deviation from the guide's "Testing"; harmless while Production has no config). Decide: keep, or "Back to testing" until the Login release.
4. Cloud Firestore API is not in the key's API list; add it at L3 together with the database and rules.
5. Firebase also created an OAuth web client and the `firebase-adminsdk` service account (defaults, untouched).
