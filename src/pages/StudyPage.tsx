import { useState } from 'react';
import { SECONDARY_BUTTON } from '../components/styles';
import { StudyModeSelector } from '../features/flashcards/StudyModeSelector';
import { StudySession } from '../features/review/StudySession';
import type { StudyMode } from '../types/entities';

export function StudyPage({ onExit }: { onExit: () => void }) {
  const [mode, setMode] = useState<StudyMode | null>(null);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 p-4 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      {mode === null ? (
        <>
          <h1 className="text-2xl font-semibold">เลือกโหมดการเรียน</h1>
          <StudyModeSelector onSelect={setMode} />
          <button type="button" onClick={onExit} className={`${SECONDARY_BUTTON} self-start`}>
            ← Home
          </button>
        </>
      ) : (
        <StudySession mode={mode} onExit={() => setMode(null)} />
      )}
    </main>
  );
}
