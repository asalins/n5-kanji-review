import { useEffect, useState, type ReactNode } from 'react';
import { AboutPage } from '../pages/AboutPage';
import { useScreenNavigation } from './navigation';
import { StateMessage } from '../components/StateMessage';
import { RepositoriesProvider, type AppRepositories } from '../hooks/useRepositories';
import { HomePage } from '../pages/HomePage';
import { ReviewPage } from '../pages/ReviewPage';
import { SearchPage } from '../pages/SearchPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SettingsProvider, useSettings } from '../features/settings/SettingsProvider';
import { StudyPage } from '../pages/StudyPage';
import { logError, toUserMessage } from '../utils/userMessage';
import { useAppStore } from './appStore';
import { bootstrapApp } from './bootstrap';
import { applyThemePreference } from './theme';
import { SAFE_PAGE } from '../components/styles';
import { usePwaUpdate, type PwaUpdate } from './pwaUpdate';
import { UpdateBanner } from './UpdateBanner';

/** Applies the saved theme (Light / Dark / System) with the existing theme function. */
function SavedTheme() {
  const { settings } = useSettings();
  useEffect(() => applyThemePreference(settings.theme), [settings.theme]);
  return null;
}

/** Pages render once the saved settings have been read (or failed to be read: then the defaults are used). */
function WhenSettingsLoaded({ children }: { children: ReactNode }) {
  const { status } = useSettings();
  if (status === 'LOADING') {
    return (
      <main className={`min-h-dvh bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
        <StateMessage tone="loading" title="กำลังเตรียมข้อมูล…" />
      </main>
    );
  }
  return <>{children}</>;
}

interface AppProps {
  /** Injectable for tests. Defaults to opening the real database and loading the bundled dataset. */
  readonly bootstrap?: () => Promise<AppRepositories>;
  /** Service-worker update lifecycle (tests inject a fake; production registers the generated worker). */
  readonly useUpdate?: () => PwaUpdate;
}

export function App({ bootstrap = bootstrapApp, useUpdate = usePwaUpdate }: AppProps) {
  const update = useUpdate();
  const bootState = useAppStore((s) => s.bootState);
  const bootError = useAppStore((s) => s.bootError);
  const markReady = useAppStore((s) => s.markReady);
  const markFailed = useAppStore((s) => s.markFailed);
  const markBooting = useAppStore((s) => s.markBooting);
  const [repositories, setRepositories] = useState<AppRepositories | null>(null);
  const { screen, open, goHome } = useScreenNavigation();
  const [attempt, setAttempt] = useState(0);

  // Until the saved settings are available (start-up screens) the system theme is used.
  useEffect(() => (repositories === null ? applyThemePreference('system') : undefined), [repositories]);

  useEffect(() => {
    let cancelled = false;
    bootstrap().then(
      (ready) => {
        if (cancelled) return;
        setRepositories(ready);
        markReady();
      },
      (error: unknown) => {
        if (cancelled) return;
        logError(error);
        markFailed(toUserMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bootstrap, markReady, markFailed, attempt]);

  if (bootState === 'failed') {
    return (
      <main className={`min-h-dvh bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
        <StateMessage tone="error" title="เริ่มแอปไม่สำเร็จ" description={bootError ?? undefined}>
          <button
            type="button"
            onClick={() => {
              markBooting();
              setAttempt((n) => n + 1);
            }}
            className="min-h-14 rounded-xl bg-red-700 px-6 text-lg font-semibold text-white"
          >
            ลองอีกครั้ง
          </button>
        </StateMessage>
      </main>
    );
  }
  if (bootState === 'booting' || repositories === null) {
    return (
      <main className={`min-h-dvh bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
        <StateMessage tone="loading" title="กำลังเตรียมข้อมูล…" />
      </main>
    );
  }
  return (
    <RepositoriesProvider value={repositories}>
      <SettingsProvider>
        <SavedTheme />
        <WhenSettingsLoaded>
      {screen === 'home' && (
        <HomePage
          onStartReview={() => open('review')}
          onStartPractice={() => open('practice')}
          onSearch={() => open('search')}
          onSettings={() => open('settings')}
          // Update notice only here: never during a review, an import/export or settings. Never automatic.
          notice={<UpdateBanner visible={update.updateReady} onUpdate={update.applyUpdate} onDismiss={update.dismiss} />}
        />
      )}
      {screen === 'settings' && <SettingsPage onExit={goHome} onAbout={() => open('about')} />}
      {screen === 'about' && <AboutPage onBack={() => open('settings')} />}
      {screen === 'search' && <SearchPage onExit={goHome} />}
      {screen === 'review' && <ReviewPage onExit={goHome} />}
      {screen === 'practice' && <StudyPage onExit={goHome} />}
        </WhenSettingsLoaded>
      </SettingsProvider>
    </RepositoriesProvider>
  );
}
