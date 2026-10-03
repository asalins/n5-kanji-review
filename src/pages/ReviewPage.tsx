import { ReviewSession } from '../features/review/ReviewSession';

export function ReviewPage({ onExit }: { onExit: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 p-4 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <ReviewSession onExit={onExit} />
    </main>
  );
}
