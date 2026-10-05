import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Flashcard } from '../../../src/features/flashcards/Flashcard';
import { buildFront, type KanjiCardData } from '../../../src/features/flashcards/presentation';
import { buildContentBundle } from '../../../src/services/content/buildContentBundle';
import { makeDataset } from '../../helpers/datasetFixtures';

/** Fixture: 水 with one Thai entry; the review flags decide whether Mode B may show it. */
function waterCard(entry: { reviewed: boolean; ambiguous: boolean }): KanjiCardData {
  const dataset = makeDataset('v', [['水', '6C34', 'water']]);
  const { bundle } = buildContentBundle(dataset, {
    datasetVersion: 'v',
    entries: [{ kanjiId: 'kanji:U+6C34', meaningsTh: ['น้ำ'], ...entry }],
  });
  return { kanji: bundle.kanji[0]!, readings: bundle.readings };
}
const modeBText = (card: KanjiCardData) =>
  render(<Flashcard mode="B" data={card} phase="front" onReveal={() => undefined} />).container.textContent ?? '';

describe('Mode B and the Thai review gate (both directions)', () => {
  it('reviewed:true and not ambiguous -> the Thai meaning is the question', () => {
    const card = waterCard({ reviewed: true, ambiguous: false });
    expect(buildFront('B', card)).toMatchObject({ kind: 'meaning', lines: ['น้ำ'] });
    expect(modeBText(card)).toContain('น้ำ');
  });

  it('reviewed:false (a draft) -> Thai is NOT shown; English is used', () => {
    const card = waterCard({ reviewed: false, ambiguous: false });
    expect(buildFront('B', card)).toMatchObject({ kind: 'meaning', lines: ['water'] });
    const text = modeBText(card);
    expect(text).not.toContain('น้ำ');
    expect(text).toContain('water');
  });

  it('reviewed:true but ambiguous -> Thai is NOT shown', () => {
    const card = waterCard({ reviewed: true, ambiguous: true });
    expect(modeBText(card)).not.toContain('น้ำ');
  });
});
