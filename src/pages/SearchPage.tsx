import { SAFE_PAGE } from '../components/styles';
import { KanjiSearch } from '../features/kanji/KanjiSearch';

/**
 * While a kanji detail is open the search page stays mounted but hidden (Phase 13), so its query, filters
 * and results are still there when the user comes back.
 */
export function SearchPage({ onExit, onOpenDetail, hidden = false }: { onExit: () => void; onOpenDetail?: (kanjiId: string) => void; hidden?: boolean }) {
  return (
    <main
      hidden={hidden}
      className={`mx-auto ${hidden ? 'hidden' : 'flex'} min-h-dvh w-full max-w-3xl flex-col gap-4 bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100 ${SAFE_PAGE}`}
    >
      <KanjiSearch onExit={onExit} onOpenDetail={onOpenDetail} />
    </main>
  );
}
