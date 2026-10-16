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
| Typecheck + unit + build + E2E | `npm run verify:all` (Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`) | see report |
| Spike isolation in this build | `tsx scripts/qa/spikeIsolation.ts dist spike` | see report |
| No spike in the production build | build `c6fdf23`, then `tsx scripts/qa/spikeIsolation.ts <dist> production` | see report |

`verify:all` rule: if Chromium or another environment piece is missing it reports **BLOCKED** (exit 2). BLOCKED is reported
as BLOCKED, never as PASS, and no test is skipped to make it pass.

## Results (owner fills in)

| | PC-tab | PC-PWA | AND-tab | AND-PWA |
|---|---|---|---|---|
| T1 A Popup | | | | |
| T1 B Redirect | | | | |
| T2 cancel A / B | | | | |
| T3 | | | | |
| T4 | | | | |
| T5 A / B | | | | |
| T6a | | | | |
| T6b | | | | |
| T6c (extra, once) | | | | |
| T7 | | | | |
| T8 (PC DevTools; Android via `chrome://inspect`) | | | | |

Evidence: the spike page's "คัดลอก log" text for each context, plus screenshots.

## Stop conditions

STOP and report if: Popup fails in any context; a test needs Production, `ui-import-button`, billing, Firestore or a
proxy; main-app data changes after the spike; Firebase loads on Home or Settings. After testing, stop and wait for the
Coordinator before L1.
