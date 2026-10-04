# Thai meaning review

Thai meanings live in `data/kanji/n5.th.json` (one entry per Project N5 kanji):
`{ kanjiId, meaningsTh: string[], reviewed: boolean, ambiguous: boolean }`.

## Rules
- The app shows a Thai meaning ONLY when `reviewed: true` and `ambiguous: false` (enforced when the dataset is loaded; covered by tests and a mutation check).
- **`reviewed: true` is a human decision.** No tool, script or AI sets it. The current 196 meanings are DRAFTS (written in Phase 12 from the KANJIDIC2 English meanings) and all have `reviewed: false`.
- Keep 1-3 short, beginner-friendly Thai meanings, most common first. Do not copy dictionary text you have no rights to.
- Unsure? Set `ambiguous: true` (the meaning is then withheld) and note why in the review log/issue.

## How to review
1. `npm run dataset:thai-audit` lists pending kanji in Project N5 order with their status (`empty`, `draft`, `ambiguous`).
2. For each kanji, check `meaningsTh` against the kanji, its readings and English meanings in `n5.json`. Edit the meanings if needed, then set `"reviewed": true`.
3. Run the audit again; it fails on contradictions (e.g. `reviewed: true` with no meaning).
4. `npm run verify` (the test suite checks that unreviewed meanings never reach the app).

## Shipping reviewed meanings to installed apps
The app reloads content only when `datasetVersion` changes, so a release with newly reviewed meanings needs a new dataset version: run `npm run dataset:build` with the latest KANJIDIC2 (see `DATA_SOURCES.md`), which also updates the Thai file's version and keeps every entry and `reviewed` flag. Existing backups remain restorable (with a warning).

## Release gate
Public release requires the coverage set by the release gate (default: 196/196 reviewed): `npm run dataset:thai-audit -- --require-complete` must pass.
