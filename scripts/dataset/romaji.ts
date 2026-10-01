/**
 * Kana -> romaji (modified Hepburn, no macrons: long vowels are written out, e.g. ショウ -> shou).
 * Returns null for anything it cannot convert with certainty; callers must report, not guess.
 * KANJIDIC2 notation markers ('.' okurigana boundary, '-' prefix/suffix) are ignored for romaji.
 */

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
};

const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

function katakanaToHiragana(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : ch;
    })
    .join('');
}

export function kanaToRomaji(input: string): string | null {
  const kana = katakanaToHiragana(input.replace(/[.\-]/g, ''));
  if (kana.length === 0) return null;
  const chars = [...kana];
  let out = '';
  let doubleNext = false;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] as string;
    if (ch === 'っ') {
      if (i === chars.length - 1) return null;
      doubleNext = true;
      continue;
    }
    const base = BASE[ch];
    if (base === undefined) return null;

    let syllable = base;
    const next = chars[i + 1];
    const smallVowel = next === undefined ? undefined : SMALL_Y[next];
    if (smallVowel !== undefined) {
      if (!base.endsWith('i') || base.length < 2) return null;
      const stem = base.slice(0, -1);
      syllable = ['sh', 'ch', 'j'].includes(stem) ? stem + smallVowel : `${stem}y${smallVowel}`;
      i += 1;
    }

    if (doubleNext) {
      // Hepburn: っち -> tchi, otherwise double the consonant
      syllable = syllable.startsWith('ch') ? `t${syllable}` : `${syllable[0] as string}${syllable}`;
      doubleNext = false;
    }
    // ん before a vowel or y gets an apostrophe so it is not read as a na/ni/... syllable
    if (out.endsWith('n') && base !== 'n' && (VOWELS.has(syllable[0] as string) || syllable[0] === 'y') && chars[i - 1] === 'ん') {
      out += "'";
    }
    out += syllable;
  }
  return out;
}
