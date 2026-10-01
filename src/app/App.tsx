import { useEffect } from 'react';
import { HomePage } from '../pages/HomePage';
import { useAppStore } from './appStore';

export function App() {
  const bootState = useAppStore((s) => s.bootState);
  const bootError = useAppStore((s) => s.bootError);
  const markReady = useAppStore((s) => s.markReady);

  // Phase 2 replaces this with real startup work (opening the database).
  useEffect(() => {
    markReady();
  }, [markReady]);

  if (bootState === 'failed') {
    return (
      <main role="alert" className="p-6">
        {bootError ?? 'Unknown startup error'}
      </main>
    );
  }
  if (bootState === 'booting') {
    return null;
  }
  return <HomePage />;
}
