/** Shared class strings so every control has the same visible focus treatment. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 dark:focus-visible:outline-red-400';

export const PRIMARY_BUTTON =
  `min-h-14 w-full rounded-xl bg-red-700 px-6 text-lg font-semibold text-white active:bg-red-800 ${FOCUS_RING}`;

export const SECONDARY_BUTTON =
  `min-h-12 rounded-xl border border-stone-300 bg-white px-4 text-base font-medium text-stone-900 active:bg-stone-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:active:bg-neutral-700 ${FOCUS_RING}`;

/**
 * Page padding that respects display cut-outs, rounded corners and the Android navigation area
 * (works with viewport-fit=cover; on screens without insets it is a plain 1rem).
 */
export const SAFE_PAGE =
  'pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]';
