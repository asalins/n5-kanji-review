import { FOCUS_RING } from '../components/styles';

/**
 * Non-blocking notice for a new version. It never reloads by itself: only the user's tap applies the update.
 * App shows it on the home screen only, so it can never interrupt a review, an import/export or settings.
 */
export function UpdateBanner({ visible, onUpdate, onDismiss }: { visible: boolean; onUpdate: () => void; onDismiss: () => void }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="flex w-full max-w-sm flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 text-left text-sm dark:border-neutral-600 dark:bg-neutral-800"
    >
      <span>มีเวอร์ชันใหม่ · A new version is available</span>
      <span className="flex gap-2">
        <button type="button" onClick={onUpdate} className={`min-h-11 rounded-lg bg-red-700 px-3 font-semibold text-white ${FOCUS_RING}`}>
          อัปเดต · Update
        </button>
        <button type="button" onClick={onDismiss} className={`min-h-11 rounded-lg px-3 ${FOCUS_RING}`}>
          ภายหลัง · Later
        </button>
      </span>
    </div>
  );
}
