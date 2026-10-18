# L1 Release Candidate — test plan and R-1 recovery runbook

Coordinator decision after Release Readiness (CONDITIONAL PASS): prepare and test the L1 Release Candidate and the
recovery runbook in Development-First Mode; **stop before any Production deployment**. Production stays `c6fdf23`.

## 1. Release Candidate

| Item | Value |
|---|---|
| Release commit | `4cbcf40` (`l1-local-ids`) |
| Chain | `c6fdf23` (production) → `0ad6257` (L1 code, Gate PASS 2026-10-17) → `4cbcf40` (docs only: `docs/sync/l1-local-data.md` +38) |
| Code evidence | L1 Gate: `verify:all` with `N5_BASELINE_DIST` = `c6fdf23` dist: unit 703, E2E 40 passed, `productionUpgrade.spec.ts` passed; Android Preview upgrade `l1-upgrade-test2` |
| Promotion | fast-forward `c6fdf23..4cbcf40` is possible (`git merge-base --is-ancestor` exit 0); procedure in `deployment.md` |
| Storage | IndexedDB v2 → **v3** (migration v3); backup format 1 → **2** |

## 2. R-1 — what happens after a rollback across a DB version

Code facts (`c6fdf23`):
- `openAppDatabase` opens the database with the version of its latest migration (v2). A database already at v3 makes
  `indexedDB.open(name, 2)` fail with `VersionError` → `StorageError`.
- `App.tsx` then shows **"เริ่มแอปไม่สำเร็จ"** with *"ไม่สามารถเปิดที่เก็บข้อมูลในเบราว์เซอร์ได้ (ลองปิดโหมดส่วนตัว หรือตรวจพื้นที่ว่าง)"*
  and **ลองอีกครั้ง**. Retrying cannot help. **The text invites the user to clear storage, which would delete the data.**
- The update banner exists **only on Home**, so a user on this screen is never offered "Update".
- PWA `registerType: 'prompt'`: a new service worker waits until the user accepts on Home **or every tab / the installed
  app of the origin is closed**.

Consequence: rollback from L1 to `c6fdf23` is **not a recovery method**. Recovery is a fix-forward build whose DB
version is ≥ the user's (L1: ≥ 3, L3: ≥ 4).

## 3. Recovery runbook (fix-forward)

**Never:** roll Production back to `c6fdf23` (or any build with a lower DB version) after L1 has been served; advise
users to clear site data, uninstall the PWA, or delete IndexedDB.

1. **Detect.** Failure reports, or the post-deployment check fails. Decide within the Gate whether the fault is in L1.
2. **Choose the fix base.** Start from the release commit (`4cbcf40`), never from `c6fdf23`. The fix must keep every
   migration (`v1`–`v3`) unchanged and must not lower `CURRENT_DB_VERSION`.
3. **Build and verify.** `verify:all` (with `N5_BASELINE_DIST`), then a Preview alias update test from the faulty build
   to the fix (data kept).
4. **Gate**, then deploy the fix to Production by fast-forward (`deployment.md`). No Rollback in Cloudflare across a DB version.
5. **User instruction** (only if someone reached a lower-version build, e.g. by an accidental rollback): *close every
   tab of the app and the installed app completely, then open it again* — the waiting service worker of the fix build
   then takes over and the data opens. Do not clear site data. Keep any backup file.
6. **Record** in `RELEASES.md`.

Cloudflare Rollback stays allowed only between builds with the **same** DB version (e.g. two L1 builds).

## 4. Preview test plan (simulated data only)

Alias branch `l1-r1-test` (`https://l1-r1-test.n5-kanji-review.pages.dev`). Every step is a **fast-forward** push, one
at a time, the next only after the tester has finished the previous step (L1 lesson: back-to-back pushes skip steps).
No force push. Production is never touched.

| Step | Push | Commit (tree) | Tester | Expected |
|---|---|---|---|---|
| V0 | `l1-r1-test` = `c6fdf23` | production tree | Fresh profile/origin. Review a few cards, change a setting, Export **backup v1**. Note Home figures. Install the PWA (optional) | Production behaviour |
| V1 | → `4cbcf40` | L1 tree | Home → "A new version is available" → Update. Compare Home. 1 review. Export **backup v2** | Data kept, migration v3 |
| B | — | — | Open the **unique deployment URL of V0** (`<hash>.n5-kanji-review.pages.dev`, its own empty origin) → Import backup v2 | Refused: "unsupported backup format version"; nothing changed |
| V2 | → `R1-sim` | **`c6fdf23` tree** on top of `4cbcf40` (simulated rollback) | Home → Update | "เริ่มแอปไม่สำเร็จ" + storage message; ลองอีกครั้ง does not help; no update banner. **Do not clear data** |
| V3 | → `R1-fix` | **`4cbcf40` tree** on top of `R1-sim` (fix-forward) | Stay on the error screen; reload once (expect still error), then **close every tab / the PWA and reopen** | L1 starts, Home figures = after V1 (incl. the review), backup v2 export works |
| V4 | — | — | Import backup v1 (from V0) into V3 | Accepted (format 1 → L1); figures = V0 |

`R1-sim` and `R1-fix` are test-only commits (made with `git commit-tree`, author `dev <dev@local>`); they exist only on
`l1-r1-test` and are never merged anywhere. Their `dist` is byte-identical to `c6fdf23` and `4cbcf40` respectively
because the build embeds no commit data.

### Results (2026-10-18, PC Chrome normal profile, tab only; tester: project owner; evidence: screenshots + backup files checked by script)

Commits on `l1-r1-test`: `c6fdf23` → `4cbcf40` → `0166803` (`r1-sim`) → `2c4aea4` (`r1-fix`), every push a fast-forward, one at a time.
Production `ui-import-button` = `c6fdf23` before and after every push.

| Step | Result | Observed |
|---|---|---|
| V0 | PASS | Deployment `8f49f536`. 3 reviews, daily new cards 10 → 20. Home 3 · 3 · 0 · 100 % · 0/20 · 3/20 · Due 0 · new 17. `V0-backup-v1.json`: format 1, DB 2, 3 logs, 10 cards, `dailyNewCards 20` |
| V1 | PASS | No prompt until a reload (c6fdf23 checks for a new service worker only on navigation; `deployment.md` already says "Reload Home"). Banner on Home only, nothing reloaded by itself → Update → Home identical. 1 review → 4 · 4 · 0 · 4/20 · new 16. `V1-backup-v2.json`: format 2, DB 3; the 3 V0 logs keep id and every value, `deviceId`/`originalId` null; new `log:<uuid>` with a device id; `dailyNewCards 20`, `updatedAt 0`; no `deviceMeta` |
| B | PASS | `V1-backup-v2.json` into deployment `8f49f536` (c6fdf23, empty origin): "ไฟล์สำรองนี้เป็นเวอร์ชันที่แอปนี้ไม่รองรับ … ข้อมูลการเรียนเดิมของคุณไม่ถูกเปลี่ยนแปลง" (shown at the bottom of Settings); no confirm box; Home all 0 |
| V2 | R-1 **reproduced** | Reload → banner → Update → **"เริ่มแอปไม่สำเร็จ · ไม่สามารถเปิดที่เก็บข้อมูลในเบราว์เซอร์ได้ (ลองปิดโหมดส่วนตัว หรือตรวจพื้นที่ว่าง)"**, ลองอีกครั้ง, no update banner |
| V3 | PASS (recovered) | A first look ~1 min after the push still showed the error (build not finished). After the build: reload, then close every tab of the origin and reopen → L1 starts, Home 4 · 4 · 0 · 100 % · 0/20 · 4/20 · new 16 (= after V1). `V3-backup-v2.json` **identical to `V1-backup-v2.json`** (cards, logs, sessions, settings) |
| V4 | PASS | Import `V0-backup-v1.json` into L1 → 3 · 3 · 0 · 100 % · 0/20 · 3/20 · new 17 (= V0) |

Limits: one browser (PC Chrome tab); not run on Android or as an installed PWA. In V3 the tester did both a reload and
a close/reopen, so the test does not show whether a reload alone is enough; the runbook keeps "close every tab / the app
and reopen". Deployment ids: V0 `8f49f536`, V1 `5d8f673b`, V2 `133dfcd6`, V3 `5b22b144`.

## 6. Production release (2026-10-18)

Coordinator: L1 Release Gate **APPROVED WITH CONDITIONS** (D1 release `4cbcf40` unchanged; D2 notice outside the app;
D3 storage-error text in L2).

Pre-deploy checklist 6/6:
1. Notice: the only current user is the project owner, who received the notice text and exported backups from
   Production before the deploy (PC `PROD-pc-before-L1.json`: format 1, DB 2, 18 logs, 20 cards; Android: Home noted,
   export not shown in evidence). No public announcement was needed.
2. `origin/ui-import-button` = `c6fdf237…`, `l1-local-ids` = `4cbcf40a…` (local = origin).
3. Fast-forward; 46 files changed, only `src/`, `tests/`, `README.md`, `docs/`; no `package.json`, lockfile, PWA,
   Vite, `index.html`, `public/` or workflow change; clean tree.
4. Cloudflare: Production branch `ui-import-button`, automatic deployments enabled, no deploy hooks, build `npm run build` → `dist`.
5. Runbook (above) and fix-forward build (`4cbcf40` itself, proven as `r1-fix`).
6. No Firebase in `4cbcf40`; Production variables: `NODE_VERSION = 22` only.

Deploy: `git push origin l1-local-ids:ui-import-button` → `c6fdf23..4cbcf40` (no force) → Production deployment
**`d77b8f19`** `ui-import-button · 4cbcf40` Success.

Post-deploy:
| Device | Result |
|---|---|
| PC Chrome (production URL) | Banner on Home → Update. Home 0 · 0 · 0 · — · 0/10 · 0/10 · Due 10 · New 10 · Learned 3/196 (= before). Settings unchanged (10 / 10 / Dark), no account section. `PROD-pc-after-L1.json`: format 2, DB 3; logs 18/18 identical in every field (`deviceId`/`originalId` null), cards 20/20 identical, sessions identical, settings identical + `updatedAt: 0`. No start-up error |
| Android Chrome | Banner → Update. Home 0 · 0 · 0 · — · 0/100 · 0/30 · Due 10 · New 30 (= before). Export: "Backup file created". No start-up error |

Open observation: one PC screenshot taken at 13:37 still shows the update banner; the tester's sequence was not
stated (likely taken before tapping Update). The exported file proves L1 was running at 13:39.
The installed Android PWA was not checked separately.

## 5. Open point for the Coordinator — "Export before upgrading"

The decision asks that users are guided to export a backup **before** the upgrade and told about format 2. The
upgrade prompt is drawn by the running build, i.e. `c6fdf23`, which is frozen. In-app guidance before the upgrade is
therefore only possible with a separate release on top of `c6fdf23` (a UI change with its own Gate). Without it the
options are: release notes / an announcement outside the app, and a notice in L1 itself *after* the upgrade (the
format-1 backup made before is what matters, and L1 still imports it).
