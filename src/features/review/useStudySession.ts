import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { ReviewRating, StudyMode } from '../../types/entities';
import { logError, toUserMessage } from '../../utils/userMessage';
import type { FlashcardPhase } from '../flashcards/Flashcard';
import { isCardPlayable, type KanjiCardData } from '../flashcards/presentation';
import { sessionOnlyOrchestrator, type ReviewOrchestrator } from './reviewBoundary';
import { DEFAULT_SESSION_SIZE, STUDY_LEVEL, selectSessionKanji } from './sessionQueue';

export type SessionStatus = 'loading' | 'ready' | 'empty' | 'error' | 'complete';

export interface SessionState {
  readonly status: SessionStatus;
  readonly cards: readonly KanjiCardData[];
  readonly index: number;
  readonly phase: FlashcardPhase;
  /** Ratings given in this session, kept in memory only. */
  readonly ratings: readonly ReviewRating[];
  readonly emptyReason: 'no-kanji' | 'no-cards-for-mode' | null;
  readonly errorMessage: string | null;
}

export interface StudySessionOptions {
  readonly mode: StudyMode;
  readonly orchestrator?: ReviewOrchestrator;
  readonly size?: number;
  readonly createSeed?: () => number;
  readonly now?: () => number;
}

const LOADING: SessionState = {
  status: 'loading',
  cards: [],
  index: 0,
  phase: 'front',
  ratings: [],
  emptyReason: null,
  errorMessage: null,
};

/** UI-facing orchestration: loads real cards through the repositories and walks through them. */
export function useStudySession({
  mode,
  orchestrator: orchestratorOption,
  size = DEFAULT_SESSION_SIZE,
  createSeed = Date.now,
  now = Date.now,
}: StudySessionOptions) {
  const { kanji: kanjiRepository, reviewOrchestrator } = useRepositories();
  const orchestrator = orchestratorOption ?? reviewOrchestrator ?? sessionOnlyOrchestrator;
  /** True when ratings are really stored (false in practice mode). */
  const savesReviews = orchestrator !== sessionOnlyOrchestrator;
  const [runId, setRunId] = useState(0);
  const [state, setState] = useState<SessionState>(LOADING);
  const stateRef = useRef(state);
  stateRef.current = state;
  const submitting = useRef(false);
  // keep unstable option functions out of the effect dependencies
  const seedRef = useRef(createSeed);
  seedRef.current = createSeed;
  // when the current card appeared; used for ReviewRequest.durationMs
  const shownAtRef = useRef<number | null>(null);
  const nowRef = useRef(now);
  nowRef.current = now;

  useEffect(() => {
    let cancelled = false;
    setState(LOADING);
    const load = async () => {
      try {
        const all = await kanjiRepository.getByLevel(STUDY_LEVEL);
        const picked = selectSessionKanji(all, size, seedRef.current());
        const loaded = await Promise.all(
          picked.map(async (kanji) => ({ kanji, readings: await kanjiRepository.getReadings(kanji.id) })),
        );
        const cards = loaded.filter((card) => isCardPlayable(mode, card));
        if (cancelled) return;
        if (cards.length === 0) {
          setState({ ...LOADING, status: 'empty', emptyReason: all.length === 0 ? 'no-kanji' : 'no-cards-for-mode' });
        } else {
          setState({ ...LOADING, status: 'ready', cards });
        }
      } catch (error) {
        if (cancelled) return;
        logError(error);
        setState({ ...LOADING, status: 'error', errorMessage: toUserMessage(error) });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [kanjiRepository, mode, size, runId]);

  useEffect(() => {
    shownAtRef.current = state.status === 'ready' ? nowRef.current() : null;
  }, [state.status, state.index]);

  const reveal = useCallback(() => {
    setState((s) => (s.status === 'ready' && s.phase === 'front' ? { ...s, phase: 'revealed' } : s));
  }, []);

  const rate = useCallback(
    async (rating: ReviewRating) => {
      const current = stateRef.current;
      const card = current.cards[current.index];
      if (current.status !== 'ready' || current.phase !== 'revealed' || card === undefined || submitting.current) return;
      submitting.current = true;
      try {
        const answeredAt = now();
        const shownAt = shownAtRef.current ?? answeredAt;
        await orchestrator.submit({
          item: { itemType: 'kanji', itemId: card.kanji.id },
          mode,
          rating,
          answeredAt,
          durationMs: Math.max(0, Math.round(answeredAt - shownAt)),
        });
        setState((s) => {
          const nextIndex = s.index + 1;
          const ratings = [...s.ratings, rating];
          return nextIndex >= s.cards.length
            ? { ...s, status: 'complete', index: nextIndex, ratings, phase: 'front' }
            : { ...s, index: nextIndex, ratings, phase: 'front' };
        });
      } catch (error) {
        logError(error);
        setState((s) => ({ ...s, status: 'error', errorMessage: toUserMessage(error) }));
      } finally {
        submitting.current = false;
      }
    },
    [orchestrator, mode, now],
  );

  const restart = useCallback(() => setRunId((id) => id + 1), []);

  return { state, reveal, rate, restart, savesReviews };
}
