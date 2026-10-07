# Android Chrome validation (real device)

Automated E2E runs on a headless Chromium (emulated phone sizes). **It is not a real Android device.** Every item below needs a person with an Android phone. Record PASS / FAIL / NOT TESTED in the "Real Android" column, with device, Android and Chrome versions.

Template line for a new device test: Device: ______  Android: ____  Chrome: ____  App version (commit): ____  Tester: ____  Date: ____

## Result — release 7f3cf7d (full QA)
Device: not recorded · Android: not recorded · Chrome: not recorded · App version: `7f3cf7d` · URL: `https://n5-kanji-review.pages.dev` · Tester: project owner · Date: after the 2026-10-05 deployment (exact date not recorded). Results are the tester's report.

| # | Check | Automated (Chromium) | Real Android — 7f3cf7d |
|---|---|---|---|
| 1 | Install PWA (menu "Install app"), icon "N5" on the home screen | manifest/icons/SW verified | PASS |
| 2 | Launch from the home screen: standalone, no browser bar | — | PASS |
| 3 | Portrait, 360 and 412 wide: no horizontal scroll on Home, Review, Search, Settings, About | PASS (320/360/412) | PASS |
| 4 | Landscape: screens usable, no horizontal scroll | PASS (812x360, 915x412 smoke) | PASS |
| 5 | Notch / rounded corners / navigation bar: titles and bottom buttons not hidden | not measurable | PASS |
| 6 | On-screen keyboard: Search input visible while typing, results scroll | not measurable | PASS |
| 7 | Flashcard: tap to reveal, rating buttons easy to press, session completes | PASS | PASS |
| 8 | Back gesture/button: from Review/Search/Settings/About returns Home; on Home leaves the app | PASS (browser history) | PASS |
| 9 | Backup download: file saved, name `n5-kanji-backup-YYYY-MM-DD.json`, can be found in Files | PASS (download event) | PASS |
| 10 | Backup file picker: choose the file, summary + confirmation shown | PASS (setInputFiles) | PASS |
| 11 | Import restores progress (Dashboard numbers come back) | PASS | PASS |
| 12 | Offline: airplane mode, launch from home screen, review/search/settings work | PASS | PASS |
| 13 | Update: new version installed later shows "A new version is available" on Home only; nothing reloads until "Update"; progress kept | PASS (two builds) | NOT TESTED (deferred); PASS in update 29d5354 |
| 14 | Dark mode: system dark and "Dark" setting; system bar colour matches | PASS (class + theme-color) | PASS |
| 15 | About & Sources readable, links open in the browser | PASS | PASS |

Result: Real Android = PASS only when every row is PASS (or accepted by the release gate with a note).

Extra checks reported with this QA: Mode D prompt, lower dashboard, manifest (name/icon/standalone), offline, PWA install, IndexedDB (0 → reviews): PASS. UX feedback: the "Choose File" control had no visible border (fixed in 29d5354).

## Result — update 29d5354 (targeted regression)
Installed PWA from production, 2026-10-06. Device / Android / Chrome: not recorded. The update arrived as the prompt on Home; the tester pressed Update. Home values before and after the update were identical (screenshots).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Production URL opens | PASS | screenshot |
| 2 | Home / Dashboard OK | PASS | screenshot |
| 3 | Settings opens | PASS | tester report |
| 4 | Choose File bordered, ≥ 44 px | PASS | tester report |
| 5 | Dark mode: border visible | PASS | tester report |
| 6 | File picker opens | PASS | tester report |
| 7 | Cancel picker, app normal | PASS | tester report |
| 8 | No horizontal overflow | PASS | tester report |
