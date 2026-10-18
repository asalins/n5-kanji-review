# L4 — multi-device hardening

Branch `l4-multidevice` (from `l3-sync` @ `9a1455c`). Dev / Preview only; Production stays `c6fdf23`.

## L4-C1 — Reset / Import on a bound device (closes F2, Release Blocker)

**Problem (F2).** In L3 a bound device's Reset / Import cleared local data and set `pendingReplace`; the next sync
raised the cloud epoch from *whatever it read then*. A device that had not yet seen another device's replace could
therefore replace the account again, silently discarding that replace.

**Now.** A replace is decided by the cloud, atomically, before anything local changes.

| Step | Where | On failure |
|---|---|---|
| 1. Must be online, signed in, the server confirms the same uid, and the device has synced (`knownEpoch` known, no legacy pending replace) | `syncService.replaceAccount` | refused (`offline` / `not-signed-in` / `not-synced` / `cloud-failed`); nothing changed, nothing queued |
| 2. Firestore **transaction** `bumpEpoch(uid, knownEpoch, token)`: re-reads `users/{uid}`; commits `epoch = knownEpoch + 1`, server `resetAt`, `replacedBy = token` **only if** the stored epoch is still `knownEpoch` | `firestoreCloud.bumpEpoch` | epoch differs → `conflict`: no write, local data untouched, user told the account was already replaced elsewhere and offered the normal remote-reset choice. Network / quota / denied → refused, nothing changed |
| 3. One IndexedDB transaction: replace the data **and** set meta `{knownEpoch: new, cleanupBelow: new, pushSettings: true, pullCursor: null}` | `IndexedDbBackupRepository` (`AccountReplace`) | `local-failed`: cloud epoch is raised but no cloud log was deleted; local data is unchanged; the device then sees the normal remote-reset notice (it can export, then accept). Success is never reported |
| 4. Next sync deletes logs of older epochs and uploads this device's logs / settings | `syncEngine` | normal retry / back-off |

- Steps 1–3 run under the `n5-sync` Web Lock with background sync suspended, so a sync cannot interleave.
- Two devices replacing from the same epoch: Firestore serialises the transactions; the second re-reads the new
  epoch and is refused (`conflict`). The rules enforce the same independently: `epoch == resource.epoch + 1`,
  `resetAt == request.time`, `replacedBy` 8–64 chars, no other keys.
- `replacedBy` (random per attempt) makes an internal transaction retry idempotent (F4): a retry that finds its own
  token at `knownEpoch + 1` returns success instead of raising again or reporting a false conflict.
- The repository refuses a bound replace without a matching `AccountReplace` (`ValidationError`, whole transaction
  aborted), so no code path can clear a bound device's data ahead of the cloud.
- Not bound: local only, as before.
- Legacy: a `pendingReplace` left by an L3 build is applied only if `knownEpoch` still equals the cloud epoch;
  otherwise it is dropped (logged) and the remote-reset notice is shown.

Write order is cloud first, then local, because the two stores cannot commit together: a failure after step 2 leaves
an empty-but-raised account epoch that every device (this one included) handles through the existing remote-reset
path, while the reverse order could leave local data cleared with the cloud unchanged and no record of intent.

## L4-C2 — quota / unavailable (SIMULATED)

Fault injection in the in-memory cloud (`tests/helpers/memoryCloud.ts`) for `quota` and `network` during the replace
check and during upload: no log lost, epoch not raised, back-off / quota pause as in L3. Reported as
**SIMULATED PASS**; a real Spark quota stays **BLOCKED**.

## L4-C3 — CI maintenance

`emulator-tests.yml`: `actions/checkout`, `setup-node`, `setup-java` v4 → v5. No permission, trigger or deployment change.

## L4-R — Remediation (Gate: L4 Remediation Plan APPROVED WITH CONDITIONS)

Branch `l4-remediation` from `7c6e5c7` (the L4 baseline is not changed).

### F7 / O4 — sync log
- Reset / Import write `asking the cloud to raise epoch X -> X+1 (only if it is still X)` and only after the commit `the cloud raised the epoch to N` (or the refusal).
- State lines (`remote reset detected`, `asking before binding`) are written once per minute across tabs. This only affects the display: nothing runs twice.

### F8 — offline status, cycle timeout
- The `offline` event shows "offline" at once.
- A cycle still waiting after 30 s is reported as offline or as a network error, using the existing back-off. Quota pause and F6 are unchanged.
- A Firestore request cannot be cancelled, so the cycle keeps the cross-tab lock until it settles. No second cycle runs meanwhile, so nothing is sent twice. Its late status is ignored (generation token), while its data changes still refresh the screens.
- Reset / Import waits at most 30 s for such a cycle; otherwise it is refused and nothing changes.

### F9 (D-F9) — settings after a replace: the epoch decides, never a clock
| Step | Rule |
|---|---|
| Import with settings, bound device | `bumpEpoch` writes the file's settings to `meta/settings` in the **same Firestore transaction** as the epoch (both or neither) |
| Reset / Import without settings | the account's settings are not touched |
| Device that accepts the remote reset | `syncMeta.pullSettings = true` → the next sync takes the account's settings **without comparing `updatedAt`**, before any upload |
| Any settings upload | a transaction that writes only if the cloud is still at this device's epoch; otherwise nothing is written and the device sees the remote reset |
| Afterwards | D5 (newer `updatedAt` wins) as before |

- `syncMeta.pullSettings` is local only (never in a backup); records written before L4-R read it as `false`.
- No change to the Firestore rules, the backup format or the log/card schema.
- Residual (D5, unchanged by decision): **after** the replace, a device whose clock runs far ahead stamps its new settings changes in the future, and those win over later changes made on correct clocks until that time has passed. A replace still overrides such a device (pull without comparison).

### F10-A — device clock
- **Measurement:** HEAD `/favicon.svg?clock-check=<unique>` on the app's own origin, `cache: 'no-store'`. The service worker precaches GET only and has no runtime routes; an E2E test checks the answer is not from the service worker.
  - Server time = `Date` header + 0.5 s, placed at the middle of the round trip.
  - Uncertainty = 0.5 s + RTT / 2.
- **Verdict:**
  - **Wrong** when it is certainly ≥ 5 min off.
  - **Unknown** (never "ok") when there is no or an unparsable `Date`, the request failed, RTT > 10 s, the device is offline, or the difference is within the uncertainty.
  - A result is used for ≤ 5 min of monotonic time; a later change of the device clock is subtracted.
- **Online and wrong:** the recording review is refused and nothing is stored. Today's review explains why and offers "Check again". Practice still works.
- **Unknown:** reviews are recorded as before (offline-first), with a note that the time could not be checked.
- **Future-dated reviews:** found with a fresh server time; shown on Home with their count and dates, kept and synced unchanged, and written once to the sync log.
- **Limits (stated):**
  - Offline with a wrong clock, reviews are still recorded with the device time (the K2 offline case). It becomes visible later only if the date is still in the future.
  - Logs from a clock that was behind, or future dates that real time has already passed, are not found.
  - The check cannot prove every time error.
- No change to SRS, the ReviewLog schema or the Firestore rules.

### O2 — daily limits are per device
Stated under Settings and in `docs/srs-v1.md`.
