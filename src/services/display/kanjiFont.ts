/**
 * Kanji display font (a per-device display preference, like the font picker of the project's kana quiz).
 * Stored in this browser only (localStorage), not in the learning database and not in backups.
 * The fonts are bundled subsets (src/assets/fonts), so they work offline. Never throws.
 */
export const KANJI_FONTS = [
  { id: 'klee-one', label: 'Klee One', note: 'ลายมือดินสอ · Handwritten', family: "'N5 Klee One'" },
  { id: 'noto-sans-jp', label: 'Noto Sans JP', note: 'ตัวพิมพ์มาตรฐาน · Sans', family: "'N5 Noto Sans JP'" },
  { id: 'noto-serif-jp', label: 'Noto Serif JP', note: 'ตัวมีเชิง · Serif', family: "'N5 Noto Serif JP'" },
  { id: 'yuji-syuku', label: 'Yuji Syuku', note: 'พู่กัน · Brush', family: "'N5 Yuji Syuku'" },
  { id: 'kosugi-maru', label: 'Kosugi Maru', note: 'ตัวกลมมน · Rounded', family: "'N5 Kosugi Maru'" },
  { id: 'system', label: 'ฟอนต์ของระบบ · System', note: 'แบบเดิม · Device font', family: "'Hiragino Sans'" },
] as const;

export type KanjiFontId = (typeof KANJI_FONTS)[number]['id'];
export const DEFAULT_KANJI_FONT: KanjiFontId = 'klee-one';
export const KANJI_FONT_STORAGE_KEY = 'n5-kanji-review.kanjiFont';

/** The part of `localStorage` used here (injectable for tests). */
export interface FontPreferenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** This browser's localStorage, or null when it is missing or blocked (e.g. some private modes). */
function browserStore(): FontPreferenceStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function isKanjiFontId(value: unknown): value is KanjiFontId {
  return KANJI_FONTS.some((font) => font.id === value);
}

export function readKanjiFont(store: FontPreferenceStore | null = browserStore()): KanjiFontId {
  try {
    const value = store?.getItem(KANJI_FONT_STORAGE_KEY);
    return isKanjiFontId(value) ? value : DEFAULT_KANJI_FONT;
  } catch {
    return DEFAULT_KANJI_FONT;
  }
}

/** Returns false when the choice could not be stored (it still applies until the page reloads). */
export function saveKanjiFont(id: KanjiFontId, store: FontPreferenceStore | null = browserStore()): boolean {
  try {
    if (store === null) return false;
    store.setItem(KANJI_FONT_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

/** Sets the CSS variable used by `.font-jp` (src/index.css). */
export function applyKanjiFont(id: KanjiFontId, root: HTMLElement | undefined = typeof document === 'undefined' ? undefined : document.documentElement): void {
  const font = KANJI_FONTS.find((f) => f.id === id) ?? KANJI_FONTS[0];
  root?.style.setProperty('--kanji-font', font.family);
  root?.setAttribute('data-kanji-font', font.id);
}
