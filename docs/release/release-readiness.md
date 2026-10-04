# Release readiness (Phase 12)

Two different states:

## Technical Release Candidate
Code, tests, build and automated E2E pass: `npm run verify:all` (with Chromium) and `npm run qa:mutations`.

## Public Release Ready
Technical Release Candidate **and**:
1. Sources / Attribution present and correct (About & Sources; `DATA_SOURCES.md`).
2. Thai meanings reviewed by a person: `npm run dataset:thai-audit -- --require-complete` passes (or the coverage the release gate sets).
3. Real Android validation: `docs/release/android-checklist.md` completed on a device.

Status at the end of Phase 12 (commit recorded in the Phase 12 report):

| Gate | Status |
|---|---|
| Technical Release Candidate | see Phase 12 final verification |
| Sources / Attribution | implemented; licence wording checked against the official EDRDG page |
| Thai human review | **PENDING**: 196 drafts, 0 reviewed |
| Real Android validation | **PENDING HUMAN VALIDATION** |
| Public Release Ready | **NO** (until the two pending items pass) |
