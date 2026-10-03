# N5 Kanji Review

Phase 1 scaffold. See the approved Phase 0 architecture for layer rules.

## Commands
- `npm run dev` : dev server
- `npm run build` : typecheck (`tsc --noEmit`) + production build (PWA)
- `npm run typecheck` : TypeScript strict check only
- `npm test` : Vitest unit tests (`tests/unit`)
- `npm run test:e2e` : Playwright (`tests/e2e`); first run `npx playwright install chromium`

## Layers
UI -> features/hooks -> services -> repository interfaces -> repository implementations -> storage.
`idb` may only be imported from `src/services/storage` and `src/repositories/indexeddb` (enforced by `tests/unit/architecture.test.ts`).

## Data layer (Phase 2)

**Database:** `n5-kanji-review` (IndexedDB via `idb`), current version **1** (`CURRENT_DB_VERSION`).

**Stores**
- Content, read-only for users (loaded from the versioned dataset by `ContentWriter`): `kanji`, `kanjiReadings`, `vocabulary`, `exampleSentences`
- User data, read-write: `reviewCards`, `reviewLogs`, `studySessions`, `userSettings` (singleton), `streakState` (singleton)

**Indexes** (each backs a repository query; add new ones by migration when a query needs them)
| Store | Index | Used by |
|---|---|---|
| kanji | by-level | getByLevel, search filter |
| kanjiReadings | by-kanjiId | getReadings |
| vocabulary | by-kanjiId (multiEntry) | getVocabulary |
| exampleSentences | by-vocabId (multiEntry) | getExamples |
| reviewCards | by-due | getDueCards |
| reviewCards | by-state | getNewCards |
| reviewLogs | by-reviewedAt | getLogs |

**Migrations:** `src/services/storage/migrations/`. Append-only list `APP_MIGRATIONS`; versions must be exactly 1..N (validated on open). Upgrades run only the migrations newer than the stored version, in order, inside one versionchange transaction. To change the schema add `v2...` and register it; never edit a released migration.
- v1: initial schema (all stores and indexes above)

**Timestamps:** Unix epoch milliseconds (integer, UTC instant) in every persisted entity. Timezone/day-boundary rules are decided later by the feature that needs them.

**Repositories:** `src/repositories/interfaces` (application boundary) and `src/repositories/indexeddb` (implementations). Errors: invalid data -> `ValidationError`, IndexedDB failures -> `RepositoryError`, database open/unavailable -> `StorageError`. Reads and writes are validated with Zod (`src/types/schemas.ts`), structure only (no SRS rules).

**Content vs user data:** `KanjiRepository` is read-only. Only the internal `ContentWriter` (dataset loader) writes content; UI/features must not use it (architecture test).

## Dataset pipeline (Phase 3)

`npm run dataset:build [-- --dataset-version n5-YYYY.MM.DD]` reads `data/lists/n5-list.json`, `data-sources/kanjidic2/kanjidic2.xml` and the optional `data/kanji/n5.th.json`, then writes `data/kanji/n5.json` and `data/kanji/n5.report.json`. It refuses to run (exit 2) without an approved N5 list or the source file, and writes no dataset (exit 1) when the report has blockers. Sources and licences: `DATA_SOURCES.md`.

- **Content vs user data.** Content stores (kanji, kanjiReadings, vocabulary, exampleSentences, contentMeta) come from the dataset and are replaced as a whole by `ContentWriter.replaceContent` in one transaction. User stores (reviewCards, reviewLogs, studySessions, userSettings, streakState) are never part of that transaction.
- **Version.** `datasetVersion` in `n5.json` is the single source of truth; the loaded version is stored in `contentMeta` (DB v2) and read via `KanjiRepository.getDatasetVersion()` for `ReviewLog.datasetVersion`. `n5.th.json` must carry the same version.
- **Loader.** `src/services/content/loadDatasetContent` validates both files, checks integrity, skips if the version is already loaded, otherwise replaces content. Wiring it to the files at app start is Phase 4.

## SRS (Phase 5)

Scheduling lives only in `src/services/srs` (specification: `docs/srs-v1.md`, version `srs-v1`). `features/review/reviewOrchestrator.ts` turns a rating intent into card + log via the SRS service, but is NOT yet wired into the app: it needs an atomic `recordReview(card, log)` in the repository layer (pending approval). Until then the app uses the practice-only orchestrator and stores no reviews. Thai meanings are shown only when `reviewed: true` (see `DATA_SOURCES.md`).

## Statistics (Phase 7)

`src/services/statistics/` (pure calculations + `computeStatistics`) feeds `features/progress` (hook + dashboard on the home page). Every number comes from the repositories: all ReviewLogs (`getLogs`), all cards (`getCardsByStates`), due cards (`getDueCards`) and the dataset size (`KanjiRepository.getByLevel`), read once each. Read-only; nothing is created for the sake of a statistic.

Metric definitions (the single source of truth for the dashboard):

| Metric | Definition |
|---|---|
| **Review Count** | Number of successfully stored ReviewLogs (a failed review transaction is not a review). Cards selected, created, opened or shown are not reviews. |
| **Accuracy** | (HARD + GOOD + EASY) / reviews. AGAIN is incorrect. Shown as "—" when there are no reviews, never 0%. |
| **Review Quota** | Today's ReviewLogs whose `stateBefore` is not NEW, shown against the daily review limit (the first review of a new card does not use it). |
| **New Cards** | Today's ReviewLogs whose `stateBefore` is NEW, shown against the daily new-card limit. "New available today" = min(remaining new quota, cards not yet reviewed). |
| **Learned Kanji** | Kanji with at least one ReviewCard whose state is not NEW, counted per `itemId` (not per card). |
| **Mastered Kanji** | Kanji whose four modes (A-D) all have a ReviewCard and all are MASTERED. Missing cards are never created for statistics. |
| **Due** | **All non-NEW ReviewCards whose `due <= now`** (LEARNING, REVIEW, RELEARNING and MASTERED; never NEW). **The dashboard and the Review Session use this same definition**: it lives once, in `utils/dueCard.ts` (`isDueCard`), and the repository's `getDueCards` (used by the session) and the statistics both use it. Not capped by the daily quota. |
| **Current Streak** | Consecutive local calendar days with at least one ReviewLog, ending today, or ending yesterday if today has no review yet (alive until a whole day passes without study). |
| **Longest Streak** | The longest run of consecutive local days with a ReviewLog in all history. |

"Today" is the local calendar day of the device (injectable clock). Reviews today, Review Quota and New Cards are separate numbers (never show "12 / 20" for 12 reviews). Totals and percentages use the dataset's kanji count. "Review Cards by state" counts cards, not kanji.
- **Data-version policy:** all stored ReviewLogs are used; `datasetVersion` is kept for audit and is not a filter. Retention is out of scope.
- **Legacy / technical debt:** the `streakState` store and `getStreakState`/`saveStreakState` are unused (streak comes from the logs, so there is one source of truth). They are kept unchanged, without migration.
- **Known limitation:** days are grouped with the time zone of the device at calculation time; if the user changes time zone, daily history and streaks are regrouped by the new local dates.
