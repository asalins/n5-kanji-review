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

## N5 kanji list (project source of truth)
- **Source: NOT YET APPROVED** -> `N5 LIST SOURCE REQUIRED`
- `data/lists/n5-list.json` is intentionally empty. The KANJIDIC2 `jlpt` field is ignored by the pipeline (it is a reference only and uses the old 4-level scheme).
- To approve a source, record its name, version/date, official URL and licence in the list's `sources` field, then fill `kanji`. The pipeline refuses to build while either is empty.

## Thai meanings
- Authored and reviewed separately in `data/kanji/n5.th.json` (not generated from a source). Each entry has `reviewed` and `ambiguous` flags. Copyright of the Thai text belongs to this project's authors. If the Thai text is adapted from the English glosses, treat it as ShareAlike material as well.
