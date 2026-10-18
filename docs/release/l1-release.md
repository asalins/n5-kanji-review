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

## 5. Open point for the Coordinator — "Export before upgrading"

The decision asks that users are guided to export a backup **before** the upgrade and told about format 2. The
upgrade prompt is drawn by the running build, i.e. `c6fdf23`, which is frozen. In-app guidance before the upgrade is
therefore only possible with a separate release on top of `c6fdf23` (a UI change with its own Gate). Without it the
options are: release notes / an announcement outside the app, and a notice in L1 itself *after* the upgrade (the
format-1 backup made before is what matters, and L1 still imports it).
