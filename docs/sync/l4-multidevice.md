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
