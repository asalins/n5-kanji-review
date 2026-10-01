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
