import type { ReactNode } from 'react';

interface StateMessageProps {
  readonly tone: 'loading' | 'empty' | 'error';
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}

/** Loading / empty / error panel. Errors use role="alert"; the others are polite status updates. */
export function StateMessage({ tone, title, description, children }: StateMessageProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className="mx-auto flex max-w-md flex-col items-center gap-3 p-6 text-center"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      {description !== undefined && <p className="text-stone-600 dark:text-neutral-400">{description}</p>}
      {children !== undefined && <div className="mt-2 flex w-full flex-col gap-3">{children}</div>}
    </div>
  );
}
