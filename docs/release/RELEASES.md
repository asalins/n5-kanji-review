# Releases

Production URL: `https://n5-kanji-review.pages.dev` · Repository: `asalins/n5-kanji-review` · Dataset: `n5-2026.10.11` (KANJIDIC2 2026-284)

| Release | Commit | Branch | Date | Status | Change | Gates |
|---|---|---|---|---|---|---|
| 05dec77 (L2, dark) | `05dec772b0d42940a64f43a100bec92367a463ea` | `ui-import-button` (from `l2-release`) | 2026-10-18 | **Current production build** · deployment `8af4b990` · IndexedDB v3 (same as L1): rollback target = L1 `d77b8f19` only, through a Gate | L2 optional Google account code, **dark**: no `VITE_FIREBASE_*` in Production, so no account section, no Privacy page, Firebase SDK never loaded; D3: a database written by a newer build (`VersionError`) shows "data is still here, close every tab and reopen, do not clear site data". No migration, backup format 2 unchanged | L2 Gate PASS (`9874b80`), L2 Release Gate APPROVED (CI run `39105925225`: verify, Auth emulator, E2E), dark build checked in a browser (no account UI, no Google/Firebase request, DB v3), Preview L1 → L2 on PC and Android tab + installed PWA, Production variables `NODE_VERSION` only, fast-forward `4cbcf40..05dec77`, post-deploy PC (backup identical to after L1 in every field, no account section, Network `google` 0/10 and `firebase` 0/20) and Android (Home identical, no account section, export works): PASS · tag `release-2026-10-18-05dec77` |
| 4cbcf40 (L1) | `4cbcf40a2f501f353c59f03e5c6973030bfa449d` | `ui-import-button` (from `l1-local-ids`) | 2026-10-18 | Previous production build · deployment `d77b8f19` · **IndexedDB v3, backup format 2: no rollback to any earlier build** (see `deployment.md` → Rollback) | L1 sync-ready local data: `log:<uuid>` ids for new reviews, migration v3 (device id, log provenance, settings `updatedAt`), backup format 2 (format 1 still imported; format 2 is refused by earlier builds), pure log collision resolver. No account, no Firebase, no network calls | L1 Gate (verify:all, `productionUpgrade.spec.ts`), Release Readiness (CONDITIONAL PASS), Preview upgrade + backup + R-1 rollback/fix-forward on `l1-r1-test` (`docs/release/l1-release.md`), L1 Release Gate APPROVED WITH CONDITIONS, pre-deploy checklist 6/6, fast-forward `c6fdf23..4cbcf40`, post-deploy PC (backup before/after: logs 18/18, cards 20/20, sessions, settings identical) and Android (Home identical, export works): PASS · tag `release-2026-10-18-4cbcf40` |
| 9545af3 | `9545af38fee2cdb5bf9f38b175f285c926bf2271` | `ui-import-button` (from `kanji-font`) | 2026-10-12 | Previous production build (last on IndexedDB v2) · **not a rollback target after L1** | Kanji font picker in Settings: five bundled subset fonts (Klee One default, Noto Sans JP, Noto Serif JP, Yuji Syuku, Kosugi Maru) + system font, precached for offline, choice kept per browser (not in backups); font licences in About & Sources and `THIRD_PARTY_NOTICES.md`; dataset unchanged (`n5-2026.10.11`) | verify:all (668 tests, E2E 38 incl. offline font load), mutation QA 20/20, Preview PWA update on Android (progress kept, Klee One default, font choice remembered, offline font), production on PC: PASS · tag `release-2026-10-12-9545af3` |
| acd3e31 | `acd3e31231b8a714f22021f6838a95636e38567f` | `ui-import-button` (from `data-refresh`) | 2026-10-11 | Earlier production build (IndexedDB v2) · not a rollback target after L1 | KANJIDIC2 data refresh 2026-274 → 2026-284, dataset `n5-2026.10.01` → `n5-2026.10.11` (content of the 196 kanji unchanged: strokes, frequency, readings, English and Thai meanings identical); persistent storage requested at start-up, status shown in About & Sources; tests read the dataset version from `n5.json` (`b11509f`) | Data Refresh Preflight, Release Gate, Preview PWA update on Android (prompt, progress kept, persistent), Production Gate, production update on Android: all PASS · tag `release-2026-10-11-acd3e31` |
| e135edb | `e135edbc83364e55b266c2a74b8d1731b1082c41` | `ui-import-button` (from `phase13-kanji-detail`) | 2026-10-08 | Earlier production | Phase 13: Kanji Detail (read-only) opened from Search; Search → Detail = push, Back returns to Search with its context | Implementation, Pre-Promotion, Preview smoke (PC), Android regression, Production Gate, Post-Deployment: all PASS |
| efb0627 | `efb06276ea1a964a8983293b50ca4a7faa3dac64` | `ui-import-button` | 2026-10-07 | Earlier production (documentation only) | Documentation only (release records, deployment guide, KANJIDIC2 update schedule); build byte-identical to 29d5354 | Documentation Gate, byte-identical build check |
| 29d5354 | `29d5354920a5baf5da62af155032018e96784cdf` | `ui-import-button` | 2026-10-06 | Earlier production | Bordered, touch-sized "Choose File" button (UI only) | Update Gates 1-3, production promotion, Android targeted 8/8, Final Update Gate GO |
| 7f3cf7d | `7f3cf7d28e9f2c42630eafeea30139a6c44d8c16` | `thai-review-1` | 2026-10-05 | Earlier production · frozen | First public release (Phases 1-12, Thai meanings 196/196 reviewed) | Thai human review, PC smoke (Edge, Chrome), Android QA, Public Release GO |

Rows list application builds: a row is added only when the build output (`dist`) changes. Rows created before this rule was adopted may follow the previous release-recording convention.

- **Current production build**: the row marked so; it is what the production URL serves.
- **Current production deployment**: the latest Production deployment of `ui-import-button` on the Cloudflare Deployments page. It is not recorded here, because every push to the production branch creates a new one.
- Rollback targets: `deployment.md` → Rollback.

Documentation-only commits after `e135edb` (`dist` byte-identical to `e135edb`, 15/15 files, `sw.js` `bb63a546…`):

| Commit | Tag | Production deployment |
|---|---|---|
| `d35eaa09573f4ebbb8cc636c590135998d96ac8a` | `release-2026-10-09-d35eaa0` | `25804ffc` |
| `cb5c05beb8628125107b1ad66422ecea1c2b1f0a` | `release-2026-10-10-cb5c05b` | `05f6f82b` |
| `23587bd86a7e50cfb51460107dff8339d14ab5d9` | `release-2026-10-10-23587bd` | `6b956e1a` |

Documentation-only commits after `acd3e31` (`dist` byte-identical to `acd3e31`):

| Commit | Tag | Production deployment |
|---|---|---|
| `9b54a57430237c8518695ad04aee5b658182f4a6` | `release-2026-10-11-9b54a57` | `bc9625d0` |

This list can lag behind production; the annotated tags are the authoritative record of documentation-only commits.

Rules
- `e135edb` is the frozen release baseline after Phase 13; later work starts from it through a new Gate.
- A documentation-only commit gets no row. It is recorded by an annotated tag `release-<date>-<sha>` (tagger `dev <dev@local>`), created only after its push is verified, and it qualifies only with evidence that its `dist` is byte-identical to the current production build (every file, including `sw.js`). If any file differs, it is a new build and needs a row and the full release Gates.
- `thai-review-1` is frozen at `7f3cf7d`; `ui-import-button` is the production branch. The two branches are not merged.
- Nothing is pushed to the production branch without a Gate decision (automatic deployments are enabled).
- Phase 13 evidence does not depend on branch `phase13-kanji-detail` (= `e135edb`): it is kept by tag `release-2026-10-08-e135edb` and Cloudflare Preview deployment `f46d55df`.
- PWA update test #13 evidence does not depend on branch `pwa-update-test` (7f3cf7d → 29d5354): it is kept by Cloudflare Preview deployments `70efd90c` (version A, `7f3cf7d`) and `4ad98e0e` (version B, `29d5354`) and tags `release-2026-10-05-7f3cf7d`, `release-2026-10-06-29d5354`.

Evidence and limitations: `release-readiness.md`, `android-checklist.md`. Deployment procedure: `deployment.md`.
