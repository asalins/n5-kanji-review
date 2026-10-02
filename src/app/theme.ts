import type { Theme } from '../types/entities';

const DARK_CLASS = 'dark';

/**
 * Applies the Light / Dark / System preference to <html>. Phase 4 always passes 'system';
 * Phase 9 (Settings) will pass the saved UserSettings.theme. Returns a cleanup function.
 */
export function applyThemePreference(theme: Theme): () => void {
  const root = document.documentElement;
  if (theme !== 'system') {
    root.classList.toggle(DARK_CLASS, theme === 'dark');
    return () => undefined;
  }
  if (typeof window.matchMedia !== 'function') {
    root.classList.remove(DARK_CLASS);
    return () => undefined;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const sync = () => root.classList.toggle(DARK_CLASS, query.matches);
  sync();
  query.addEventListener('change', sync);
  return () => query.removeEventListener('change', sync);
}
