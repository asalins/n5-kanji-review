import { useEffect, useRef } from 'react';
import { StateMessage } from '../../components/StateMessage';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../../components/styles';
import { REVIEW_RATINGS, type ReviewRating, type StudyMode } from '../../types/entities';
import { Flashcard } from '../flashcards/Flashcard';
import { RatingButtons } from '../flashcards/RatingButtons';
import { MODE_INFO, RATING_INFO } from '../flashcards/strings';
import type { ReviewOrchestrator } from './reviewBoundary';
import { useStudySession } from './useStudySession';

interface StudySessionProps {
  readonly mode: StudyMode;
  readonly onExit: () => void;
  readonly orchestrator?: ReviewOrchestrator;
  readonly size?: number;
  readonly createSeed?: () => number;
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT']);

function SessionSummary({ ratings, onAgain, onExit }: { ratings: readonly ReviewRating[]; onAgain: () => void; onExit: () => void }) {
  return (
    <StateMessage tone="empty" title="จบรอบนี้แล้ว" description={`ทบทวน ${ratings.length} ใบ`}>
      <ul className="grid grid-cols-2 gap-2 text-left">
        {REVIEW_RATINGS.map((rating) => (
          <li key={rating} className="rounded-lg bg-stone-100 px-3 py-2 dark:bg-neutral-800">
            {RATING_INFO[rating].label}: {ratings.filter((r) => r === rating).length}
          </li>
        ))}
      </ul>
      <p className="text-sm text-stone-500 dark:text-neutral-400">ยังไม่บันทึกผลการประเมิน (ระบบทบทวนอัตโนมัติจะมาในขั้นถัดไป)</p>
      <button type="button" onClick={onAgain} className={PRIMARY_BUTTON}>
        เรียนอีกรอบ
      </button>
      <button type="button" onClick={onExit} className={SECONDARY_BUTTON}>
        เปลี่ยนโหมด
      </button>
    </StateMessage>
  );
}

export function StudySession({ mode, onExit, orchestrator, size, createSeed }: StudySessionProps) {
  const { state, reveal, rate, restart } = useStudySession({ mode, orchestrator, size, createSeed });
  const answerRef = useRef<HTMLDivElement>(null);

  // Keyboard: Space/Enter reveals, 1-4 rate. Native button activation is left alone (no double handling).
  useEffect(() => {
    if (state.status !== 'ready') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target !== null && INTERACTIVE_TAGS.has(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (state.phase === 'front' && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        reveal();
      } else if (state.phase === 'revealed') {
        const rating = REVIEW_RATINGS[Number(event.key) - 1];
        if (rating !== undefined) {
          event.preventDefault();
          void rate(rating);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [state.status, state.phase, reveal, rate]);

  // After revealing, move focus into the answer so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (state.phase === 'revealed') answerRef.current?.focus();
  }, [state.phase, state.index]);

  const header = (
    <header className="flex items-center justify-between gap-3">
      <button type="button" onClick={onExit} className={`${SECONDARY_BUTTON} min-h-11`}>
        ← Modes
      </button>
      <h1 className="text-base font-semibold">
        {mode} · {MODE_INFO[mode].title}
      </h1>
    </header>
  );

  if (state.status === 'loading') {
    return <>{header}<StateMessage tone="loading" title="กำลังโหลดการ์ด…" /></>;
  }
  if (state.status === 'error') {
    return (
      <>
        {header}
        <StateMessage tone="error" title="เกิดข้อผิดพลาด" description={state.errorMessage ?? undefined}>
          <button type="button" onClick={restart} className={PRIMARY_BUTTON}>
            ลองอีกครั้ง
          </button>
        </StateMessage>
      </>
    );
  }
  if (state.status === 'empty') {
    return (
      <>
        {header}
        <StateMessage
          tone="empty"
          title={state.emptyReason === 'no-kanji' ? 'ยังไม่มีคันจิ' : 'ไม่มีการ์ดสำหรับโหมดนี้'}
          description={state.emptyReason === 'no-kanji' ? 'ยังไม่มีข้อมูลคันจิในเครื่อง' : 'ลองเลือกโหมดอื่น'}
        >
          <button type="button" onClick={onExit} className={PRIMARY_BUTTON}>
            เลือกโหมดอื่น
          </button>
        </StateMessage>
      </>
    );
  }
  if (state.status === 'complete') {
    return <>{header}<SessionSummary ratings={state.ratings} onAgain={restart} onExit={onExit} /></>;
  }

  const card = state.cards[state.index];
  if (card === undefined) return null;
  const total = state.cards.length;

  return (
    <>
      {header}
      <div className="flex flex-col gap-1" aria-label="Progress">
        <p className="text-sm text-stone-600 dark:text-neutral-400">
          Card {state.index + 1} of {total}
        </p>
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={state.index}
          className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-700"
        >
          <div className="h-full bg-red-700 dark:bg-red-400" style={{ width: `${(state.index / total) * 100}%` }} />
        </div>
      </div>
      <div ref={answerRef} tabIndex={-1} className="flex w-full flex-1 flex-col items-center outline-none">
        <Flashcard mode={mode} data={card} phase={state.phase} onReveal={reveal} />
      </div>
      <div className="pb-[env(safe-area-inset-bottom)]">
        {state.phase === 'front' ? (
          <button type="button" onClick={reveal} aria-keyshortcuts="Space Enter" className={PRIMARY_BUTTON}>
            Show answer · ดูคำตอบ
          </button>
        ) : (
          <RatingButtons onRate={(rating) => void rate(rating)} />
        )}
      </div>
    </>
  );
}
