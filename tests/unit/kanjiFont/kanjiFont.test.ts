import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KANJI_FONT,
  KANJI_FONTS,
  KANJI_FONT_STORAGE_KEY,
  applyKanjiFont,
  readKanjiFont,
  saveKanjiFont,
  type FontPreferenceStore,
} from '../../../src/services/display/kanjiFont';

const memory = (initial: Record<string, string> = {}): FontPreferenceStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const failing: FontPreferenceStore = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('kanji font preference (per browser, never throws)', () => {
  it('defaults to Klee One, and an unknown or missing value falls back to it', () => {
    expect(DEFAULT_KANJI_FONT).toBe('klee-one');
    expect(readKanjiFont(memory())).toBe('klee-one');
    expect(readKanjiFont(memory({ [KANJI_FONT_STORAGE_KEY]: 'comic-sans' }))).toBe('klee-one');
    expect(readKanjiFont(null)).toBe('klee-one');
    expect(readKanjiFont(failing)).toBe('klee-one');
  });

  it('remembers every offered font', () => {
    for (const font of KANJI_FONTS) {
      const store = memory();
      expect(saveKanjiFont(font.id, store)).toBe(true);
      expect(readKanjiFont(store)).toBe(font.id);
    }
  });

  it('reports when the browser cannot store the choice', () => {
    expect(saveKanjiFont('yuji-syuku', failing)).toBe(false);
    expect(saveKanjiFont('yuji-syuku', null)).toBe(false);
  });

  it('applies the chosen family through the --kanji-font CSS variable', () => {
    const root = document.createElement('div');
    applyKanjiFont('noto-serif-jp', root);
    expect(root.style.getPropertyValue('--kanji-font')).toBe("'N5 Noto Serif JP'");
    expect(root.getAttribute('data-kanji-font')).toBe('noto-serif-jp');
    applyKanjiFont('system', root);
    expect(root.getAttribute('data-kanji-font')).toBe('system');
  });

  it('every bundled font has a @font-face, a file and a licence text', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const licences: Record<string, string> = {
      'klee-one': 'KleeOne-OFL.txt',
      'noto-sans-jp': 'NotoSansJP-OFL.txt',
      'noto-serif-jp': 'NotoSerifJP-OFL.txt',
      'yuji-syuku': 'YujiSyuku-OFL.txt',
      'kosugi-maru': 'KosugiMaru-Apache-2.0.txt',
    };
    for (const font of KANJI_FONTS.filter((f) => f.id !== 'system')) {
      const file = `src/assets/fonts/${font.id}-n5.woff2`;
      expect(existsSync(file) && statSync(file).size > 10_000).toBe(true);
      expect(css).toContain(`font-family: ${font.family}; src: url('./assets/fonts/${font.id}-n5.woff2')`);
      expect(existsSync(`public/licenses/fonts/${licences[font.id]}`)).toBe(true);
    }
    expect(css).toMatch(/--kanji-font: 'N5 Klee One';/);
  });
});
