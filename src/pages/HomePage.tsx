import { APP_NAME } from '../app/config';

/** Placeholder shell. Real dashboard (due cards, progress) arrives in Phase 7. */
export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 p-6 text-center dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <p className="text-neutral-600 dark:text-neutral-400">Project setup complete. No data loaded yet.</p>
    </main>
  );
}
