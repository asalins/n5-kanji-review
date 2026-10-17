# L2 — Optional account: Login / Logout / deleted accounts / Privacy / Delete Account

Branch `l2-account` from `l1-local-ids` `4cbcf40` (verified with `git ls-remote` before branching). Plan: L2 Design
Plan Rev.3 (Coordinator Design Gate APPROVED 2026-10-17). No Firestore, no sync, no production change.

## What exists

- `src/services/account/` — the account service. `firebaseAdapter.ts` is the only module importing Firebase and is
  loaded with `import()` (own chunk `assets/firebaseAdapter-*.js`, ~95 kB). Google **Popup** only.
- Settings → **บัญชี · Account** and **ความเป็นส่วนตัว · Privacy** (Thai + English). Shown only when the Firebase web
  config (`VITE_FIREBASE_*`, Preview env) **and** the contact e-mail `n5kanjireview.support@gmail.com` are present.
  Production has no config → no account section, app unchanged.

## Rules implemented (Design Gate)

| Rule | Implementation |
|---|---|
| D-L2-1 lazy SDK | Signed-out users never load the chunk (Home, review, Settings). It loads on **Sign in**, or at start-up when the account hint exists. The chunk is excluded from the service-worker precache. |
| C1 hint ≠ sign-in | Hint = `localStorage['n5-kanji-review.accountHint'] = '1'`, nothing else. Status comes from Firebase only: `signed-out` / `checking` / `signed-in` / `signed-in-offline`. Hint without a Firebase user → signed out, hint removed, no error. |
| D-L2-4 errors | account (`user-token-expired`, `user-not-found`, `user-disabled`, `invalid-user-token`) → signed out + notice + hint removed + cached session dropped; network → state kept (`signed-in-offline`, or `checking` offline if the chunk cannot load), re-checked on `online`; unknown → state kept. |
| D-L2-2 / D-L2-3 sign out | "Sign out on this device" (all tabs and the installed app of this origin, not other devices). Local data kept by default; the delete box is never pre-ticked; shared-device warning. A failed sign-out touches nothing local. |
| D-L2-5 / C2 Delete Account | "I understand" → re-authenticate (popup; cancelling deletes nothing) → (L3: cloud data here) → `deleteUser` → local data only if ticked, only after the account is gone. Result per part: account / cloud ("the app stored no learning data in the cloud") / local (kept, deleted, or failed with **Try again**). Never "everything deleted". |
| D-L2-6 | The cloud step is a placeholder; L3 must delete cloud data before `deleteUser`. |
| D-L2-7 / C3 Privacy | What is stored, why, how long, what deletion does, what the app cannot promise (provider logs/backups; Firebase states Auth data is removed from live and backup systems within 180 days after deletion), Google/Firebase policy links, contact e-mail; Thai + English. |
| D-L2-8 | No config or no contact e-mail → `unavailable` → no section, no Login button. |

Shared session (L0 finding): tabs and the installed app share one session. A sign-in elsewhere is followed through
the `storage` event on the hint; sign-outs and deletions arrive through Firebase's own state change.

Known limitation (kept on record): **no runtime caching** (approved PWA rule unchanged). Offline at start-up, a
signed-in user whose browser has not kept the Firebase chunk sees "checking (offline)" until back online; the session
and hint are kept and studying works as usual.

## Tests

- Unit: account service with a fake adapter (states, error classes, hint, cross-tab, sign-in errors, sign out, Delete
  Account parts and order, retry), config/hint, UI (hidden without config, privacy before sign-in, no "all devices",
  boxes not pre-ticked, C2 messages, no over-claims), Privacy content (Thai + English, e-mail in both, links, 180-day
  statement attributed to Firebase), architecture (only the adapter imports Firebase; only by `import()`; UI never
  touches storage/Firebase), PWA (chunk not precached).
- **Firebase Auth Emulator** (`npm run test:auth-emulator`, needs `FIREBASE_AUTH_EMULATOR_HOST`; without it the
  suite fails with "AUTH EMULATOR BLOCKED"): real `firebase/auth` through the app adapter — user reported, reload OK,
  console-deleted account → account error, disabled → `auth/user-disabled`, sign out, `deleteUser` removes the user,
  service ends a deleted account's session with the notice, service Delete Account deletes the Auth user. Popup steps
  cannot run in the emulator (re-authentication is stubbed there) — covered by the manual matrix.
- E2E (Chromium, build with a FAKE config; every Google/Firebase request blocked): signed-out Home + review +
  Settings make no Firebase request; Privacy readable offline with working link targets; the chunk loads only on
  Sign in; a hint without a session loads the SDK, ends signed out and removes the hint.
- `scripts/qa/accountIsolation.ts <dist>`: Firebase code only in the account chunk; not in index.html; not precached.

## Manual test matrix (Preview `l2-account`, project `n5-kanji-review-dev`)

Contexts: PC tab, PC PWA, Android tab, Android PWA. In each: sign in (popup); close/reopen → still signed in; sign out
in a tab → the other tab and the PWA follow; offline at start-up → not signed out; cancel the popup → still signed
out, no error; delete the user in the Firebase Console → reopen → "expired or deleted" and signed out; in-app Delete
Account: cancel the verification → nothing deleted; complete it → account deleted, local data kept, other tab follows;
learning figures on Home unchanged in every case.
