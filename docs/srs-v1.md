# SRS specification: `srs-v1`

Code: `src/services/srs/` (`constants.ts` holds every number, `srsV1.ts` the algorithm, `calculations.ts` integer helpers). Tests: `tests/unit/srs/`. One source of truth: the UI and orchestrator never compute scheduling.

## Why this algorithm
| Option | Verdict |
|---|---|
| Original SM-2 (no steps) | Needs a per-card "repetition number" the model does not store; poor for same-day retries. Rejected. |
| Leitner boxes | Very simple, but ignores HARD/EASY and has no ease; the model already has `ease`. Rejected. |
| FSRS | Best retention, but needs trained parameters, per-card stability/difficulty fields and float math. Not explainable or testable to the digit; no data to fit. Rejected for now. |
| **Stepped SM-2 variant (Anki-style)** | Fits the existing fields (`state`, `interval`, `ease`, `due`), four ratings and five states; explainable; all integer math; easy to test; the `algorithmVersion` field lets a later FSRS coexist. **Chosen.** |

## Units (one canonical representation)
- `interval`: whole **minutes**. REVIEW/MASTERED intervals are whole days x 1440.
- `ease`: integer **per-mille** (2500 = multiplier 2.5). No floating-point drift.
- `due`, `lastReviewed`: epoch **milliseconds**. `due = now + interval x 60000`, exactly.
- Rounding: integer division rounded half up (`roundDiv`). Ease is clamped to [1300, 3500]; REVIEW intervals to [1, 365] days.

## States and ratings
- **NEW**: created, never rated. `interval 0`, `ease 2500`, `due = creation time`, counters 0, `lastReviewed null`, `algorithmVersion srs-v1`. Excluded from `getDueCards` by state; listed by `getNewCards` in creation order.
- **LEARNING**: stepping through learning steps `[10 min, 1 day]`. The step is recovered from `interval` (no extra field).
- **REVIEW**: normal spaced review, interval < 21 days.
- **RELEARNING**: a REVIEW/MASTERED card that failed; one step `[10 min]`.
- **MASTERED**: a card in review whose scheduled interval is **>= 21 days** (stored state, not a UI label). It schedules like REVIEW; AGAIN loses it.

| State | AGAIN | HARD | GOOD | EASY |
|---|---|---|---|---|
| NEW / LEARNING | LEARNING, step 0 (10 min) | repeat current step (NEW: 10 min) | next step; after the last step REVIEW at **3 d** | REVIEW at **7 d** |
| REVIEW / MASTERED | RELEARNING, 10 min, ease -200 | days = max(prev, round(prev x 1.2)), ease -150 | days = max(hard+1, round(prev x ease)), ease same | days = max(good+1, round(prev x ease x 1.3)), ease +150 |
| RELEARNING | repeat 10 min | repeat 10 min | REVIEW at **1 d** (progress is reset) | REVIEW at **3 d** |

Example (REVIEW, 3 days, ease 2500): HARD 4 d / 2350, GOOD 8 d / 2500, EASY 10 d / 2650. A new card rated GOOD is due in 1 day; rated EASY in 7 days.

## Rules
- **Overdue:** overdue time does NOT change the interval; growth starts from the scheduled interval. Due order (repository) is overdue-first: `due` ascending, ties by id.
- **Counters:** every rating increments `reviewCount`. AGAIN increments `incorrectCount`; HARD, GOOD, EASY increment `correctCount`. Counters never decrease; id, itemType, itemId, mode never change.
- **Card identity:** `itemType:itemId:mode`: each mode is its own card.
- **Determinism / purity:** same card + rating + `now` gives the same result. `now` is a parameter (non-negative integer epoch ms). No clock, randomness, storage, UI. The input card is never mutated.
- **Versioning:** `algorithmVersion = "srs-v1"` is written on every processed card. A card carrying another version is rejected (`ValidationError`), never reinterpreted; a future `srs-v2` must migrate explicitly.
- **Time zones:** the algorithm only adds durations to instants, so DST and time zones cannot change a result. Local study days (streak, daily limits) are derived later from `lastReviewed`/`reviewedAt` plus a time zone; nothing stored prevents that.
- **durationMs** is measured by the session layer and passed in; SRS never invents it.

## Persistence requirement (open)
A review writes the updated card and a ReviewLog. Both must be stored in ONE transaction. `ReviewRepository` currently has separate `saveCard` and `appendLog`, so the orchestrator (`features/review/reviewOrchestrator.ts`) depends on a port `ReviewRecorder.recordReview(card, log)` that the repository does not implement yet. It is not wired into the app until the Architecture Coordinator approves adding that method.
