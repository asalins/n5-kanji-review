import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import { DatasetUnavailableError, planSession, startedSession } from '../../services/session/sessionEngine';
import type { DailyLimits } from '../../services/session/allowance';
import { summarizeSession, toStoredSummary, type CardResult, type SessionSummary } from '../../services/session/summary';
import type { EmptyReason, PlannedCard } from '../../services/session/types';
import type { StudySession } from '../../types/entities';
import { logError } from '../../utils/userMessage';
import type { FlashcardPhase } from '../flashcards/Flashcard';
import { isCardPlayable, type KanjiCardData } from '../flashcards/presentation';
import type { ReviewOrchestrator } from './reviewBoundary';

export type ReviewErrorCode =
  | 'DATA_LOAD_ERROR'
  | 'SESSION_LOAD_ERROR'
  | 'REVIEW_SAVE_ERROR'
  | 'SESSION_STATE_ERROR';

export interface SessionCardView {
  readonly planned: PlannedCard;
  readonly data: KanjiCardData;
}

/** One state at a time: contradictory combinations (loading and complete, error and ready...) cannot be expressed. */
export type ReviewSessionState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'LOADING' }
  | { readonly status: 'READY'; readonly cards: readonly SessionCardView[] }
  | {
      readonly status: 'REVIEWING';
      readonly cards: readonly SessionCardView[];
      readonly index: number;
      readonly phase: FlashcardPhase;
      /** Only reviews that were stored successfully. */
      readonly results: readonly CardResult[];
      /** Set when the last rating could not be stored; the same card stays on screen and can be rated again. */
      readonly saveError: ReviewErrorCode | null;
      readonly saving: boolean;
    }
  | { readonly status: 'COMPLETED'; readonly summary: SessionSummary; readonly sessionSaved: boolean }
  | { readonly status: 'EMPTY'; readonly reason: EmptyReason }
  | { readonly status: 'ERROR'; readonly code: ReviewErrorCode };

interface Options {
  /** Injected clock (epoch ms). The default is the single place the system clock is read. */
  readonly now?: () => number;
  readonly limits?: DailyLimits;
  readonly orchestrator?: ReviewOrchestrator;
}

export function useReviewSession({ now = Date.now, limits, orchestrator: orchestratorOption }: Options = {}) {
  const { kanji, review, newItems, reviewOrchestrator } = useRepositories();
  const orchestrator = orchestratorOption ?? reviewOrchestrator;

  const stateRef = useRef<ReviewSessionState>({ status: 'IDLE' });
  const [state, setStateValue] = useState<ReviewSessionState>(stateRef.current);
  const setState = useCallback((next: ReviewSessionState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const sessionRef = useRef<StudySession | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const loadToken = useRef(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  const load = useCallback(async () => {
    const token = (loadToken.current += 1);
    const stale = () => token !== loadToken.current;
    setState({ status: 'LOADING' });
    if (orchestrator === undefined || newItems === undefined) {
      setState({ status: 'ERROR', code: 'SESSION_STATE_ERROR' });
      return;
    }
    let plan;
    try {
      plan = await planSession({ review, kanji, newItems, now: nowRef.current, limits });
    } catch (error) {
      logError(error);
      if (!stale()) {
        setState({ status: 'ERROR', code: error instanceof DatasetUnavailableError ? 'DATA_LOAD_ERROR' : 'SESSION_LOAD_ERROR' });
      }
      return;
    }
    if (stale()) return;
    if (plan.cards.length === 0) {
      setState({ status: 'EMPTY', reason: plan.emptyReason ?? 'NOTHING_AVAILABLE' });
      return;
    }
    const views: SessionCardView[] = [];
    try {
      for (const planned of plan.cards) {
        const record = await kanji.getById(planned.card.itemId);
        if (record === null) continue;
        const data = { kanji: record, readings: await kanji.getReadings(record.id) };
        if (isCardPlayable(planned.card.mode, data)) views.push({ planned, data });
      }
    } catch (error) {
      logError(error);
      if (!stale()) setState({ status: 'ERROR', code: 'DATA_LOAD_ERROR' });
      return;
    }
    if (stale()) return;
    if (views.length === 0) {
      setState({ status: 'EMPTY', reason: 'NOTHING_AVAILABLE' });
      return;
    }
    sessionRef.current = startedSession(plan, views.map((v) => v.planned.card.id));
    setState({ status: 'READY', cards: views });
  }, [kanji, review, newItems, orchestrator, limits, setState]);

  useEffect(() => {
    void load();
    return () => {
      loadToken.current += 1; // ignore results that arrive after unmount
    };
  }, [load]);

  const reviewingIndex = state.status === 'REVIEWING' ? state.index : -1;
  useEffect(() => {
    shownAtRef.current = reviewingIndex >= 0 ? nowRef.current() : null;
  }, [reviewingIndex]);

  const start = useCallback(async () => {
    const current = stateRef.current;
    const session = sessionRef.current;
    if (current.status !== 'READY' || session === null) return;
    try {
      await review.saveSession(session); // the StudySession record: selected card ids, endedAt null
    } catch (error) {
      logError(error);
      setState({ status: 'ERROR', code: 'SESSION_STATE_ERROR' });
      return;
    }
    setState({ status: 'REVIEWING', cards: current.cards, index: 0, phase: 'front', results: [], saveError: null, saving: false });
  }, [review, setState]);

  const reveal = useCallback(() => {
    const current = stateRef.current;
    if (current.status === 'REVIEWING' && current.phase === 'front') setState({ ...current, phase: 'revealed' });
  }, [setState]);

  const rate = useCallback(
    async (rating: CardResult['rating']) => {
      const current = stateRef.current;
      if (current.status !== 'REVIEWING' || current.phase !== 'revealed' || current.saving || orchestrator === undefined) return;
      const view = current.cards[current.index];
      if (view === undefined) return;
      const answeredAt = nowRef.current();
      const durationMs = Math.max(0, Math.round(answeredAt - (shownAtRef.current ?? answeredAt)));
      setState({ ...current, saving: true, saveError: null });
      try {
        // All scheduling happens behind this call: SRS, then one atomic card + log write.
        await orchestrator.submit({
          item: { itemType: view.planned.card.itemType, itemId: view.planned.card.itemId },
          mode: view.planned.card.mode,
          rating,
          answeredAt,
          durationMs,
        });
      } catch (error) {
        logError(error);
        // Not stored: the card stays, nothing is counted, and the user can rate again (the first attempt rolled back).
        setState({ ...current, saving: false, saveError: 'REVIEW_SAVE_ERROR' });
        return;
      }
      const results = [...current.results, { rating, durationMs }];
      if (current.index + 1 < current.cards.length) {
        setState({ ...current, index: current.index + 1, phase: 'front', results, saveError: null, saving: false });
        return;
      }
      const summary = summarizeSession(current.cards.length, results);
      let sessionSaved = true;
      const session = sessionRef.current;
      if (session !== null) {
        try {
          await review.saveSession({ ...session, endedAt: nowRef.current(), summary: toStoredSummary(summary) });
        } catch (error) {
          logError(error);
          sessionSaved = false; // every review is already stored; only the session record is missing
        }
      }
      setState({ status: 'COMPLETED', summary, sessionSaved });
    },
    [orchestrator, review, setState],
  );

  return { state, start, reveal, rate, restart: load };
}
