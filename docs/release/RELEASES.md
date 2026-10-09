# Releases

Production URL: `https://n5-kanji-review.pages.dev` · Repository: `asalins/n5-kanji-review` · Dataset: `n5-2026.10.01`

| Release | Commit | Branch | Date | Status | Change | Gates |
|---|---|---|---|---|---|---|
| e135edb | `e135edbc83364e55b266c2a74b8d1731b1082c41` | `ui-import-button` (from `phase13-kanji-detail`) | 2026-10-08 | **Current production build** | Phase 13: Kanji Detail (read-only) opened from Search; Search → Detail = push, Back returns to Search with its context | Implementation, Pre-Promotion, Preview smoke (PC), Android regression, Production Gate, Post-Deployment: all PASS |
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
| `cb5c05beb8628125107b1ad66422ecea1c2b1f0a` | `release-2026-10-10-cb5c05b` (planned, pending approval) | `05f6f82b` |

This list can lag behind production; the annotated tags are the authoritative record of documentation-only commits.

Rules
- `e135edb` is the frozen release baseline after Phase 13; later work starts from it through a new Gate.
- A documentation-only commit gets no row. It is recorded by an annotated tag `release-<date>-<sha>` (tagger `dev <dev@local>`), created only after its push is verified, and it qualifies only with evidence that its `dist` is byte-identical to the current production build (every file, including `sw.js`). If any file differs, it is a new build and needs a row and the full release Gates.
- `thai-review-1` is frozen at `7f3cf7d`; `ui-import-button` is the production branch. The two branches are not merged.
- Nothing is pushed to the production branch without a Gate decision (automatic deployments are enabled).
- Phase 13 evidence does not depend on branch `phase13-kanji-detail` (= `e135edb`): it is kept by tag `release-2026-10-08-e135edb` and Cloudflare Preview deployment `f46d55df`.
- PWA update test #13 evidence does not depend on branch `pwa-update-test` (7f3cf7d → 29d5354): it is kept by Cloudflare Preview deployments `70efd90c` (version A, `7f3cf7d`) and `4ad98e0e` (version B, `29d5354`) and tags `release-2026-10-05-7f3cf7d`, `release-2026-10-06-29d5354`.

Evidence and limitations: `release-readiness.md`, `android-checklist.md`. Deployment procedure: `deployment.md`.
