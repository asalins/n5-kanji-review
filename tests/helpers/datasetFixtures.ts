import type { KanjiDatasetFile, ThaiDatasetFile } from '../../src/services/content/datasetFiles';
import type { LevelList } from '../../scripts/dataset/schemas';

/** SYNTHETIC test data only (水 火 山). Not the production dataset. */
export const SYNTHETIC_SOURCE = {
  name: 'Synthetic test source',
  version: null,
  date: null,
  officialUrl: 'https://example.com/synthetic',
  license: 'test only',
} as const;

export const syntheticKanjidicXml = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2>
<header><file_version>4</file_version><database_version>TEST-1</database_version><date_of_creation>2000-01-01</date_of_creation></header>
<character><literal>水</literal><misc><stroke_count>4</stroke_count><freq>300</freq><jlpt>4</jlpt></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">スイ</reading><reading r_type="ja_kun">みず</reading><reading r_type="ja_kun">みず-</reading><meaning>water</meaning><meaning m_lang="fr">eau</meaning></rmgroup></reading_meaning></character>
<character><literal>火</literal><misc><stroke_count>4</stroke_count><stroke_count>5</stroke_count></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">カ</reading><reading r_type="ja_kun">ひ</reading><meaning>fire</meaning></rmgroup></reading_meaning></character>
<character><literal>山</literal><misc><stroke_count>3</stroke_count></misc>
<reading_meaning><rmgroup><reading r_type="ja_on">サン</reading><reading r_type="ja_kun">やま</reading><meaning>mountain</meaning></rmgroup></reading_meaning></character>
<character><literal>口</literal><misc><stroke_count>3</stroke_count></misc>
<reading_meaning><rmgroup><meaning>mouth</meaning></rmgroup></reading_meaning></character>
<character><literal>目</literal><reading_meaning><rmgroup><reading r_type="ja_on">モク</reading><meaning>eye</meaning></rmgroup></reading_meaning></character>
</kanjidic2>`;

export function makeList(kanji: string[], overrides: Partial<LevelList> = {}): LevelList {
  return { version: '0.0.1-test', level: 'N5', name: 'Synthetic list', sourceType: 'test', sources: [SYNTHETIC_SOURCE], kanji, ...overrides };
}

export function makeDataset(version: string, chars: Array<[string, string, string]>): KanjiDatasetFile {
  // chars: [character, codepoint-hex, english meaning]
  return {
    datasetVersion: version,
    generatedAt: '2026-10-01T00:00:00.000Z',
    level: 'N5',
    sources: [SYNTHETIC_SOURCE],
    kanji: chars.map(([character, hex, en]) => ({
      id: `kanji:U+${hex}`,
      character,
      level: 'N5' as const,
      strokeCount: 4,
      frequency: null,
      meanings: { en: [en] },
    })),
    readings: chars.map(([, hex]) => ({ kanjiId: `kanji:U+${hex}`, type: 'on' as const, kana: 'テスト', romaji: 'tesuto' })),
  };
}

export function makeThai(version: string, ids: string[]): ThaiDatasetFile {
  return {
    datasetVersion: version,
    entries: ids.map((kanjiId) => ({ kanjiId, meaningsTh: ['ทดสอบ'], reviewed: true, ambiguous: false })),
  };
}
