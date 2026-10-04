import { SettingsScreen } from '../features/settings/SettingsScreen';

export function SettingsPage({ onExit }: { onExit: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <SettingsScreen onExit={onExit} />
    </main>
  );
}
