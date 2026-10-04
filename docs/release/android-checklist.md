# Android Chrome validation (real device)

Automated E2E runs on a headless Chromium (emulated phone sizes). **It is not a real Android device.** Every item below needs a person with an Android phone. Record PASS / FAIL / NOT TESTED in the "Real Android" column, with device, Android and Chrome versions.

Device: ______  Android: ____  Chrome: ____  App version (commit): ____  Tester: ____  Date: ____

| # | Check | Automated (Chromium) | Real Android |
|---|---|---|---|
| 1 | Install PWA (menu "Install app"), icon "N5" on the home screen | manifest/icons/SW verified | NOT TESTED |
| 2 | Launch from the home screen: standalone, no browser bar | — | NOT TESTED |
| 3 | Portrait, 360 and 412 wide: no horizontal scroll on Home, Review, Search, Settings, About | PASS (320/360/412) | NOT TESTED |
| 4 | Landscape: screens usable, no horizontal scroll | PASS (812x360, 915x412 smoke) | NOT TESTED |
| 5 | Notch / rounded corners / navigation bar: titles and bottom buttons not hidden | not measurable | NOT TESTED |
| 6 | On-screen keyboard: Search input visible while typing, results scroll | not measurable | NOT TESTED |
| 7 | Flashcard: tap to reveal, rating buttons easy to press, session completes | PASS | NOT TESTED |
| 8 | Back gesture/button: from Review/Search/Settings/About returns Home; on Home leaves the app | PASS (browser history) | NOT TESTED |
| 9 | Backup download: file saved, name `n5-kanji-backup-YYYY-MM-DD.json`, can be found in Files | PASS (download event) | NOT TESTED |
| 10 | Backup file picker: choose the file, summary + confirmation shown | PASS (setInputFiles) | NOT TESTED |
| 11 | Import restores progress (Dashboard numbers come back) | PASS | NOT TESTED |
| 12 | Offline: airplane mode, launch from home screen, review/search/settings work | PASS | NOT TESTED |
| 13 | Update: new version installed later shows "A new version is available" on Home only; nothing reloads until "Update"; progress kept | PASS (two builds) | NOT TESTED |
| 14 | Dark mode: system dark and "Dark" setting; system bar colour matches | PASS (class + theme-color) | NOT TESTED |
| 15 | About & Sources readable, links open in the browser | PASS | NOT TESTED |

Result: Real Android = PASS only when every row is PASS (or accepted by the release gate with a note).
