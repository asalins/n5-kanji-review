import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRepositories } from '../../hooks/useRepositories';
import type { DailyLimits } from '../../services/session/allowance';
import { DEFAULT_USER_SETTINGS } from '../../services/settings/defaults';
import { limitsFromSettings, validateSettings } from '../../services/settings/settingsRules';
import type { UserSettings } from '../../types/entities';
import { logError } from '../../utils/userMessage';

type SettingsLoad = 'LOADING' | 'READY' | 'ERROR';

interface SettingsContextValue {
  readonly status: SettingsLoad;
  /** Saved settings, or the defaults when none are saved or they could not be read. */
  readonly settings: UserSettings;
  /** True when the values come from a saved record. */
  readonly saved: boolean;
  /** Daily limits for the session and the dashboard (dailyNewCards -> newCards). Stable between renders. */
  readonly limits: DailyLimits;
  /** Validates and saves; rejects (and keeps the previous values) on failure. */
  save(next: UserSettings): Promise<void>;
  /** Reads the saved settings again (after an import or a reset). */
  reload(): Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Loads the saved settings once. Missing settings fall back to the defaults IN MEMORY (nothing is written);
 * a read error keeps the app usable with the defaults and is shown on the settings page.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { settings: repository } = useRepositories();
  const [status, setStatus] = useState<SettingsLoad>(repository === undefined ? 'READY' : 'LOADING');
  const [stored, setStored] = useState<UserSettings | null>(null);
  const token = useRef(0);

  const reload = useCallback(async () => {
    if (repository === undefined) return;
    const mine = (token.current += 1);
    try {
      const value = await repository.get();
      if (mine !== token.current) return;
      setStored(value);
      setStatus('READY');
    } catch (error) {
      logError(error);
      if (mine === token.current) {
        setStored(null);
        setStatus('ERROR');
      }
    }
  }, [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (next: UserSettings) => {
      if (repository === undefined) throw new Error('Settings cannot be saved here');
      const valid = validateSettings(next);
      await repository.save(valid);
      setStored(valid);
      setStatus('READY');
    },
    [repository],
  );

  const settings = stored ?? DEFAULT_USER_SETTINGS;
  const limits = useMemo(() => limitsFromSettings(settings), [settings]);
  const value = useMemo<SettingsContextValue>(
    () => ({ status, settings, saved: stored !== null, limits, save, reload }),
    [status, settings, stored, limits, save, reload],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
