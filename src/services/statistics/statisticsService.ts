import type { KanjiRepository, ReviewRepository } from '../../repositories/interfaces';
import { LEARNING_STATES, STUDY_MODES, type LearningState } from '../../types/entities';
import { isDueCard } from '../../utils/dueCard';
import { localDay } from '../../utils/localDay';
import { DatasetUnavailableError } from '../session/sessionEngine';
import { DEFAULT_DAILY_NEW_LIMIT, DEFAULT_DAILY_REVIEW_LIMIT } from '../session/config';
import type { DailyLimits } from '../session/allowance';
import { calculateProgressPercentage } from './accuracy';
import { HISTORY_LONG_DAYS, HISTORY_SHORT_DAYS, STATISTICS_LEVEL } from './config';
import { calculateDailyProgress, calculateNewAvailable, type DailyProgress } from './dailyProgress';
import { aggregateReviewsByDay, keyLogs, logsInLastDays, summarizeLogs, type DayStats, type PeriodStats } from './history';
import { calculateLearnedKanji, calculateMasteredKanji, countCardsByState } from './kanjiProgress';
import { calculateStreak, type StreakResult } from './streak';

export interface StatisticsDeps {
  readonly review: ReviewRepository;
  readonly kanji: Pick<KanjiRepository, 'getByLevel'>;
  /** Injected clock (epoch ms). The service never reads the system clock itself. */
  readonly now: () => number;
  readonly limits?: DailyLimits;
}

export interface KanjiProgress {
  /** Kanji in the dataset for the measured level (not a literal). */
  readonly total: number;
  readonly learned: number;
  readonly mastered: number;
  readonly remaining: number;
  readonly learnedPercent: number | null;
  readonly masteredPercent: number | null;
}

export interface Statistics {
  readonly generatedAt: number;
  readonly today: DailyProgress & { readonly date: string; readonly studied: boolean };
  readonly queue: {
    /** Every card currently due (non-NEW and due <= now), not capped by today's review quota. */
    readonly due: number;
    /** min(remaining new quota, cards not yet reviewed). */
    readonly newAvailable: number;
  };
  readonly kanji: KanjiProgress;
  /** Review Cards (not Kanji) per state. */
  readonly cardsByState: Record<LearningState, number>;
  readonly reviewCards: number;
  readonly streak: StreakResult;
  readonly periods: { readonly today: PeriodStats; readonly last7: PeriodStats; readonly last30: PeriodStats; readonly allTime: PeriodStats };
  readonly history: { readonly last7: readonly DayStats[]; readonly last30: readonly DayStats[] };
  /** False until the first successful review exists. */
  readonly hasReviews: boolean;
}

const ALL_TIME: { from: Date; to: Date } = { from: new Date(0), to: new Date(8.64e15) };

/**
 * Reads through the repositories only: one log read (all time), one card read (all states) and one dataset
 * read. "Due" is counted from the cards with the shared isDueCard rule (the review session's rule). No per-kanji queries. Every number is derived from these results.
 */
export async function computeStatistics(deps: StatisticsDeps): Promise<Statistics> {
  const limits = deps.limits ?? { newCards: DEFAULT_DAILY_NEW_LIMIT, reviews: DEFAULT_DAILY_REVIEW_LIMIT };
  const generatedAt = deps.now();
  const todayKey = localDay(generatedAt).key;

  const [logs, cards, datasetKanji] = await Promise.all([
    deps.review.getLogs(ALL_TIME),
    deps.review.getCardsByStates(LEARNING_STATES),
    deps.kanji.getByLevel(STATISTICS_LEVEL),
  ]);

  const keyed = keyLogs(logs);
  const logsToday = logsInLastDays(keyed, todayKey, 1);
  const daily = calculateDailyProgress(logsToday, limits);
  const streak = calculateStreak(new Set(keyed.map((k) => k.dateKey)), todayKey);

  const total = datasetKanji.length;
  // No kanji in the content stores is missing data, not "0 of 0": never present it as progress.
  if (total === 0) throw new DatasetUnavailableError('The kanji dataset is not available in the content stores');
  const learned = calculateLearnedKanji(cards);
  const mastered = calculateMasteredKanji(cards);
  const cardsByState = countCardsByState(cards, LEARNING_STATES);
  const unreviewed = Math.max(0, total * STUDY_MODES.length - (cards.length - cardsByState.NEW));

  return {
    generatedAt,
    today: { ...daily, date: todayKey, studied: streak.studiedToday },
    queue: { due: cards.filter((card) => isDueCard(card, generatedAt)).length, newAvailable: calculateNewAvailable(daily.remainingNewQuota, unreviewed) },
    kanji: {
      total,
      learned,
      mastered,
      remaining: Math.max(0, total - learned),
      learnedPercent: calculateProgressPercentage(learned, total),
      masteredPercent: calculateProgressPercentage(mastered, total),
    },
    cardsByState,
    reviewCards: cards.length,
    streak,
    periods: {
      today: summarizeLogs(logsToday),
      last7: summarizeLogs(logsInLastDays(keyed, todayKey, HISTORY_SHORT_DAYS)),
      last30: summarizeLogs(logsInLastDays(keyed, todayKey, HISTORY_LONG_DAYS)),
      allTime: summarizeLogs(logs),
    },
    history: {
      last7: aggregateReviewsByDay(keyed, todayKey, HISTORY_SHORT_DAYS),
      last30: aggregateReviewsByDay(keyed, todayKey, HISTORY_LONG_DAYS),
    },
    hasReviews: logs.length > 0,
  };
}
