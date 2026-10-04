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

## Search / Filter (Phase 8)

`src/services/kanjiSearch/` (pure) + `features/kanji/` (hook and UI), opened from the home page. The corpus is loaded once with a fixed number of reads (`getByLevel`, `getAllReadings`, `getCardsByStates`, plus the Project N5 list order); typing and filtering then run in memory with no query per kanji. Read-only. `KanjiRepository.search()` (Phase 2) is kept unchanged and is not used by the UI.

- **Searched fields:** the kanji, English meaning, Thai meaning (the content store only holds reviewed Thai, so drafts are never searchable), kana and romaji. Vocabulary is not searched.
- **Matching:** the query is trimmed; Latin is case-insensitive; katakana is folded to hiragana and the notation marks `.` and `-` are ignored, for comparison only (stored readings are never changed and are displayed as stored, e.g. `ひと.つ`, `スイ`). Partial = substring.
- **Order:** match tier (0 exact kanji, 1 exact reading, 2 exact meaning, 3 partial), then Project N5 list order, then id. One result per kanji. An empty query lists the whole list in order.
- **State filter (kanji level, from its four cards):** New = not Learned; Learning = at least one LEARNING card and not a Mastered Kanji; Review / Relearning = at least one card in that state; Mastered = Mastered Kanji (A-D all exist and are MASTERED). Learning, Review and Relearning can overlap. Search AND state AND Due.
- **Due now:** the kanji has at least one card for which `isDueCard(card, nowMs)` is true. The clock is read again when the page opens, when the query or a filter changes, and when the window gets focus or the tab becomes visible; there is no polling.
- **Known debt:** `KanjiRepository.search()` and the search service have different semantics (two search implementations). There is no Kanji detail page, so results are read-only cards.

## Settings, backup and restore (Phase 9)

Settings page (home -> Settings): daily new cards (5/10/20/30, default 10), daily reviews (10/20/50/100, default 20) and theme (system/light/dark). Saved through `SettingsRepository`; nothing is written until the user changes a value (defaults live in memory, `services/settings/defaults.ts`). The persisted `UserSettings.dailyNewCards` maps to the session's `limits.newCards`. Fields without a feature yet (language, sound, auto-play, study mode, animations) keep their defaults and are not shown.

**Backup format** (`services/backup/backupSchema.ts`): `{ format: "n5-kanji-review-backup", formatVersion: 1, exportedAt, databaseSchemaVersion, datasetVersion, algorithmVersion, data: { reviewCards, reviewLogs, studySessions, userSettings | null } }`. The format version is independent of the dataset, algorithm and database versions; `databaseSchemaVersion` is audit metadata only. The dataset and the legacy `streakState` are never exported. File name: `n5-kanji-backup-YYYY-MM-DD.json`.

**Import rules** (strict, no mapping or guessing): JSON -> envelope -> every record (the app's own Zod schemas) -> integrity (no duplicate ids; every ReviewLog's card is in the backup; settings within the allowed options; StudySession.cardIds are not enforced) -> compatibility (the dataset version must be known; the envelope's and every card's algorithm version must be `srs-v1`; every card's kanji must exist in the current dataset; a backup from ANOTHER dataset version is accepted only then, with a mandatory warning shown before confirmation — Phase 12 policy) -> summary + explicit confirmation -> **Replace/Restore** in ONE IndexedDB transaction (`BackupRepository.replaceUserData`): cards, logs, sessions and settings are replaced together; any failure rolls everything back. Import restores state as stored; it never runs the SRS or recalculates anything. Errors: `INVALID_FILE`, `INVALID_JSON`, `INVALID_BACKUP_FORMAT`, `UNSUPPORTED_FORMAT_VERSION`, `DATASET_MISMATCH`, `ALGORITHM_MISMATCH`, `INVALID_RECORD`, `IMPORT_TRANSACTION_FAILED`.

**Reset:** "Reset progress" deletes cards, logs and sessions in one transaction (settings, dataset, contentMeta and streakState stay). "Reset settings" saves the defaults. Both need an explicit "I understand" confirmation.

**Dataset updates (Phase 12):** backups from an earlier dataset version restore when every kanji they refer to still exists (kanji ids are code points); a single missing kanji or an unknown version is rejected.

## PWA and mobile (Phase 10)

- **Installable PWA:** manifest in `pwa.config.ts` (name, description, `display: standalone`, `id`/`scope`, theme `#b91c1c`, background `#fafaf9`, orientation not locked) with the project's own icons (`public/icons/`: 192, 512 and maskable 512, generated by `scripts/icons/generateIcons.py`; the maskable glyph stays inside the 40% safe circle).
- **Offline after the first load:** the generated Workbox worker precaches the app shell, the bundled dataset chunks and the icons. It caches nothing from the network at runtime and never touches IndexedDB; learning data stays in IndexedDB exactly as before.
- **Updates are never forced:** `registerType: 'prompt'`. A new version waits; a small notice appears on the home screen only (never during a review, import/export or settings) and nothing reloads until the user taps "Update".
- **Mobile layout:** `viewport-fit=cover` + one safe-area aware page padding (`SAFE_PAGE`) on every page; the `theme-color` meta follows the theme actually shown (light/dark/system).
- **E2E:** `npm run test:e2e` builds, serves the production build and runs at 320 / 360 / 412 px (no sideways scroll, 44 px touch targets, full review, search/filter, settings, offline after first load, manifest/icons). Where Playwright cannot download its browser, point it at any Chromium binary: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium npm run test:e2e` (test infrastructure only, not a project dependency).

## Testing and QA (Phase 11)

| Command | What it runs |
|---|---|
| `npm run verify` | typecheck -> unit/component/architecture tests -> production build (the single check for any CI later) |
| `npm run verify:all` | `verify`, then the E2E suite. Without a Chromium it prints **E2E BLOCKED** and exits with code 2 (never a silent pass). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` where Playwright cannot download its browser. |
| `npm run qa:mutations` | Mutation QA without dependencies: copies the repository to a temporary folder, breaks one locked rule at a time (Due/MASTERED, accuracy, atomic review write, atomic restore, dataset and algorithm compatibility, orphan logs, srs-v1 intervals, project order, Thai drafts, PWA auto-update, AGAIN re-insertion) and requires the targeted tests to FAIL. The working tree is never modified. Exit 0 only if every mutation is killed. |

E2E (`tests/e2e`): phones 320/360/412 run the full suite; desktop 1024/1440 and landscape 812x360/915x412 run `smoke.spec.ts`. Real-browser checks include backup export -> reset -> import -> reload on Chromium's own IndexedDB, failure injection inside the import transaction at five points (database must be byte-for-byte unchanged), and the PWA update lifecycle across two builds (new version waits, no automatic reload, user data kept after "Update").

Locked by tests: released migrations (`v1Initial`, `v2ContentMeta`) are fingerprinted and the real v1 -> v2 upgrade is tested with user data; srs-v1 parameters are pinned as literal values (`tests/unit/srs/srsV1Locked.test.ts`).

## Final polish (Phase 12)

- **About & Sources** (Settings -> Sources & licences): the licence acknowledgement for KANJIDIC2 (see `DATA_SOURCES.md`).
- **Thai meanings:** `npm run dataset:thai-audit` reports coverage (`-- --require-complete` fails until every kanji is reviewed). Drafts live in `n5.th.json` with `reviewed: false` and are never shown; see `docs/release/thai-review.md`.
- **Mode D prompt:** the first kun reading without KANJIDIC notation (`.` okurigana, `-` prefix/suffix), else the first such on reading, else the original reading exactly as written. Readings are never edited.
- **Back navigation (Simple Home boundary):** opening a screen from Home adds one history entry; system/browser Back returns Home; screen-to-screen moves replace that entry; Back on Home leaves the app normally.
- **New-card order:** the same new cards, spread so one kanji's modes are not back to back (deterministic; due cards keep their due order).
- **Release:** `docs/release/release-readiness.md`, `docs/release/android-checklist.md`.
