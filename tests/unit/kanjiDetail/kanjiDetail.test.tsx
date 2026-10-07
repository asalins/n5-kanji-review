import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { KanjiDetail, KanjiDetailView } from '../../../src/features/kanjiDetail/KanjiDetail';
import { buildKanjiDetail } from '../../../src/features/kanjiDetail/useKanjiDetail';
import { RepositoriesProvider } from '../../../src/hooks/useRepositories';
import type { Repositories } from '../../../src/repositories/indexeddb';
import { RepositoryError } from '../../../src/utils/errors';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { openRealRepositories } from '../../helpers/realData';
import { NOON, storedCard } from '../../helpers/sessionFixtures';
import { approvedThai } from '../../helpers/thaiState';

const WATER = makeKanjiId('水');
const dataset = JSON.parse(readFileSync('data/kanji/n5.json', 'utf8')) as { kanji: { id: string; strokeCount: number | null; frequency: number | null }[] };
const waterFacts = dataset.kanji.find((k) => k.id === WATER)!;

describe('buildKanjiDetail (pure): Due only through isDueCard', () => {
  const kanji = { id: WATER, character: '水', level: 'N5' as const, strokeCount: 4, frequency: 223, meanings: { en: ['water'], th: [] } };
  const at = (mode: 'A' | 'B' | 'C' | 'D') => (cards: ReturnType<typeof buildKanjiDetail>) => cards.modes.find((m) => m.mode === mode)!;

  it('studied card with due <= now is due (exactly now included); future is not due and shows its next review', () => {
    const detail = buildKanjiDetail(
      kanji,
      [],
      [
        storedCard('水', 'A', { state: 'REVIEW', due: NOON - 1, reviewCount: 2 }),
        storedCard('水', 'B', { state: 'LEARNING', due: NOON, reviewCount: 1 }),
        storedCard('水', 'C', { state: 'REVIEW', due: NOON + 86_400_000, reviewCount: 1 }),
        null,
      ],
      NOON,
    );
    expect(at('A')(detail)).toMatchObject({ state: 'REVIEW', due: true });
    expect(at('B')(detail)).toMatchObject({ state: 'LEARNING', due: true });
    expect(at('C')(detail)).toMatchObject({ state: 'REVIEW', due: false, nextReview: NOON + 86_400_000 });
    expect(at('D')(detail)).toEqual({ mode: 'D', state: null, due: false, nextReview: null });
  });

  it('a NEW card is never due, even with due <= now, and has no next review', () => {
    const detail = buildKanjiDetail(kanji, [], [storedCard('水', 'A', { state: 'NEW', due: NOON - 10 }), null, null, null], NOON);
    expect(at('A')(detail)).toEqual({ mode: 'A', state: 'NEW', due: false, nextReview: null });
    expect(detail.learned).toBe(false);
  });

  it('kanji-level status reuses the Phase 7 semantics (learned = any non-NEW card; mastered = all four MASTERED)', () => {
    const mastered = buildKanjiDetail(kanji, [], (['A', 'B', 'C', 'D'] as const).map((m) => storedCard('水', m, { state: 'MASTERED', due: NOON + 1, reviewCount: 9 })), NOON);
    expect([mastered.learned, mastered.mastered]).toEqual([true, true]);
    const three = buildKanjiDetail(kanji, [], [...(['A', 'B', 'C'] as const).map((m) => storedCard('水', m, { state: 'MASTERED', reviewCount: 9 })), null], NOON);
    expect([three.learned, three.mastered]).toEqual([true, false]);
  });

  it('the view shows "due now", the formatted next review, and "not started"', () => {
    const detail = buildKanjiDetail(
      kanji,
      [],
      [storedCard('水', 'A', { state: 'REVIEW', due: NOON - 1, reviewCount: 1 }), storedCard('水', 'B', { state: 'REVIEW', due: NOON + 5, reviewCount: 1 }), null, null],
      NOON,
    );
    render(<KanjiDetailView detail={detail} format={(ms) => `T${ms}`} />);
    expect(screen.getByTestId('detail-mode-A').textContent).toMatch(/Due now/);
    expect(screen.getByTestId('detail-mode-B').textContent).toContain(`T${NOON + 5}`);
    expect(screen.getByTestId('detail-mode-C').textContent).toMatch(/Not started/);
  });
});

let repos: Repositories;
let dispose: () => Promise<void>;
beforeEach(async () => {
  const opened = await openRealRepositories();
  repos = opened.repos;
  dispose = opened.dispose;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await dispose();
});

const show = (kanjiId = WATER, kanji = repos.kanji) =>
  render(
    <RepositoriesProvider value={{ kanji, review: repos.review }}>
      <KanjiDetail kanjiId={kanjiId} onBack={() => undefined} now={() => NOON} />
    </RepositoriesProvider>,
  );

describe('Kanji detail on the real dataset (水)', () => {
  it('shows loading first, then meanings TH/EN, readings with romaji, strokes and frequency', async () => {
    show();
    expect(screen.getByText(/Loading/)).toBeTruthy();
    await screen.findByTestId('detail-strokes');
    const text = document.body.textContent ?? '';
    for (const meaning of approvedThai('水')) expect(text).toContain(meaning);
    expect(text).toContain('water');
    expect(text).toContain('スイ');
    expect(text).toContain('sui');
    expect(text).toContain('みず');
    expect(text).toContain('mizu');
    expect(screen.getByTestId('detail-strokes').textContent).toBe(String(waterFacts.strokeCount ?? '—'));
    expect(screen.getByTestId('detail-frequency').textContent).toBe(String(waterFacts.frequency ?? '—'));
  });

  it('no cards yet: kanji not started and all four modes not started', async () => {
    show();
    expect((await screen.findByTestId('detail-kanji-status')).textContent).toMatch(/Not started/);
    for (const mode of ['A', 'B', 'C', 'D']) expect(screen.getByTestId(`detail-mode-${mode}`).textContent).toMatch(/Not started/);
  });

  it('reflects stored cards: A due, B scheduled, C NEW (never due)', async () => {
    await repos.review.saveCard(storedCard('水', 'A', { state: 'REVIEW', due: NOON - 1, reviewCount: 2 }));
    await repos.review.saveCard(storedCard('水', 'B', { state: 'REVIEW', due: NOON + 86_400_000, reviewCount: 1 }));
    await repos.review.saveCard(storedCard('水', 'C', { state: 'NEW', due: NOON - 1 }));
    show();
    expect((await screen.findByTestId('detail-kanji-status')).textContent).toMatch(/Learned/);
    expect(screen.getByTestId('detail-mode-A').textContent).toMatch(/Due now/);
    expect(screen.getByTestId('detail-mode-B').textContent).toMatch(/Next review/);
    expect(screen.getByTestId('detail-mode-C').textContent).not.toMatch(/Due now/);
  });

  it('is strictly read-only: no write of any kind while loading and showing', async () => {
    const writes = [
      vi.spyOn(repos.review, 'saveCard'),
      vi.spyOn(repos.review, 'recordReview'),
      vi.spyOn(repos.review, 'appendLog'),
      vi.spyOn(repos.review, 'saveSession'),
      vi.spyOn(repos.settings, 'save'),
      vi.spyOn(repos.backup, 'replaceUserData'),
      vi.spyOn(repos.backup, 'resetProgress'),
    ];
    show();
    await screen.findByTestId('detail-strokes');
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it('a kanji that is not in the dataset shows "not found"', async () => {
    show(makeKanjiId('龍'));
    expect(await screen.findByText(/not in the dataset/)).toBeTruthy();
  });

  it('a read error shows an error with retry (not an empty page), and retry loads it', async () => {
    const getById = vi.spyOn(repos.kanji, 'getById').mockRejectedValueOnce(new RepositoryError('boom'));
    show();
    const alert = await screen.findByText(/Could not load this kanji/);
    fireEvent.click(within(alert.closest('div')!.parentElement!).getByRole('button', { name: /Retry/ }));
    expect(await screen.findByTestId('detail-strokes')).toBeTruthy();
    expect(getById).toHaveBeenCalledTimes(2);
  });
});
