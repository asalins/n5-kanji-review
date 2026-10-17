# L1 — Local IDs, migration v3, backup format 2

Branch `l1-local-ids` from production `c6fdf23`. Local data only: no login in the app, no Firebase, no Firestore, no
sync engine, no ReviewCard merge, no cross-device reset/import protocol (those are L2–L4 and need their own Gates).

Coordinator Architecture Gate: L1-1, L1-2, L1-4, L1-5 approved; L1-3 and the backup/device-identity split approved
with the conditions written below (2026-10-16).

## L1-1 New ReviewLog ids

Every review recorded from schema v3 on gets `id = "log:" + UUID v4` (`src/utils/uuid.ts`).
- Source: `crypto.randomUUID()`; if missing (outside secure contexts, older browsers) a v4 UUID is built from
  `crypto.getRandomValues()` (version/variant bits set). There is **no** `Math.random` fallback: with no
  cryptographic source the call throws (the review is not saved and the existing error message is shown).

## L1-2 Existing logs keep their ids

Logs recorded up to schema v2 keep `${cardId}#${reviewCount}`. Migration v3 never changes a primary key. Within one
database these ids cannot collide (logs are `add`ed, never overwritten; backups reject duplicate ids).

## L1-3 Collision resolver (pure; not wired to UI or sync in L1)

`src/services/sync/logCollision.ts` → `mergeReviewLogs(existing, incoming)`.

- **Event identity** (canonical, fixed order, JSON-encoded): `cardId, rating, reviewedAt, durationMs, stateBefore,
  stateAfter, datasetVersion, deviceId`.
- **Collision metadata** (never part of the event): `id, originalId`.
- `rootId = originalId ?? id` — the id a log was first recorded with.

Rules
1. Same `rootId` and same event → the same review → kept once.
2. Same `rootId`, different events → **all kept**. Sorted by canonical event text, the first keeps `rootId`
   (`originalId: null`); each other gets `id = rootId + "~" + sha256(event)[0..16)` and `originalId = rootId`.
3. Different `rootId`s are never merged, even with identical events (no history dropped on a guess).
4. Uniqueness: all kept `rootId`s are reserved first. A renamed id that is already taken (hash collision, or a real log
   that owns that id) retries with 32 hex, then the full 64 hex, then `~<64 hex>-2`, `-3`, … Renames are assigned in
   sorted `(rootId, event)` order, so this stays deterministic.
5. Schema rule: `originalId === null` or `id` starts with `originalId + "~"`.

Properties (tested): the result depends only on the set of `(rootId, event)` pairs, so A-then-B equals B-then-A (all
permutations of three sources); re-importing an already-merged file changes nothing; a renamed log is recognised by
its `originalId` when the original file arrives again; the hash is SHA-256 (`src/utils/sha256.ts`, checked against
`node:crypto`). A rename can still happen later if a *new*, different review with the same `rootId` appears — that is
rule 2, not drift.

## L1-4 Device identity vs log provenance

| | What it is | In a backup? | Import (Replace) | Reset progress / settings |
|---|---|---|---|---|
| `deviceMeta.deviceId` (store `deviceMeta`, key `current`) | identity of **this installation**, UUID v4, created once by migration v3 (or repaired once if missing) | **never** | never replaced | never cleared |
| `ReviewLog.deviceId` | provenance of **that review** (the installation that recorded it); `null` for logs from before v3 | **yes** (format 2) | restored as in the file | cleared with the log |

## L1-5 `UserSettings.updatedAt`

Epoch ms of the user's last explicit save, from the saving device's clock, stamped only by `SettingsRepository.save`
(Reset settings is an explicit save). `0` = unknown / oldest: defaults, data migrated from v2, backups of format 1.
It is informational for a future merge and **never proof of order** (device clocks differ).

## Migration v3 (`src/services/storage/migrations/v3SyncReadyLocal.ts`)

In the versionchange transaction: create `deviceMeta` with the installation id; every log gets `deviceId: null`,
`originalId: null` (same key, same values); saved settings get `updatedAt: 0`. Cards, sessions, streak and content are
not touched. Any failure aborts the transaction: the database stays at v2 with every record unchanged (tested both
before the first write and after every write). v1/v2 migrations are unchanged (fingerprint test).

## Backup format 2

Export writes `formatVersion: 2`, `databaseSchemaVersion: 3`; logs carry `deviceId`/`originalId`, settings carry
`updatedAt`; `deviceMeta` is never included. Import reads format 1 (frozen schema, then converted: log ids and all
values kept, `deviceId: null`, `originalId: null`, `updatedAt: 0`) and format 2, with the same integrity and
compatibility rules. Import (Replace) replaces cards, logs, sessions and settings only.

**Backward compatibility (must be told to users at release):** a backup exported by this version (format 2) **cannot
be imported by the current production app** (`c6fdf23`, format 1 only) — it reports "unsupported backup format
version". Backups made by the production app (format 1) import into this version without changes to learning data.

## Tests

- Unit: UUID (both sources, bit layout, no weak fallback); SHA-256 vectors; resolver rules 1–5, permutations,
  idempotent re-import, pre-resolved record, forced id clash; migration v3 on a production-shaped v2 database (every
  store compared raw, key by key); failure before/after writes (version and data unchanged); SRS/due cards/streak/logs
  unchanged and the next review scheduled exactly as `srsV1` would; device id stable across reopen, Import, Reset
  progress, Reset settings; repair of a missing record; settings stamp; export v2 shape; v2 → v2 round trip; the real
  production format-1 file (`tests/fixtures/production-backup-v1.json`, written by `c6fdf23` code) imported without
  changing learning data, then v1 → v2 → v2 identical; corrupted format-2 files rejected.
- E2E (Chromium): `migrationV3.spec.ts` seeds the production schema v2 with the production records before the app
  starts, then checks the upgrade, a new review, reload, Import (Replace) and export; `productionUpgrade.spec.ts` runs
  the real production build, creates data, deploys this build on the same origin and taps Update
  (requires `N5_BASELINE_DIST`; otherwise reported as skipped, never as passed).

## Results and Gate (2026-10-17)

**Coordinator Gate: L1 PASS** for commit `0ad62578c6762fa57a9f099f64171e7ad1a4ee65` (parent `c6fdf23`), bundle
`l1-local-ids-0ad6257.bundle`, SHA-256 `BFBC93B7268DE2C8E3C06AB1215AA6449C75CBF0DBAB7AC092532E1ADEA977F9`.
L2: design plan only (no implementation). Production stays `c6fdf23`.

| Check | Result |
|---|---|
| `verify:all` (Chromium, `N5_BASELINE_DIST` = `c6fdf23` dist) | PASS: unit 54 files / 703 tests; E2E 40 passed, 24 skipped by the existing per-viewport rule; no BLOCKED |
| Production build `c6fdf23` rebuilt | byte-identical to the production baseline, 25/25 files |
| Android Preview upgrade (`l1-upgrade-test2`) | `c6fdf23`: 3 reviews, New cards 20, backup v1 exported (Home 3 · 3 · 0 · 3/20 · 17) → "A new version is available" → Update to `0ad6257`: Home unchanged → 1 more review (4 · 4 · 0 · 4/20 · 16) → Import of the v1 backup → 3 · 3 · 0 · 3/20 · 17 |

Limitations kept on record
- Closing/reopening the app after the Import was **not** evidenced on the phone; the E2E reload after the upgrade is
  used instead. It must not be described as tested on the phone.
- Phone evidence is the Home figures only; IndexedDB-level checks are unit/E2E.
- `productionUpgrade.spec.ts` needs `N5_BASELINE_DIST`; without it it is reported as skipped, never passed.
- The phone procedure was skipped twice (`l1-local-ids`, `l1-upgrade-test`: both pushes ran back to back) and redone on
  `l1-upgrade-test2` one command at a time. No force push.

### Preview deployment evidence (Cloudflare Pages, project `n5-kanji-review`, screenshot 2026-10-17 09:52)

| Branch | Commit | Deployment | Use |
|---|---|---|---|
| `l1-upgrade-test2` | `0ad6257` | `5996f8d7` | phone: after Update (evidence) |
| `l1-upgrade-test2` | `c6fdf23` | `a6e3a268` | phone: production version, data created (evidence) |
| `l1-upgrade-test` | `0ad6257` | `b8b7c3da` | procedure skipped (not evidence) |
| `l1-upgrade-test` | `c6fdf23` | `f48eaa80` | procedure skipped (not evidence) |
| `l1-local-ids` | `0ad6257` | `65e91ab4` | L1 Preview |
| `l1-local-ids` | `c6fdf23` | `22e021fa` | procedure skipped (not evidence) |
| `ui-import-button` (Production) | `c6fdf23` | `90ae9e05` | unchanged |

The dashboard truncates the branch name to `l1-upgrade-tes…` for the first two rows; they are `l1-upgrade-test2`
because `l1-upgrade-test` is listed separately in full and these are the only other deployments of those commits.
Branches `l1-upgrade-test` and `l1-upgrade-test2` point to `0ad6257` (same commit as `l1-local-ids`) and hold no work
of their own; the Coordinator allowed deleting them once this record is stored. Their Preview deployments stay listed
in Cloudflare after the branches are deleted.
