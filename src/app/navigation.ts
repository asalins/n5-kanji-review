import { useCallback, useEffect, useRef, useState } from 'react';

export type Screen = 'home' | 'review' | 'practice' | 'search' | 'settings' | 'about';
type ChildScreen = Exclude<Screen, 'home'>;

const CHILD_SCREENS: readonly ChildScreen[] = ['review', 'practice', 'search', 'settings', 'about'];

/** Our marker in history.state; anything else (including null) means "home". */
function childIn(state: unknown): ChildScreen | null {
  if (typeof state !== 'object' || state === null || !('n5Screen' in state)) return null;
  const value = (state as { n5Screen: unknown }).n5Screen;
  return CHILD_SCREENS.find((screen) => screen === value) ?? null;
}

/**
 * Simple Home boundary (approved Phase 12 model, no router):
 *  - Home -> any screen: ONE history entry (pushState). Screen -> screen: replaceState (still one entry).
 *  - System / browser Back (popstate): back to Home. Back on Home: the system leaves the app as usual.
 *  - The app adds at most one history entry, so repeated visits never pile up history.
 */
export function useScreenNavigation() {
  const [screen, setScreen] = useState<Screen>('home');
  const current = useRef<Screen>('home');
  current.current = screen;

  useEffect(() => {
    // The app always starts on Home; a marker left by a previous load (reload / update) is stale.
    if (childIn(window.history.state) !== null) window.history.replaceState(null, '');
    const onPopState = (event: PopStateEvent) => setScreen(childIn(event.state) ?? 'home');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const open = useCallback((next: ChildScreen) => {
    if (current.current === 'home') window.history.pushState({ n5Screen: next }, '');
    else window.history.replaceState({ n5Screen: next }, '');
    setScreen(next);
  }, []);

  const goHome = useCallback(() => {
    if (childIn(window.history.state) !== null) {
      window.history.back(); // popstate brings the app to Home
    } else {
      window.history.replaceState(null, '');
      setScreen('home');
    }
  }, []);

  return { screen, open, goHome };
}
