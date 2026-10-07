# Releases

Production URL: `https://n5-kanji-review.pages.dev` · Repository: `asalins/n5-kanji-review` · Dataset: `n5-2026.10.01`

| Release | Commit | Branch | Date | Status | Change | Gates |
|---|---|---|---|---|---|---|
| 29d5354 | `29d5354920a5baf5da62af155032018e96784cdf` | `ui-import-button` | 2026-10-06 | **Current production** | Bordered, touch-sized "Choose File" button (UI only) | Update Gates 1-3, production promotion, Android targeted 8/8, Final Update Gate GO |
| 7f3cf7d | `7f3cf7d28e9f2c42630eafeea30139a6c44d8c16` | `thai-review-1` | 2026-10-05 | Previous production · **rollback target** · frozen | First public release (Phases 1-12, Thai meanings 196/196 reviewed) | Thai human review, PC smoke (Edge, Chrome), Android QA, Public Release GO |

Rules
- `thai-review-1` is frozen at `7f3cf7d`; `ui-import-button` is the production branch. The two branches are not merged.
- Nothing is pushed to the production branch without a Gate decision (automatic deployments are enabled).
- Branch `pwa-update-test` (7f3cf7d → 29d5354) is kept as the evidence of the PWA update test #13.

Evidence and limitations: `release-readiness.md`, `android-checklist.md`. Deployment procedure: `deployment.md`.
