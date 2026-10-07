import { SECONDARY_BUTTON } from '../../components/styles';
import { groupReadings, selectMeanings, type ReadingView } from '../flashcards/presentation';
import type { SearchHit } from '../../services/kanjiSearch/searchKanji';
import { BADGE, TEXT } from './strings';

function Readings({ label, items }: { label: string; items: readonly ReadingView[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <dt className="text-xs text-stone-500 dark:text-neutral-400">{label}</dt>
      <dd lang="ja" className="text-base">
        {items.map((r, i) => (
          <span key={r.kana}>
            {i > 0 && '、 '}
            {r.kana}
            {r.romaji !== null && <span lang="en" className="text-sm text-stone-500 dark:text-neutral-400">{` · ${r.romaji}`}</span>}
          </span>
        ))}
      </dd>
    </div>
  );
}

/** Kanji-level labels from the loaded cards. Text, never colour alone. */
function badges(hit: SearchHit): string[] {
  const { review } = hit.entry;
  const labels: string[] = [];
  if (review.mastered) labels.push(BADGE.MASTERED);
  else {
    if (!review.learned) labels.push(BADGE.NEW);
    if (review.has.LEARNING) labels.push(BADGE.LEARNING);
    if (review.has.REVIEW) labels.push(BADGE.REVIEW);
    if (review.has.RELEARNING) labels.push(BADGE.RELEARNING);
    if (review.has.MASTERED) labels.push(BADGE.MASTERED.replace('Kanji', 'card(s)'));
  }
  if (hit.due) labels.push(TEXT.due);
  return labels;
}

export function ResultCard({ hit, onOpen }: { hit: SearchHit; onOpen?: (kanjiId: string) => void }) {
  const { kanji, readings } = hit.entry;
  const meanings = selectMeanings(kanji);
  const groups = groupReadings(readings);
  return (
    <li className="flex gap-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <p lang="ja" className="w-16 shrink-0 text-center text-5xl leading-none">
        {kanji.character}
      </p>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <dl className="flex flex-col gap-1">
          <div>
            <dt className="sr-only">{TEXT.meanings}</dt>
            <dd className="text-base font-medium">{meanings.en.join(' · ')}</dd>
          </div>
          {meanings.th.length > 0 && (
            <div>
              <dt className="sr-only">{TEXT.thai}</dt>
              <dd lang="th" className="text-base">{meanings.th.join(' · ')}</dd>
            </div>
          )}
          <Readings label={TEXT.onyomi} items={groups.on} />
          <Readings label={TEXT.kunyomi} items={groups.kun} />
        </dl>
        <ul aria-label="สถานะ · Status" className="flex flex-wrap gap-1.5">
          {badges(hit).map((label) => (
            <li key={label} className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs dark:border-neutral-600">
              {label}
            </li>
          ))}
        </ul>
        {onOpen !== undefined && (
          <button
            type="button"
            className={`${SECONDARY_BUTTON} self-start`}
            aria-label={`${TEXT.details} ${kanji.character}`}
            onClick={() => onOpen(kanji.id)}
          >
            {TEXT.details}
          </button>
        )}
      </div>
    </li>
  );
}
