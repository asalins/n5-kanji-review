import { useCallback, useEffect, useRef, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { DailyLimits } from '../../services/session/allowance';
import { computeStatistics, type Statistics } from '../../services/statistics/statisticsService';
import { logError } from '../../utils/userMessage';

/** One state at a time. EMPTY means the data loaded fine but there is no review history yet. */
export type StatisticsState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'READY'; readonly statistics: Statistics }
  | { readonly status: 'EMPTY'; readonly statistics: Statistics }
  | { readonly status: 'ERROR' };

interface Options {
  /** Injected clock (epoch ms). The default is the single place this feature reads the system clock. */
  readonly now?: () => number;
  readonly limits?: DailyLimits;
}

/** Loads the dashboard numbers through the statistics service. Never shows partial numbers on failure. */
export function useStatistics({ now = Date.now, limits }: Options = {}) {
  const { review, kanji } = useRepositories();
  const [state, setState] = useState<StatisticsState>({ status: 'LOADING' });
  const token = useRef(0);
  const nowRef = useRef(now);
  nowRef.current = now;

  const load = useCallback(async () => {
    const mine = (token.current += 1);
    setState({ status: 'LOADING' });
    try {
      const statistics = await computeStatistics({ review, kanji, now: nowRef.current, limits });
      if (mine !== token.current) return;
      setState({ status: statistics.hasReviews ? 'READY' : 'EMPTY', statistics });
    } catch (error) {
      logError(error);
      if (mine === token.current) setState({ status: 'ERROR' });
    }
  }, [review, kanji, limits]);

  useEffect(() => {
    void load();
    return () => {
      token.current += 1; // ignore results that arrive after unmount
    };
  }, [load]);

  return { state, reload: load };
}
