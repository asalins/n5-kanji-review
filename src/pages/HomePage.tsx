import { APP_NAME } from '../app/config';
import { PRIMARY_BUTTON } from '../components/styles';

/** Minimal entry point. The real dashboard (due cards, progress) arrives in Phase 7. */
export function HomePage({ onStartStudy }: { onStartStudy: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 bg-stone-50 p-6 text-center text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <button type="button" onClick={onStartStudy} className={`${PRIMARY_BUTTON} max-w-xs`}>
        เริ่มเรียน · Study
      </button>
    </main>
  );
}
