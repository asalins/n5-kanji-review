import { useState } from 'react';
import { SECONDARY_BUTTON, SAFE_PAGE } from '../components/styles';
import { StudyModeSelector } from '../features/flashcards/StudyModeSelector';
import { sessionOnlyOrchestrator } from '../features/review/reviewBoundary';
import { StudySession } from '../features/review/StudySession';
import type { StudyMode } from '../types/entities';

/** Practice picks random cards regardless of schedule, so it must never write SRS state (hence the session-only orchestrator). */
export function StudyPage({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<StudyMode | null>(null);
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
      {mode === null ? (
        <>
          <h1 className="text-2xl font-semibold">เลือกโหมดการเรียน</h1>
          <StudyModeSelector onSelect={setMode} />
          <button type="button" onClick={onExit} className={`${SECONDARY_BUTTON} self-start`}>
            ← Home
          </button>
        </>
      ) : (
        <StudySession mode={mode} onExit={() => setMode(null)} orchestrator={sessionOnlyOrchestrator} />
      )}
    </main>
  );
}
