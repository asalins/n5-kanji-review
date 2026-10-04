import type { Theme } from '../types/entities';

const DARK_CLASS = 'dark';
/** Browser/system bar colours: the page background of each theme (stone-50 / neutral-900). */
export const THEME_COLOR = { light: '#fafaf9', dark: '#171717' } as const;

function show(dark: boolean): void {
  document.documentElement.classList.toggle(DARK_CLASS, dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

/**
 * Applies the Light / Dark / System preference to <html> and to the theme-color meta (system bars).
 * App passes the saved UserSettings.theme ('system' during start-up). Returns a cleanup function.
 */
export function applyThemePreference(theme: Theme): () => void {
  if (theme !== 'system') {
    show(theme === 'dark');
    return () => undefined;
  }
  if (typeof window.matchMedia !== 'function') {
    show(false);
    return () => undefined;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => show(query.matches);
  sync();
  query.addEventListener('change', sync);
  return () => query.removeEventListener('change', sync);
}
