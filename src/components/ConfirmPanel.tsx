import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SECONDARY_BUTTON, FOCUS_RING } from './styles';

/**
 * Explicit confirmation for destructive actions: the confirm button stays disabled until the user ticks
 * "I understand". Focus moves to the panel so keyboard and screen-reader users land on the warning.
 */
export function ConfirmPanel({
  title,
  children,
  acknowledge,
  confirmLabel,
  cancelLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  acknowledge: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby={titleId}
      className={`flex flex-col gap-3 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-left dark:border-red-400 dark:bg-red-950/40 ${FOCUS_RING}`}
    >
      <h3 id={titleId} className="text-base font-semibold">
        {title}
      </h3>
      <div className="text-sm">{children}</div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        {acknowledge}
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!checked || busy === true}
          onClick={onConfirm}
          className={`min-h-12 flex-1 rounded-xl bg-red-700 px-4 font-semibold text-white disabled:opacity-40 ${FOCUS_RING}`}
        >
          {confirmLabel}
        </button>
        <button type="button" disabled={busy === true} onClick={onCancel} className={`${SECONDARY_BUTTON} flex-1`}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
