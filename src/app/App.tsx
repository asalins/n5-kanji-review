import { useEffect, useState } from 'react';
import { StateMessage } from '../components/StateMessage';
import { RepositoriesProvider, type AppRepositories } from '../hooks/useRepositories';
import { HomePage } from '../pages/HomePage';
import { ReviewPage } from '../pages/ReviewPage';
import { StudyPage } from '../pages/StudyPage';
import { logError, toUserMessage } from '../utils/userMessage';
import { useAppStore } from './appStore';
import { bootstrapApp } from './bootstrap';
import { applyThemePreference } from './theme';

type Screen = 'home' | 'review' | 'practice';

interface AppProps {
  /** Injectable for tests. Defaults to opening the real database and loading the bundled dataset. */
  readonly bootstrap?: () => Promise<AppRepositories>;
}

export function App({ bootstrap = bootstrapApp }: AppProps) {
  const bootState = useAppStore((s) => s.bootState);
  const bootError = useAppStore((s) => s.bootError);
  const markReady = useAppStore((s) => s.markReady);
  const markFailed = useAppStore((s) => s.markFailed);
  const markBooting = useAppStore((s) => s.markBooting);
  const [repositories, setRepositories] = useState<AppRepositories | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [attempt, setAttempt] = useState(0);

  // Phase 9 will pass the saved theme setting instead of 'system'.
  useEffect(() => applyThemePreference('system'), []);

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
      <main className="min-h-dvh bg-stone-50 p-6 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
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
      <main className="min-h-dvh bg-stone-50 p-6 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
        <StateMessage tone="loading" title="กำลังเตรียมข้อมูล…" />
      </main>
    );
  }
  return (
    <RepositoriesProvider value={repositories}>
      {screen === 'home' && <HomePage onStartReview={() => setScreen('review')} onStartPractice={() => setScreen('practice')} />}
      {screen === 'review' && <ReviewPage onExit={() => setScreen('home')} />}
      {screen === 'practice' && <StudyPage onExit={() => setScreen('home')} />}
    </RepositoriesProvider>
  );
}
