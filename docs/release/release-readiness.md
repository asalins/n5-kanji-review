# Release readiness (Phase 12)

Two different states:

## Technical Release Candidate
Code, tests, build and automated E2E pass: `npm run verify:all` (with Chromium) and `npm run qa:mutations`.

## Public Release Ready
Technical Release Candidate **and**:
1. Sources / Attribution present and correct (About & Sources; `DATA_SOURCES.md`).
2. Thai meanings reviewed by a person: `npm run dataset:thai-audit -- --require-complete` passes (or the coverage the release gate sets).
3. Real Android validation: `docs/release/android-checklist.md` completed on a device.

## Phase 12 snapshot (historical)
Status at the end of Phase 12 (commit recorded in the Phase 12 report). Kept unchanged as the historical record; later results are in the release records below.

| Gate | Status |
|---|---|
| Technical Release Candidate | see Phase 12 final verification |
| Sources / Attribution | implemented; licence wording checked against the official EDRDG page |
| Thai human review | **PENDING**: 196 drafts, 0 reviewed |
| Real Android validation | **PENDING HUMAN VALIDATION** |
| Public Release Ready | **NO** (until the two pending items pass) |

## Release 7f3cf7d — Public Release GO
Branch `thai-review-1`, commit `7f3cf7d28e9f2c42630eafeea30139a6c44d8c16`, dataset `n5-2026.10.01`. Now frozen; it is the rollback target.

| Gate | Result |
|---|---|
| Technical Release Candidate | PASS (verify 640/640, E2E 0 failed, mutation QA 18/18 killed) |
| Sources / Attribution | PASS (About & Sources; `DATA_SOURCES.md`) |
| Thai human review | PASS: 196/196 reviewed by the project owner (commit `62673d2`; 2 meanings edited: 力, 文). `dataset:thai-audit --require-complete` passes |
| Cloudflare production | Deployed 2026-10-05 (`n5-kanji-review.pages.dev`) |
| PC smoke test | PASS: Edge 7/7, Chrome 7/7 (2026-10-05) |
| Real Android validation | PASS: items 1-12 and 14-15 (tester report; see `android-checklist.md`). Item 13 (PWA update) deferred to the next update |
| Public Release Ready | **GO** (Coordinator decision) |

Notes from the PC smoke test: Chrome console errors (`runtime.lastError`) came from browser extensions (the app does not use `chrome.runtime`). A DevTools issue "CSP blocks eval" matches Zod's guarded `Function('')` capability check; the app sets no CSP and the source of the CSP was not confirmed. No functional impact.

## Update release 29d5354 — GO
Branch `ui-import-button`, commit `29d5354920a5baf5da62af155032018e96784cdf` (parent `7f3cf7d`). Scope: UI only, a bordered, touch-sized "Choose File" button on Settings (light and dark mode). Import logic, data, SRS, statistics, search, storage, PWA configuration and dependencies unchanged.

| Gate | Result |
|---|---|
| Update Gate 1 (pre-flight) | PASS: UI-only diff, verify 640/640, E2E 34 passed / 0 failed |
| Update Gate 2 | APPROVED (preview alias test, production untouched) |
| Update Gate 3: PWA update #13 on preview | PASS (PC Chrome, `pwa-update-test.n5-kanji-review.pages.dev`, 2026-10-06): update prompt on Home only, no automatic reload, Update reloads, service worker #17 → #18, review data and settings identical before and after |
| Production promotion | Production branch changed to `ui-import-button`; deployed via a Deploy Hook (deleted afterwards) on 2026-10-06 |
| PC production check | PASS: update prompt → Update, service worker #19, bordered button in dark and light, file picker opens |
| Android targeted regression | PASS 8/8; production update on the installed PWA: prompt → Update, Home values identical before/after (10 · 10 · 0 · 100% · 0/100 · 10/30) |
| Final Update Gate | **GO** (Coordinator decision) |

## Known limitations of the release evidence
- Android device model, Android version and Chrome version were not recorded.
- Android results are tester reports; screenshots exist only for the update prompt and the Home values before/after the production update.
- "Learned" was not captured before/after the update.
- PC production data could not prove persistence across the update: the tester had used Reset progress / Import on that browser beforehand.
- No screenshot of the update prompt in the preview test (tester confirmation; the other evidence is consistent).
- Automated E2E ran on headless Chromium, not on Android.
