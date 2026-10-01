# Data sources, licences and attribution

Status: verified against the EDRDG licence page on 2026-10-01. This is engineering documentation, not legal advice.

## KANJIDIC2
- **Source:** Electronic Dictionary Research and Development Group (EDRDG)
- **Official licence URL:** https://www.edrdg.org/edrdg/license.html (General Dictionary Licence Statement)
- **Project page named by that licence:** https://www.edrdg.org/wiki/index.php/KANJIDIC_Project (the EDRDG wiki is now closed; an archive.org copy is linked from the EDRDG site)
- **Download location:** NOT confirmed from EDRDG documentation in this session. Third-party tools use `https://www.edrdg.org/kanjidic/kanjidic2.xml.gz`; check it manually before relying on it.
- **Licence:** Creative Commons Attribution-ShareAlike **4.0** (the official page now says V4.0; some mirrors still say V3.0)
- **Can redistribute:** yes, under the licence
- **Can modify/transform:** yes; the licence covers "data files which are derived from" the dictionary files
- **Can bundle normalized data in this project:** yes, if the conditions below are met
- **Required attribution:** for an app, acknowledge the source in the docs and in the app on a separate screen reachable from a menu ("About"/"Sources"; a launch-page mention is not enough), and link to the licence and the EDRDG site. Do not claim copyright over the material.
- **Restrictions:**
  - ShareAlike: derived data files (`data/kanji/n5.json`) must be distributed under the same or a compatible licence. Application code does not have to be open source.
  - The app must have a procedure for regular updates from the latest dictionary versions; stale data violates the licence.
  - SKIP codes, Pinyin, Four Corner, Morohashi, De Roo, Korean readings and Spahn/Hadamitzky descriptors have separate rights: this project does not import them.
  - Commercial use is allowed.

## JMdict
- **Source / licence:** same EDRDG licence statement as above (Japanese and English components only; other-language glosses have separate copyright)
- **Status in this project:** NOT used in Phase 3 (vocabulary and example sentences are out of this phase's scope). Nothing from JMdict is bundled. The same conditions apply if it is added later.

## Project N5 Kanji List
- **Name:** Project N5 Kanji List (`data/lists/n5-list.json`, version 1.0.0, 196 kanji, order 1-196 preserved)
- **Source:** provided by the Project Owner (`sourceType: project-owner-provided`). Status: source received (previously `N5 LIST SOURCE REQUIRED`).

This project uses a project-defined N5 Kanji curriculum containing 196 Kanji.
The list is provided by the Project Owner and is the source of truth for this application's N5 curriculum.
It is **NOT** claimed to be an official JLPT N5 Kanji list.

- The pipeline filters KANJIDIC2 by this list. KANJIDIC2 never adds, removes, reorders or edits list entries: kanji absent from KANJIDIC2 are reported as missing, kanji outside the list are ignored.
- The KANJIDIC2 `jlpt` field is ignored (reference only, and it uses the old 4-level scheme).
- The list has no external licence or URL (none is recorded rather than invented).

## Dataset field notes
- **strokeCount:** The primary/default stroke count from KANJIDIC2 is used. Alternative stroke counts reported by KANJIDIC2 are not represented in the current Kanji entity model. (Affected in the Project N5 list: 週 11/10, 近 7/6, 遠 13/12, 送 9/8, 道 12/11; the first value is stored. The same text is written to `data/kanji/n5.report.json` under `documentation.strokeCount`.)

## Thai meanings
- Authored and reviewed separately in `data/kanji/n5.th.json` (not generated from a source). Each entry has `reviewed` and `ambiguous` flags. Copyright of the Thai text belongs to this project's authors. If the Thai text is adapted from the English glosses, treat it as ShareAlike material as well.
