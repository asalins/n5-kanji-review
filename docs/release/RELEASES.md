# Releases

Production URL: `https://n5-kanji-review.pages.dev` · Repository: `asalins/n5-kanji-review` · Dataset: `n5-2026.10.01`

| Release | Commit | Branch | Date | Status | Change | Gates |
|---|---|---|---|---|---|---|
| e135edb | `e135edbc83364e55b266c2a74b8d1731b1082c41` | `ui-import-button` (from `phase13-kanji-detail`) | 2026-10-08 | **Current production** | Phase 13: Kanji Detail (read-only) opened from Search; Search → Detail = push, Back returns to Search with its context | Implementation, Pre-Promotion, Preview smoke (PC), Android regression, Production Gate, Post-Deployment: all PASS |
| efb0627 | `efb06276ea1a964a8983293b50ca4a7faa3dac64` | `ui-import-button` | 2026-10-07 | Previous production · **rollback target** | Documentation only (release records, deployment guide, KANJIDIC2 update schedule); build byte-identical to 29d5354 | Documentation Gate, byte-identical build check |
| 29d5354 | `29d5354920a5baf5da62af155032018e96784cdf` | `ui-import-button` | 2026-10-06 | Earlier production | Bordered, touch-sized "Choose File" button (UI only) | Update Gates 1-3, production promotion, Android targeted 8/8, Final Update Gate GO |
| 7f3cf7d | `7f3cf7d28e9f2c42630eafeea30139a6c44d8c16` | `thai-review-1` | 2026-10-05 | Earlier production · frozen | First public release (Phases 1-12, Thai meanings 196/196 reviewed) | Thai human review, PC smoke (Edge, Chrome), Android QA, Public Release GO |

Rules
- `e135edb` is the frozen release baseline after Phase 13; later work starts from it through a new Gate.
- `thai-review-1` is frozen at `7f3cf7d`; `ui-import-button` is the production branch. The two branches are not merged.
- Nothing is pushed to the production branch without a Gate decision (automatic deployments are enabled).
- Phase 13 evidence does not depend on branch `phase13-kanji-detail` (= `e135edb`): it is kept by tag `release-2026-10-08-e135edb` and Cloudflare Preview deployment `f46d55df`.
- PWA update test #13 evidence does not depend on branch `pwa-update-test` (7f3cf7d → 29d5354): it is kept by Cloudflare Preview deployments `70efd90c` (version A, `7f3cf7d`) and `4ad98e0e` (version B, `29d5354`) and tags `release-2026-10-05-7f3cf7d`, `release-2026-10-06-29d5354`.

Evidence and limitations: `release-readiness.md`, `android-checklist.md`. Deployment procedure: `deployment.md`.
