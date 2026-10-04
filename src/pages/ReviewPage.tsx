import { ReviewSession } from '../features/review/ReviewSession';
import { useSettings } from '../features/settings/SettingsProvider';

export function ReviewPage({ onExit }: { onExit: () => void }) {
  const { limits } = useSettings();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 p-4 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <ReviewSession onExit={onExit} limits={limits} />
    </main>
  );
}
