import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { StateFilter } from '../../services/kanjiSearch/kanjiReviewStates';
import { loadSearchCorpus } from '../../services/kanjiSearch/loadSearchCorpus';
import { buildSearchIndex, searchKanji, type SearchableKanji } from '../../services/kanjiSearch/searchKanji';
import { logError } from '../../utils/userMessage';

type LoadState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'READY'; readonly index: readonly SearchableKanji[] }
  | { readonly status: 'ERROR' };

interface Options {
  /** Injected clock (epoch ms). The default is the only place this feature reads the system clock. */
  readonly now?: () => number;
}

/**
 * Loads the corpus once (fixed number of reads), then searches and filters in memory. "Due now" uses a fresh
 * clock reading whenever the page opens, the query or a filter changes, and when the tab becomes visible or
 * focused again, so it does not go stale; there is no polling.
 */
export function useKanjiSearch({ now = Date.now }: Options = {}) {
  const { kanji, review, newItems } = useRepositories();
  const [load, setLoad] = useState<LoadState>({ status: 'LOADING' });
  const [text, setTextState] = useState('');
  const [state, setStateState] = useState<StateFilter>('ALL');
  const [dueOnly, setDueOnlyState] = useState(false);
  const nowRef = useRef(now);
  nowRef.current = now;
  const [nowMs, setNowMs] = useState(() => now());
  const token = useRef(0);

  const refreshNow = useCallback(() => setNowMs(nowRef.current()), []);

  const reload = useCallback(async () => {
    const mine = (token.current += 1);
    setLoad({ status: 'LOADING' });
    try {
      const corpus = await loadSearchCorpus({ kanji, review, newItems });
      if (mine !== token.current) return;
      setLoad({ status: 'READY', index: buildSearchIndex(corpus) });
      refreshNow();
    } catch (error) {
      logError(error);
      if (mine === token.current) setLoad({ status: 'ERROR' });
    }
  }, [kanji, review, newItems, refreshNow]);

  useEffect(() => {
    void reload();
    return () => {
      token.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refreshNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refreshNow);
    };
  }, [refreshNow]);

  const setText = useCallback((value: string) => {
    setTextState(value);
    refreshNow();
  }, [refreshNow]);
  const setState = useCallback((value: StateFilter) => {
    setStateState(value);
    refreshNow();
  }, [refreshNow]);
  const setDueOnly = useCallback((value: boolean) => {
    setDueOnlyState(value);
    refreshNow();
  }, [refreshNow]);

  const hits = useMemo(
    () => (load.status === 'READY' ? searchKanji(load.index, { text, state, dueOnly }, nowMs) : []),
    [load, text, state, dueOnly, nowMs],
  );

  return { status: load.status, hits, text, state, dueOnly, setText, setState, setDueOnly, reload };
}
