import { useCallback, useEffect, useRef, useState } from 'react';

export type Screen = 'home' | 'review' | 'practice' | 'search' | 'settings' | 'about' | 'detail';
type ChildScreen = Exclude<Screen, 'home' | 'detail'>;

const CHILD_SCREENS: readonly ChildScreen[] = ['review', 'practice', 'search', 'settings', 'about'];
const KANJI_ID = /^kanji:U\+[0-9A-F]{4,6}$/;

interface Location {
  readonly screen: Screen;
  /** Only for the detail screen. */
  readonly kanjiId: string | null;
}

const HOME: Location = { screen: 'home', kanjiId: null };

/** Our marker in history.state; anything else (including null) means "home". */
function locationIn(state: unknown): Location | null {
  if (typeof state !== 'object' || state === null || !('n5Screen' in state)) return null;
  const { n5Screen, kanjiId } = state as { n5Screen: unknown; kanjiId?: unknown };
  if (n5Screen === 'detail') {
    // A detail marker without a valid kanji id falls back to the search screen it came from.
    return typeof kanjiId === 'string' && KANJI_ID.test(kanjiId) ? { screen: 'detail', kanjiId } : { screen: 'search', kanjiId: null };
  }
  const child = CHILD_SCREENS.find((screen) => screen === n5Screen);
  return child === undefined ? null : { screen: child, kanjiId: null };
}

/**
 * Simple Home boundary (approved Phase 12 model, no router), extended in Phase 13:
 *  - Home -> any screen: ONE history entry (pushState). Screen -> screen: replaceState (still one entry).
 *  - Search -> Kanji detail: a SECOND entry (pushState); Back from the detail returns to Search with its
 *    query, filters and results intact. So the app adds at most two entries, and every Back removes one.
 *  - System / browser Back (popstate) follows those entries. Back on Home leaves the app as usual.
 *  - Reload: the app always starts on Home; the marker on the current entry is cleared. After a reload on
 *    the detail screen the earlier "search" entry is still in the browser history (accepted Phase 13 edge case).
 */
export function useScreenNavigation() {
  const [location, setLocation] = useState<Location>(HOME);
  const current = useRef<Location>(HOME);
  current.current = location;

  useEffect(() => {
    // The app always starts on Home; a marker left by a previous load (reload / update) is stale.
    if (locationIn(window.history.state) !== null) window.history.replaceState(null, '');
    const onPopState = (event: PopStateEvent) => setLocation(locationIn(event.state) ?? HOME);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const open = useCallback((next: ChildScreen) => {
    if (current.current.screen === 'home') window.history.pushState({ n5Screen: next }, '');
    else window.history.replaceState({ n5Screen: next }, '');
    setLocation({ screen: next, kanjiId: null });
  }, []);

  /** Search -> Kanji detail. Only from the search screen: a second history entry (push). */
  const openDetail = useCallback((kanjiId: string) => {
    if (current.current.screen !== 'search' || !KANJI_ID.test(kanjiId)) return;
    window.history.pushState({ n5Screen: 'detail', kanjiId }, '');
    setLocation({ screen: 'detail', kanjiId });
  }, []);

  /** In-app Back on the detail screen: same as the system Back (returns to Search). */
  const backFromDetail = useCallback(() => {
    if (locationIn(window.history.state)?.screen === 'detail') {
      window.history.back(); // popstate brings the app back to Search
    } else {
      window.history.replaceState({ n5Screen: 'search' }, '');
      setLocation({ screen: 'search', kanjiId: null });
    }
  }, []);

  const goHome = useCallback(() => {
    if (locationIn(window.history.state) !== null) {
      window.history.back(); // popstate brings the app to Home
    } else {
      window.history.replaceState(null, '');
      setLocation(HOME);
    }
  }, []);

  return { screen: location.screen, detailKanjiId: location.kanjiId, open, openDetail, backFromDetail, goHome };
}
