import { StateMessage } from '../../components/StateMessage';
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import type { StateFilter } from '../../services/kanjiSearch/kanjiReviewStates';
import { ResultCard } from './ResultCard';
import { STATE_OPTIONS, TEXT, resultCount } from './strings';
import { useKanjiSearch } from './useKanjiSearch';

const FIELD = `min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-lg text-stone-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 ${FOCUS_RING}`;

export function KanjiSearch({ onExit, onOpenDetail }: { onExit: () => void; onOpenDetail?: (kanjiId: string) => void }) {
  const { status, hits, text, state, dueOnly, setText, setState, setDueOnly, reload } = useKanjiSearch();
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{TEXT.title}</h1>
        <button type="button" onClick={onExit} className={`${SECONDARY_BUTTON} min-h-11`}>
          {TEXT.back}
        </button>
      </header>

      <div className="flex flex-col gap-1">
        <label htmlFor="kanji-search-input" className="text-sm font-medium">
          {TEXT.searchLabel}
        </label>
        <input
          id="kanji-search-input"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby="kanji-search-hint"
          className={FIELD}
        />
        <p id="kanji-search-hint" className="text-xs text-stone-500 dark:text-neutral-400">
          {TEXT.searchHint}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="kanji-state-filter" className="text-sm font-medium">
            {TEXT.stateLabel}
          </label>
          <select id="kanji-state-filter" value={state} onChange={(event) => setState(event.target.value as StateFilter)} className={FIELD}>
            {STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-pressed={dueOnly}
          onClick={() => setDueOnly(!dueOnly)}
          className={`${SECONDARY_BUTTON} min-h-12 ${dueOnly ? 'border-red-700 font-semibold dark:border-red-400' : ''}`}
        >
          {dueOnly ? '✓ ' : '○ '}
          {TEXT.dueNow}
        </button>
      </div>
      <p className="text-xs text-stone-500 dark:text-neutral-400">{TEXT.stateNote}</p>

      {status === 'LOADING' && <StateMessage tone="loading" title={TEXT.loading} />}
      {status === 'ERROR' && (
        <StateMessage tone="error" title={TEXT.errorTitle} description={TEXT.errorDescription}>
          <button type="button" onClick={() => void reload()} className={PRIMARY_BUTTON}>
            {TEXT.retry}
          </button>
        </StateMessage>
      )}
      {status === 'READY' && (
        <>
          <p aria-live="polite" className="text-sm text-stone-600 dark:text-neutral-400">
            {resultCount(hits.length)}
          </p>
          {hits.length === 0 ? (
            <StateMessage tone="empty" title={TEXT.noResults} description={TEXT.noResultsHint} />
          ) : (
            <ul className="flex flex-col gap-3">
              {hits.map((hit) => (
                <ResultCard key={hit.entry.kanji.id} hit={hit} onOpen={onOpenDetail} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
