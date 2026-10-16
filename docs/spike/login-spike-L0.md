# L0 Login Spike — test plan and results

Branch `login-spike` (from production `c6fdf23`). Never merged; not a release. Firebase project `n5-kanji-review-dev`
(Spark, no billing, no Analytics, Google provider only, no Firestore). Config only in the Cloudflare Pages **Preview**
environment (`VITE_FIREBASE_*`); nothing committed. Preview URL: `https://login-spike.n5-kanji-review.pages.dev`.

The `apiKey` and web config are not passwords, but they are not "safe by themselves" either: any future service must be
protected by Security Rules, Authentication and correct project settings (Coordinator, L0 Gate).

## Scope

- Spike page `login-spike.html` + `src/spike/loginSpike.ts` (plain DOM, Firebase `app` + `auth` only).
- Settings shows a link to it on this branch only (`LoginSpikeLink`).
- No sync, no Firestore, no change to IndexedDB, SRS, statistics or user data.
- Spike page and chunk are not precached; the service worker never answers `/login-spike` with the app shell.

## Contexts × methods

Contexts: **PC-tab** (Chrome tab), **PC-PWA** (installed), **AND-tab** (Android Chrome tab), **AND-PWA** (installed).
Methods: **A Popup** (`signInWithPopup`), **B Redirect** (`signInWithRedirect`, default authDomain `*.firebaseapp.com`).

Interpretation (Coordinator): Popup passes in every context but Redirect fails in some → report it; L0 is not a failure.
Popup fails in **any** context → STOP and propose options for a separate Gate. No Cloudflare Pages Function or proxy in L0.

## Tests

| ID | Test | Pass condition |
|---|---|---|
| T1 | Sign in (A and B) | Log `A popup: OK` / `B redirect: OK`; Status shows the account |
| T2 | User cancels (close popup / back out of the Google page) | Log shows an error code (e.g. `auth/popup-closed-by-user`, or `B redirect: returned with NO result`); app still usable |
| T3 | Sign out | `sign out: OK`, Status `— ไม่ได้ล็อกอิน —` |
| T4 | Reopen: close the tab / swipe the PWA away, reopen, open the spike page | Still signed in (`auth state signed in`) with no new sign-in |
| T5 | Offline: go offline, press A / B | A clear error code (e.g. `auth/network-request-failed`), no crash; back online → sign-in works |
| T6a | **Persistence** | After T4 (and after a device restart), signed in without a new sign-in; no token refresh needed to see the user |
| T6b | **Token refresh** | Press "แสดงข้อมูล ID token" (note `issued`), then "บังคับ refresh" → `refresh: OK` with a **newer** `issued`; `id token changed` logged |
| T6c | *Extra:* test user deleted in Firebase Console (Authentication → Users → Delete) | "ตรวจบัญชีกับเซิร์ฟเวอร์" and/or "บังคับ refresh" → error (`auth/user-not-found` or `auth/user-token-expired`) and the session ends (`auth state signed out`); signing in again creates a new user |
| T7 | Signed-out app still works; returning from the spike changes nothing | Review 2 cards → open spike → back: Home shows the same counts; review still works |
| T8 | Firebase SDK not loaded by the main app | DevTools → Network ("Preserve log", "Disable cache" off): load **Home**, then **Settings**, **before** opening the spike → no `loginSpike-*.js`, `firebase`, `googleapis`, `gstatic`, `identitytoolkit`. Then open the spike → `loginSpike-*.js` (and Google/Firebase requests on sign-in) appear only now |

T6 note: closing the app for an hour does not guarantee the ID token expires then, so persistence (T6a) and refresh (T6b)
are tested separately and refresh is forced on demand.

## Automated checks (this branch)

| Check | Command | Result |
|---|---|---|
| Typecheck + unit + build + E2E | `npm run verify:all` (Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) | **PASS**: unit 670/670; E2E 41 passed, 26 skipped by the existing per-viewport gating; no BLOCKED |
| Spike E2E (T8, T7, service worker) | `playwright test tests/e2e/loginSpike.spec.ts --repeat-each=3` | **PASS** 9/9 |
| Spike isolation in this build | `tsx scripts/qa/spikeIsolation.ts dist spike` | **PASS** (Firebase only in `assets/loginSpike-*.js`; not precached) |
| No spike in the production build | build `c6fdf23`, then `tsx scripts/qa/spikeIsolation.ts <dist> production` | **PASS**; `dist` byte-identical to production build `9545af3` (25/25 files) |

`verify:all` rule: if Chromium or another environment piece is missing it reports **BLOCKED** (exit 2). BLOCKED is reported
as BLOCKED, never as PASS, and no test is skipped to make it pass.

## Results (2026-10-16)

Preview deployment `e2b0b695` (commit `b9a96ad`, built with the Preview `VITE_FIREBASE_*` values). Chrome 155 on
Windows 10 (PC) and Android 10. Tester: project owner.

Evidence key: **log** = the spike page's copied log; **shot** = screenshot; **owner** = reported by the tester without a
log (the log lives only in the page and was lost before it was copied).

| | PC-tab | PC-PWA | AND-tab | AND-PWA |
|---|---|---|---|---|
| T1 A Popup | PASS (log) | PASS (log) | PASS (log) | PASS (log, shot: `PWA (standalone)`, Android 10) |
| T1 B Redirect | **NO result** (log) | **NO result** (log) | **NO result** (log) | **NO result** (log) |
| T2 cancel | PASS (owner) | PASS (owner) | — | — |
| T3 sign out | PASS (log) | PASS (owner) | PASS (log) | PASS (log) |
| T4 / T6a reopen, still signed in | PASS (owner) | PASS (log) | — | PASS (log) |
| T5 offline | PASS (owner) | PASS (owner) | PASS (log) | — |
| T6b token refresh | PASS (owner) | PASS (log) | PASS (log) | PASS (log) |
| T6c user deleted in Console (once) | PASS (log, shot) | | | |
| T7 app data unchanged after the spike | PASS (shot) | | | |
| T8 no Firebase on Home/Settings | PASS (shot) | | | |

Details
- **Redirect**: in every context the page returns from Google with `getRedirectResult` = null and no error code. This
  matches third-party storage blocking between `n5-kanji-review-dev.firebaseapp.com` and `*.pages.dev`. No proxy or
  Pages Function was added (out of L0 scope).
- **T5**: offline → `auth/network-request-failed` within 0.1 s, page stays usable. Back online: pressing A 8 s after the
  network returned still failed; pressing A again ~20 s later, **without reloading**, succeeded (Android tab).
- **T6b**: `getIdToken(true)` always returned a newer `issued` time; tokens expire 1 h after issue.
- **T6c**: after deleting the user in the Console, `user.reload()` → `auth/user-token-expired` and the session ended
  (`auth state signed out`); signing in again created a new uid (`W2njOC…` → `HQKn66…`).
- **T7**: Reviews today 2, Correct 2, New cards 2/10 before and after visiting the spike (also asserted on IndexedDB by E2E).
- **T8** (PC Incognito, Keep log): Home + Settings = 32 requests, 0 matches for `loginSpike`, `firebase`, `googleapis`,
  `gstatic`; after opening the spike, `loginSpike-*.js` appears, initiator `login-spike:11`.
- **Finding — shared session**: on one device the Chrome tab and the installed PWA share one Firebase session (same
  origin). Signing in in one shows signed in in the other; signing out in the tab signed the PWA out ~1.3 s later
  (PC and Android). L2 (logout / delete account) must account for this.

Limitations (kept on record)
- Some PC results are owner-reported, not logged (see the evidence key).
- T2 recorded no error code.
- T8 was checked on PC only (Android optional in the plan; covered by the automated E2E).
- Redirect did not succeed anywhere. **Login is proven for Google Popup only, not for every method.**

Untouched: Production stays `c6fdf23` (deployment `90ae9e05`); nothing pushed to `ui-import-button`; no Firestore, no
sync, no schema change. Production environment variables contain no `VITE_FIREBASE_*` (only `NODE_VERSION`).

## Coordinator Gate (2026-10-16)

- **L0: PASS** on the evidence above, with the limitations above.
- **L1: open**, limited to local data / migration and ReviewLog IDs (no Firestore, no sync engine, no login in the main
  app, no production change). L2–L4 not approved.
- Login method for L2: **Google Popup**. Redirect: not pursued now; a proxy or self-hosted helper needs its own Gate.
- Keep Firebase project `n5-kanji-review-dev`, the test user `HQKn66…` (temporary, minimal data, never real study data),
  branch `login-spike` (evidence; never merged) and the Preview `VITE_FIREBASE_*` values (Preview only; client config,
  not secrets; no private keys).
- `VITE_FIREBASE_*` and the web config are not a substitute for Security Rules.

## Stop conditions

STOP and report if: Popup fails in any context; a test needs Production, `ui-import-button`, billing, Firestore or a
proxy; main-app data changes after the spike; Firebase loads on Home or Settings. After testing, stop and wait for the
Coordinator before L1.
