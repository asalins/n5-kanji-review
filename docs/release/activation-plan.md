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
