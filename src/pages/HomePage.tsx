import { APP_NAME } from '../app/config';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../components/styles';
import { ProgressDashboard } from '../features/progress/Dashboard';

/** Entry point: start a review, practise, search the kanji, and see real progress. */
export function HomePage({
  onStartReview,
  onStartPractice,
  onSearch,
}: {
  onStartReview: () => void;
  onStartPractice: () => void;
  onSearch: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center gap-5 bg-stone-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="pt-2 text-2xl font-semibold">{APP_NAME}</h1>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button type="button" onClick={onStartReview} className={PRIMARY_BUTTON}>
          ทบทวนวันนี้ · Today's review
        </button>
        <button type="button" onClick={onStartPractice} className={SECONDARY_BUTTON}>
          ฝึกตามโหมด · Practice (ไม่บันทึกผล)
        </button>
        <button type="button" onClick={onSearch} className={SECONDARY_BUTTON}>
          ค้นหาคันจิ · Search
        </button>
      </div>
      <ProgressDashboard />
    </main>
  );
}
