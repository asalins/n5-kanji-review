import type { StudyMode } from '../../types/entities';
import { buildFront, groupReadings, selectMeanings, type KanjiCardData, type ReadingView } from './presentation';
import { MODE_INFO } from './strings';

export type FlashcardPhase = 'front' | 'revealed';

interface FlashcardProps {
  readonly mode: StudyMode;
  readonly data: KanjiCardData;
  readonly phase: FlashcardPhase;
  /** Tapping the card is a convenience; the Show Answer button is the accessible control. */
  readonly onReveal: () => void;
}

export function CardFront({ mode, data }: { mode: StudyMode; data: KanjiCardData }) {
  const prompt = buildFront(mode, data);
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-sm text-stone-500 dark:text-neutral-400">{MODE_INFO[mode].question}</p>
      {prompt.kind === 'kanji' && (
        <p lang="ja" className="font-jp text-[8rem] leading-none sm:text-[10rem]">
          {prompt.text}
        </p>
      )}
      {prompt.kind === 'meaning' && (
        <ul className="flex flex-col gap-2 text-3xl font-medium">
          {prompt.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {prompt.kind === 'reading' && (
        <p lang="ja" className="font-jp text-6xl leading-tight">
          {prompt.kana}
        </p>
      )}
    </div>
  );
}

function ReadingList({ title, items }: { title: string; items: readonly ReadingView[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col items-center gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-neutral-400">{title}</h3>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1">
        {items.map((item) => (
          <li key={item.kana} className="flex items-baseline gap-2">
            <span lang="ja" className="font-jp text-2xl">
              {item.kana}
            </span>
            {item.romaji !== null && <span className="text-sm text-stone-500 dark:text-neutral-400">{item.romaji}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CardBack({ data }: { data: KanjiCardData }) {
  const meanings = selectMeanings(data.kanji);
  const readings = groupReadings(data.readings);
  return (
    <div className="card-reveal flex flex-col items-center gap-4 text-center">
      <p lang="ja" className="font-jp text-8xl leading-none">
        {data.kanji.character}
      </p>
      <div className="flex flex-col gap-1">
        {meanings.th.length > 0 && <p className="text-2xl font-semibold">{meanings.th.join(' · ')}</p>}
        {meanings.en.length > 0 && (
          <p className={meanings.th.length > 0 ? 'text-base text-stone-600 dark:text-neutral-400' : 'text-2xl font-semibold'}>
            {meanings.en.join(' · ')}
          </p>
        )}
      </div>
      <ReadingList title="On'yomi" items={readings.on} />
      <ReadingList title="Kun'yomi" items={readings.kun} />
    </div>
  );
}

export function Flashcard({ mode, data, phase, onReveal }: FlashcardProps) {
  return (
    <div
      aria-live="polite"
      onClick={phase === 'front' ? onReveal : undefined}
      className="flex w-full max-w-xl flex-1 flex-col items-center justify-center rounded-3xl border border-stone-200 bg-white px-4 py-8 shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
    >
      {phase === 'front' ? <CardFront mode={mode} data={data} /> : <CardBack data={data} />}
    </div>
  );
}
