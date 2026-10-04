import { useKanjiSearch } from '../../../src/features/kanji/useKanjiSearch';

/** Drives the real hook with an injected clock; renders the hit characters and a due flag per hit. */
export function SearchProbe({ now }: { now: () => number }) {
  const { status, hits, text, dueOnly, setText, setDueOnly } = useKanjiSearch({ now });
  return (
    <div>
      <input aria-label="q" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={() => setDueOnly(!dueOnly)}>
        toggle-due
      </button>
      <p data-testid="status">{status}</p>
      <p data-testid="hits">{hits.map((h) => `${h.entry.kanji.character}${h.due ? '*' : ''}`).join(',')}</p>
    </div>
  );
}
