# Login and Cloud Sync Activation — plan (preparation only)

Production: `dff6d4c` (L3, dark, deployment `8f0c0771`), IndexedDB v4, no `VITE_FIREBASE_*`. Firebase Production
project `n5-kanji-review-prod` set up (F1–F5, `l2-release.md` §7); no Firestore yet. Coordinator: prepare on Dev/Preview
without sub-gates; an Activation Gate is required before any Firebase config or service is enabled in Production.

## 1. Code prepared (branch `l5-login-activation`, from `dff6d4c`)

| Commit | Change |
|---|---|
| `affcca8` (CI run `39113311567`: verify, migration, D3, isolation, emulators + rules, E2E — success) | **Public privacy notice** at `/privacy.html`: emitted at build time from `PRIVACY_TEXT` (the in-app Privacy screen's text), static (no script, no external request), precached, excluded from the app-shell fallback (`navigateFallbackDenylist`). Test `tests/unit/account/privacyPage.test.ts` (same TH/EN text, contact e-mail, provider links, no script, not the app shell). No change to storage, sync, SRS or the account code |

Checked in a browser (`vite preview`, service worker active): `/privacy.html` is served as its own page under the
service worker (no `#root`, 0 scripts, 14 entries, TH + EN + provider links).

Release of this commit = a normal UI release (dark; DB stays v4; fast-forward from `dff6d4c`). It gives the stable URL
`https://n5-kanji-review.pages.dev/privacy.html` needed **before** the consent screen can be completed.

## 2. Login Activation — checklist

| # | Item | Who | Status |
|---|---|---|---|
| L1 | Release `/privacy.html` (above) | Claude (Gate) | prepared |
| L2 | Add `n5kanjireview.support@gmail.com` as a member of `n5-kanji-review-prod` (Viewer is enough); select it as support e-mail in Authentication → Google and in Google Auth Platform → Branding | owner (needs that mailbox) | **member added** 2026-10-18 16:04: `n5kanjireview.support@gmail.com` = Viewer, invitation accepted; support e-mail not switched yet (with L3 Branding) |
| L3 | Branding: home page `https://n5-kanji-review.pages.dev`, privacy `https://n5-kanji-review.pages.dev/privacy.html`, authorized domain `n5-kanji-review.pages.dev`; Save. If Google refuses `pages.dev` as an authorized domain, record it and decide (custom domain or no home-page link) | owner | open |
| L4 | Publishing status: currently "In production" (set by Firebase); keep for basic scopes (email/profile/openid need no verification) or verify branding — decision | Coordinator | open |
| L5 | **Smoke test with the production project before Production**: see §4 | owner + Claude | open |
| L6 | Activation release: `VITE_FIREBASE_*` of `n5-kanji-review-prod` in the Cloudflare **Production** environment → rebuild of the same commit (no code change) | Claude (Gate) | open |
| L7 | Post-activation: sign in / out (PC, Android tab, installed PWA), Privacy page, Delete Account, offline start-up, other tab follows; Network: Firebase chunk only after Sign in | owner + Claude | open |

**Important:** with L3 code, signing in leads to the sync binding prompt and Firestore calls. Without a Firestore
database these calls fail ("sync failed"; local data untouched — expected, not yet tested against a project without a
database). So either Login and Sync are activated together, or the "Login only" period is tested explicitly (L5).

## 3. Cloud Sync Activation — checklist

| # | Item |
|---|---|
| S1 | Firestore: Standard, `(default)`, **asia-southeast1**, production mode |
| S2 | Publish `firestore.rules` of the released commit (paste the whole file) |
| S3 | Save the published rules from the Console; `git diff --no-index --ignore-cr-at-eol` with the repo file |
| S4 | Rules Playground: owner get `users/<uid>` allowed; another uid get / create log denied; signed out denied |
| S5 | API key: add **Cloud Firestore API** to the 2 allowed APIs (referrers unchanged) |
| S6 | Smoke test (owner's account + a test account U2): bind, sync two devices, Reset (F2), Import, settings after replace (F9), offline (F8), Delete Account; replayCheck `differing = 0` |
| S7 | Recovery if sync misbehaves: remove `VITE_FIREBASE_*` + rebuild (dark again; local data kept; cloud data stays until account deletion); rules fault: republish the last good rules |

## 4. Where to test with the production project (decision needed)

Cloudflare environment variables are per environment (Production / Preview), not per branch, and Preview already uses
the dev project. Options:

| Option | How | Production impact | Note |
|---|---|---|---|
| **A (recommended)** | Local build with the production config in an uncommitted `.env.local`, served on `http://localhost:4198`; **temporarily** add `localhost` to Authorized domains and `http://localhost:4198/*` to the key's referrers; remove both after the test | none | the owner's and U2's accounts only; test data only; evidence by screenshots + Firestore console |
| B | Switch Cloudflare **Preview** env to the production config for one alias | none on Production, but every Preview build would use the production project meanwhile | more moving parts |
| C | Test only after activation on Production with the owner's account | Production changes first | no pre-test; not recommended |

## 5. Not done / open

- Real Spark quota: BLOCKED.
- The support mailbox must be accessible by the owner (L2).

## 6. Progress (2026-10-18) — Coordinator: Activation Prep 1 PASS (D1 privacy dark release, D2 localhost, D3 one Gate in order, D4 keep "In production")

### Privacy release (D1)
`affcca8` deployed: fast-forward `dff6d4c..affcca8`, production deployment **`0898e5df`**; Production variables
`NODE_VERSION` only (16:09). `https://n5-kanji-review.pages.dev/privacy.html` and `/privacy` show the notice (not the
app) in a tab with the service worker active and in Incognito (no sign-in). App update: Home unchanged, no account
section. Android check of the URL: not evidenced.

### OAuth / Branding (L2–L4)
`n5kanjireview.support@gmail.com` = project Viewer. Branding saved (owner account): home page
`https://n5-kanji-review.pages.dev`, privacy `…/privacy.html`, authorized domains `n5-kanji-review-prod.firebaseapp.com`
and `n5-kanji-review.pages.dev`, developer contacts support + owner. **User support e-mail stays the owner's address**:
Google offers only the signed-in user's e-mail or a Google Group they manage (none). Publishing status "In production"
kept (D4); Verify branding not requested.

### Firestore Production (S1–S5)
| # | Result |
|---|---|
| S1 | `(default)` database created (production mode): location **asia-southeast1**, Standard, Firestore Native, scheduled backups disabled (screenshot 19:26) |
| S2 | Rules published 17:36 = `firestore.rules` of `affcca8` (= `dff6d4c`) |
| S3 | Published text saved from the console: `git diff --no-index --ignore-cr-at-eol` with the repo file = **no difference**, no BOM |
| S4 | Rules Playground: owner get allowed; other uid get denied; other uid create log denied; unauthenticated get denied |
| S5 | Browser key APIs: Identity Toolkit, Token Service, **Cloud Firestore** (3) — permanent |

### Localhost test with the production project (D2, option A)
Separate checkout `n5-localtest` at `affcca8`, production web config in an uncommitted `.env.local`, `vite preview` on
`http://localhost:4198`; temporary: authorized domain `localhost`, key referrer `http://localhost:4198/*`.
Accounts: T1 = test Gmail (former U2), T2 = support mailbox; the owner's learning data never involved.

| # | Result |
|---|---|
| T1 | A: 3 reviews → Google popup sign-in (T1) → binding prompt → Upload → `synced (epoch 0): pushed 3`. Firestore `users/<T1>` schema 1, epoch 0, server `createdAt`, 3 `log:<uuid>`. Auth: T1 |
| T2 | B (Incognito) sign-in T1 → bound silently → `pulled 3` → 1 review → `pushed 1`; A sync → `pulled 1`, Home 4. Firestore 4 logs |
| T3 | B sign out (local kept) → sign in T2 → `asking before binding (other-account); nothing uploaded` → skip. Firestore: only `users/<T1>` (4 logs); nothing of T2 |
| T4 | B back to T1: syncs, no other-account notice. A Reset progress: `asking the cloud to raise epoch 0 -> 1 (only if it is still 0)` → `the cloud raised the epoch to 1` → `replace: deleted 4 cloud logs of epochs below 1`. Firestore epoch 1, `replacedBy`, server `resetAt`, logs empty. B: `remote reset detected: cloud epoch 1, this device knew 0; nothing uploaded`, notice with time; accepted → cleared |
| T5 | A 2 reviews at epoch 1 → export `LT-A.json` (DB 4, 2 logs, no uid/sync state) → replayCheck PASS. Offline (DevTools) Reset → "You must be online … Nothing was changed". Delete Account T1 → "account deleted / learning data in the cloud deleted / data on this device kept"; Firestore empty; B signed out. T2 deleted. Network during delete: Firebase Auth iframe only |
| — | Note: an Auth record for the owner's Google account appeared during the session (signed in once by mistake); it had no Firestore data; deleted from the console. Final state: **Auth no users, Firestore empty** |

Cleanup: server stopped; `.env.local` and the test build deleted; authorized domain `localhost` removed (3 domains
left); key referrer `http://localhost:4198/*` removed (2 referrers left, 3 APIs kept; saved).

## 7. Switch-off / Recovery test (Coordinator: CONDITIONAL APPROVAL, D3) — Preview, dev project, test data

Branch `act-recovery-test` = `affcca8` (same commit as Production); Cloudflare **Preview** environment variables only;
account T1 (test Gmail) on `n5-kanji-review-dev`; authorized domain `act-recovery-test.n5-kanji-review.pages.dev` added
to the dev project for the test. Production variables untouched throughout.

| Step | Build evidence (fetched from each deployment's main JS) | App evidence |
|---|---|---|
| R1 configured | `5ae4b787`: `index-DYaCfeMs.js`, dev project id + API key present | 3 reviews → sign-in T1 → upload → `synced (epoch 0): pushed 3`; dev Firestore 3 logs; `R1.json` DB 4, 3 logs |
| R2 dark | Preview `VITE_FIREBASE_*` deleted → **Retry deployment** → `8ec4b248`, `007b708b` (two retries): `index-z9jBbYl0.js`, **no** project id, **no** key | Update banner → no Account section; Network `firebase` 0/11, `google` 0/22; `R2.json` identical to `R1.json` in every field; 1 review while dark |
| R3 configured again | 4 variables re-added → **Retry deployment** → `86518617`: `index-DYaCfeMs.js` (**same file as R1**), same key (hash compare) | Update → still signed in as T1, **no binding prompt**, `synced (epoch 0): pulled 0, pushed 1` (the dark review, once); no reset/raise line; dev Firestore 4 logs, all ids distinct, epoch 0; `R3.json` 4 logs, R2 logs unchanged, settings unchanged, replayCheck PASS |

**Proven:** Cloudflare *Retry deployment* rebuilds the same commit with the **current** environment variables (dark build
has a different bundle without any Firebase value; re-enabling reproduces the R1 bundle byte for byte by name). Local
data survives both switches; re-enabling resumes the same binding and uploads only what is missing.

## 8. Emergency runbook (after activation)

| Situation | Action | Effect | Evidence |
|---|---|---|---|
| Sync misbehaves (client side) | Cloudflare → Settings → **Production** → delete the 4 `VITE_FIREBASE_*` → Deployments → latest Production → **⋯ → Retry deployment** → check the new bundle has no project id | New loads/updates are dark; local data kept; cloud data stays. **Already-open/old builds keep a valid session until they update** | §7 R2 |
| Cloud writes must stop now (security / data issue) | Firebase → Firestore → Rules → paste `docs/release/firestore-freeze.rules` → Publish (≈1 min) | Owners still read; every create/update/delete refused for all clients (old builds included); app reports sync failure, local data untouched (L3 handles `permission-denied` with back-off) | freeze rules CI run `39138832775` (emulator: owner reads OK, all writes refused) |
| Stop sign-ins | Firebase → Authentication → Sign-in method → Google → Disable | No new sessions; existing tokens stay valid ≤ 1 h | — (console function, not tested) |
| Resume | Republish `firestore.rules` of the release commit (diff with the repo as in S3); re-add variables + Retry | Same as R3 | §7 R3 |
| Never | Cloudflare Rollback across DB v4; advising users to clear site data | — | R-1 |
