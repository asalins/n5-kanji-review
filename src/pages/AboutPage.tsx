import { SAFE_PAGE } from '../components/styles';
import { AboutScreen } from '../features/about/AboutScreen';

export function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
      <AboutScreen onBack={onBack} />
    </main>
  );
}
