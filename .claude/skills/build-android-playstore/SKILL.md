---
name: build-android-playstore
description: Package the N5 Kanji Review PWA as an Android app and prepare it for Google Play (TWA or Capacitor wrapper, signing, AAB, versionCode, target API, Data safety, closed testing, listing assets, safe areas, back button, offline). Use when asked to build an Android app, publish or update on Google Play / Play Store, make an APK/AAB, or fix Play Console upload and review errors.
---

# Build for Android and Google Play

The app is already a working offline PWA (Vite + vite-plugin-pwa, IndexedDB, hosted on Cloudflare Pages at `https://n5-kanji-review.pages.dev`). Real-device PWA results live in `docs/release/android-checklist.md`. Keep the PWA working; the Android app is an additional delivery channel.

## 1. Choose the wrapper (ask the owner; recommend)

| | TWA (Trusted Web Activity, Bubblewrap) | Capacitor |
|---|---|---|
| What ships | Thin Android shell that opens the hosted PWA in Chrome | The built `dist/` bundled inside the APK/AAB |
| Updates | Instant (deploy to Pages) | Store release (or Capgo live updates for web assets) |
| Offline | Service worker, as today | Built in; disable/scope the SW in the app build |
| Native APIs | Very limited | Plugins (notifications, billing, haptics) |
| Effort | Small | Medium |
| Play Billing | Via Digital Goods API | `@capgo/native-purchases` / RevenueCat |

Recommendation: start with **TWA** for the first Play release (the PWA already passes the real-device checklist); move to **Capacitor** when native features or Play Billing via a plugin are needed. Record the decision in `docs/release/`.

### TWA path
1. Check `pwa.config.ts` manifest: name, short_name, `start_url`, `scope`, `display: standalone`, theme/background colours, 192/512 and maskable icons.
2. `npx @bubblewrap/cli init --manifest https://n5-kanji-review.pages.dev/manifest.webmanifest` (needs JDK 17 + Android SDK; Bubblewrap can install them), then `bubblewrap build` → `app-release-bundle.aab`.
3. Digital Asset Links: publish `public/.well-known/assetlinks.json` with the package name and the **Play App Signing** SHA-256 (from Play Console → App integrity), not only the upload key. Without it the app shows a browser URL bar.
4. Keep `targetSdkVersion` at the current Play requirement (API 36 since 31 Aug 2026).

### Capacitor path
Follow `references/webapp-to-capacitor.md` (phased plan) then `references/capacitor-app-store.md`. Repo-specific points:
- `webDir: 'dist'`; `npm run build && npx cap sync android`.
- Service worker: avoid stale bundles in the app build (vite-plugin-pwa can be disabled with an env flag for `cap` builds).
- Android back button: map to the existing in-app history in `src/app/navigation.ts` (Detail → Search → Home → exit), matching checklist row 8.
- Safe areas / edge-to-edge (targetSdk 36): `references/safe-area-handling.md`, `references/android-edge-to-edge.md`, `references/safe-area-css-patterns.md`.
- Firebase Auth (optional account, L2): register the Play signing SHA-1/SHA-256 in Firebase; web OAuth redirects do not work inside the app.

## 2. Release mechanics (both paths)

- `references/android-submission.md`: upload key (keep outside the repo; never commit keystores or passwords; add `*.jks`, `*.keystore`, `keystore.properties` to `.gitignore`), AAB, Play App Signing, tracks, 16 KB page size.
- `versionCode` strictly increases per upload; `versionName` follows `package.json` `version`.
- Personal developer accounts created after 13 Nov 2023: closed test with ≥ 12 opted-in testers for 14 consecutive days before production. Plan this first; it is the longest step.
- Play Console App content: privacy policy URL (the app has `PrivacyPage`; it must also be reachable on the web without login), Data safety (IndexedDB is on-device only; declare Firebase Auth/Firestore data if the account feature is enabled in the build), content rating, target audience, ads = none, app access, account-deletion URL if accounts exist.
- Listing assets: `references/assets-and-metadata.md` (512x512 icon, 1024x500 feature graphic, 2–8 phone screenshots; capture with Playwright/emulator using fictional data). Write Thai and English listings.

## 3. Verify before upload

1. `npm run verify` and the E2E suite pass for the web build that ships.
2. Release-signed build installed on a real device (internal testing track): run every row of `docs/release/android-checklist.md` in the app, plus: cold start offline, back button exits from Home, no URL bar (TWA), status/nav bars do not cover content.
3. Play pre-launch report: no crashes or accessibility blockers.
4. Record device, Android, WebView/Chrome version and results in `docs/release/android-checklist.md` in the existing format.

Re-verify Play deadlines and policies at developer.android.com/google/play/requirements/target-sdk when close to a release; the dates in the references were current in October 2026.
