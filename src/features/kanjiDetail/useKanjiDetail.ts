import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import { isLearnedKanji, isMasteredKanji } from '../../services/kanjiSearch/kanjiReviewStates';
import { STUDY_MODES, type LearningState, type StudyMode } from '../../types/common';
import type { Kanji, KanjiReading, ReviewCard } from '../../types/entities';
import { isDueCard } from '../../utils/dueCard';
import { buildReviewCardId } from '../../utils/reviewCardId';
import { logError } from '../../utils/userMessage';

export interface ModeStatus {
  readonly mode: StudyMode;
  /** null = no card yet for this mode (never studied). */
  readonly state: LearningState | null;
  /** Through isDueCard only (single Due definition): a NEW card is never due. */
  readonly due: boolean;
  /** Next review instant for studied cards; null for new / never-studied cards. */
  readonly nextReview: number | null;
}

export interface KanjiDetailData {
  readonly kanji: Kanji;
  readonly readings: readonly KanjiReading[];
  readonly learned: boolean;
  readonly mastered: boolean;
  readonly modes: readonly ModeStatus[];
}

/** Pure: shapes what the screen shows. Reuses the Phase 7/8 kanji-level semantics and isDueCard. */
export function buildKanjiDetail(
  kanji: Kanji,
  readings: readonly KanjiReading[],
  cards: readonly (ReviewCard | null)[],
  nowMs: number,
): KanjiDetailData {
  const present = cards.filter((card): card is ReviewCard => card !== null);
  const modes = STUDY_MODES.map((mode): ModeStatus => {
    const card = present.find((c) => c.mode === mode) ?? null;
    if (card === null) return { mode, state: null, due: false, nextReview: null };
    return { mode, state: card.state, due: isDueCard(card, nowMs), nextReview: card.state === 'NEW' ? null : card.due };
  });
  return { kanji, readings, learned: isLearnedKanji(present), mastered: isMasteredKanji(present), modes };
}

export type KanjiDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'not-found' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly detail: KanjiDetailData };

/**
 * Read-only: one kanji, its readings and its four review cards (ids are fixed, so six reads in total).
 * Never writes. "Now" is read on open and when the page becomes visible again (like Search, Phase 8).
 */
export function useKanjiDetail(kanjiId: string, { now = Date.now }: { now?: () => number } = {}) {
  const { kanji: kanjiRepository, review } = useRepositories();
  const [state, setState] = useState<KanjiDetailState>({ status: 'loading' });
  const [loaded, setLoaded] = useState<{ kanji: Kanji; readings: readonly KanjiReading[]; cards: readonly (ReviewCard | null)[] } | null>(null);
  const [nowMs, setNowMs] = useState(() => now());
  const token = useRef(0);

  const load = useCallback(async () => {
    const mine = (token.current += 1);
    setState({ status: 'loading' });
    try {
      const kanji = await kanjiRepository.getById(kanjiId);
      if (mine !== token.current) return;
      if (kanji === null) {
        setState({ status: 'not-found' });
        return;
      }
      const [readings, ...cards] = await Promise.all([
        kanjiRepository.getReadings(kanjiId),
        ...STUDY_MODES.map((mode) => review.getCard(buildReviewCardId('kanji', kanjiId, mode))),
      ]);
      if (mine !== token.current) return;
      setLoaded({ kanji, readings: readings as readonly KanjiReading[], cards: cards as readonly (ReviewCard | null)[] });
      setNowMs(now());
    } catch (error) {
      logError(error);
      if (mine === token.current) setState({ status: 'error' });
    }
  }, [kanjiRepository, review, kanjiId, now]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNowMs(now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [now]);

  useEffect(() => {
    if (loaded !== null) setState({ status: 'ready', detail: buildKanjiDetail(loaded.kanji, loaded.readings, loaded.cards, nowMs) });
  }, [loaded, nowMs]);

  return { state, reload: load };
}
