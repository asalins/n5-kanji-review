import { SAFE_PAGE } from '../components/styles';
import { PrivacyScreen } from '../features/account/PrivacyScreen';

export function PrivacyPage({ onBack }: { onBack: () => void }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
      <PrivacyScreen onBack={onBack} />
    </main>
  );
}
