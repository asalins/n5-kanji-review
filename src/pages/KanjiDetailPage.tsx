import { SAFE_PAGE } from '../components/styles';
import { KanjiDetail } from '../features/kanjiDetail/KanjiDetail';

export function KanjiDetailPage({ kanjiId, onBack }: { kanjiId: string; onBack: () => void }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}>
      <KanjiDetail kanjiId={kanjiId} onBack={onBack} />
    </main>
  );
}
