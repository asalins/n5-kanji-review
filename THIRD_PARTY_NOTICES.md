# Third-party notices

## Fonts (bundled in `src/assets/fonts`, subset to the 196 kanji of the Project N5 list plus hiragana/katakana)

| Font | Copyright | Licence | Licence text |
|---|---|---|---|
| Klee One | Copyright 2020 The Klee Project Authors (https://github.com/fontworks-fonts/Klee) | SIL Open Font License 1.1 | `public/licenses/fonts/KleeOne-OFL.txt` |
| Noto Sans JP | Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' | SIL Open Font License 1.1 | `public/licenses/fonts/NotoSansJP-OFL.txt` |
| Noto Serif JP | Copyright 2012 Google Inc. | SIL Open Font License 1.1 | `public/licenses/fonts/NotoSerifJP-OFL.txt` |
| Yuji Syuku | Copyright 2021 The Yuji Project Authors (https://github.com/Kinutafontfactory/Yuji) | SIL Open Font License 1.1 | `public/licenses/fonts/YujiSyuku-OFL.txt` |
| Kosugi Maru | Copyright 2010 The Kosugi Maru Project Authors (https://github.com/googlefonts/kosugi-maru) | Apache License 2.0 | `public/licenses/fonts/KosugiMaru-Apache-2.0.txt` |

Source files: the `google/fonts` repository (`ofl/kleeone`, `ofl/notosansjp`, `ofl/notoserifjp`, `ofl/yujisyuku`, `apache/kosugimaru`).
Modification: subset with fontTools `pyftsubset` to the characters the app displays, converted to WOFF2; the variable Noto fonts were instanced at weight 400. The fonts are used under their original names in CSS with an `N5 ` prefix (no Reserved Font Name is used). They are not sold separately.
