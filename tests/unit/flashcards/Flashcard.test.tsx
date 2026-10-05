import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Flashcard } from '../../../src/features/flashcards/Flashcard';
import { RatingButtons } from '../../../src/features/flashcards/RatingButtons';
import type { KanjiCardData } from '../../../src/features/flashcards/presentation';
import type { StudyMode } from '../../../src/types/entities';
import { openRealRepositories, realCard } from '../../helpers/realData';
import { approvedThai } from '../../helpers/thaiState';

let cards: Record<string, KanjiCardData>;
let dispose: () => Promise<void>;
beforeAll(async () => {
  const opened = await openRealRepositories();
  dispose = opened.dispose;
  cards = {};
  for (const c of ['一', '水', '学', '何', '薬', '十']) cards[c] = await realCard(opened.repos, c);
});
afterAll(() => dispose());

const show = (mode: StudyMode, data: KanjiCardData, phase: 'front' | 'revealed' = 'front') =>
  render(<Flashcard mode={mode} data={data} phase={phase} onReveal={() => undefined} />);
const text = (c: HTMLElement) => c.textContent ?? '';

describe('card front', () => {
  it('Mode A shows the kanji only', () => {
    const { container } = show('A', cards['水']!);
    expect(text(container)).toContain('水');
    expect(text(container)).not.toContain('スイ');
    expect(text(container)).not.toContain('water');
  });
  it('Mode B shows the meaning (approved Thai first, otherwise English) and not the kanji', () => {
    const { container } = show('B', cards['水']!);
    expect(text(container)).toContain(approvedThai('水')[0] ?? 'water');
    expect(text(container)).not.toContain('水');
  });
  it('Mode C shows the kanji and no reading', () => {
    const { container } = show('C', cards['学']!);
    expect(text(container)).toContain('学');
    expect(text(container)).not.toContain('ガク');
  });
  it('Mode D shows a reading and not the kanji', () => {
    const { container } = show('D', cards['水']!);
    expect(text(container)).toContain('みず');
    expect(text(container)).not.toContain('水');
  });
  it('marks Japanese text with lang="ja"', () => {
    const { container } = show('A', cards['水']!);
    expect(container.querySelector('[lang="ja"]')?.textContent).toBe('水');
  });
});

describe('card back', () => {
  it('shows kanji, meanings and grouped readings for 水', () => {
    const { container } = show('A', cards['水']!, 'revealed');
    const t = text(container);
    expect(t).toContain('水');
    expect(t).toContain('water');
    expect(t).toContain("On'yomi");
    expect(t).toContain('スイ');
    expect(t).toContain("Kun'yomi");
    expect(t).toContain('みず');
    expect(t).toContain('sui');
  });
  it('keeps the original notation of multiple readings (一)', () => {
    const { container } = show('C', cards['一']!, 'revealed');
    for (const kana of ['イチ', 'イツ', 'ひと-', 'ひと.つ']) expect(text(container)).toContain(kana);
  });
  it('renders real examples 学 何 薬 without crashing', () => {
    for (const c of ['学', '何', '薬']) {
      const { container, unmount } = show('A', cards[c]!, 'revealed');
      expect(text(container)).toContain(c);
      unmount();
    }
  });
  it('romaji null: shows ジッ, never null / undefined / N/A / jit', () => {
    const { container } = show('C', cards['十']!, 'revealed');
    const t = text(container);
    expect(t).toContain('ジッ');
    expect(t).toContain('ジュッ');
    for (const bad of ['null', 'undefined', 'N/A', 'unknown', 'jit', 'jut']) expect(t).not.toContain(bad);
  });
  it('missing Thai renders safely: no placeholder, no error, English still shown', () => {
    const { container } = show('A', cards['水']!, 'revealed');
    const t = text(container);
    for (const bad of ['undefined', 'null', '[]', 'No translation']) expect(t).not.toContain(bad);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(t).toContain('water');
  });
  it('shows Thai meanings when they exist, with English as reference', () => {
    const data = { ...cards['水']!, kanji: { ...cards['水']!.kanji, meanings: { en: ['water'], th: ['น้ำ'] } } };
    const { container } = show('A', data, 'revealed');
    expect(text(container)).toContain('น้ำ');
    expect(text(container)).toContain('water');
  });
  it('lists multiple meanings per the presentation policy (at most 3)', () => {
    const data = { ...cards['薬']!, kanji: { ...cards['薬']!.kanji, meanings: { en: ['a', 'b', 'c', 'd'], th: [] } } };
    const { container } = show('A', data, 'revealed');
    expect(text(container)).toContain('a · b · c');
    expect(text(container)).not.toContain('d');
  });
});

describe('rating buttons', () => {
  it('exposes four named buttons that only report the chosen rating', () => {
    const seen: string[] = [];
    render(<RatingButtons onRate={(r) => seen.push(r)} />);
    const group = screen.getByRole('group');
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Againยังจำไม่ได้', 'Hardจำได้ยาก', 'Goodจำได้', 'Easyง่ายมาก']);
    buttons[2]!.click();
    expect(seen).toEqual(['GOOD']);
  });
});
