import { useEffect, useId, useState, type ReactNode } from 'react';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../components/styles';
import { useRepositories } from '../../hooks/useRepositories';
import { logError } from '../../utils/userMessage';
import { ABOUT_LINKS, ABOUT_TEXT } from './strings';

function Block({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const LINK = `inline-flex min-h-11 items-center underline underline-offset-4 ${FOCUS_RING}`;

/** Acknowledgement screen required for apps by the EDRDG licence. Readable offline; the links need internet. */
export function AboutScreen({ onBack }: { onBack: () => void }) {
  const { kanji } = useRepositories();
  const [version, setVersion] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    kanji.getDatasetVersion().then(
      (value) => !cancelled && setVersion(value),
      (error: unknown) => {
        logError(error);
        if (!cancelled) setVersion(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kanji]);

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{ABOUT_TEXT.title}</h1>
        <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
          {ABOUT_TEXT.backToSettings}
        </button>
      </div>
      <p>{ABOUT_TEXT.app}</p>
      <Block title={ABOUT_TEXT.kanjiDataTitle}>
        <p>{ABOUT_TEXT.kanjiData}</p>
        <p>{ABOUT_TEXT.copyright}</p>
        <p>{ABOUT_TEXT.derived}</p>
        <p>{ABOUT_TEXT.noClaim}</p>
        <p>
          {ABOUT_TEXT.datasetVersion}:{' '}
          <span className="font-mono font-semibold" data-testid="dataset-version">
            {version === undefined ? '…' : (version ?? ABOUT_TEXT.datasetVersionUnknown)}
          </span>
        </p>
        <h3 className="mt-2 text-sm font-semibold">{ABOUT_TEXT.linksTitle}</h3>
        <ul className="flex flex-col">
          {(
            [
              [ABOUT_LINKS.licence, ABOUT_TEXT.linkLicence],
              [ABOUT_LINKS.project, ABOUT_TEXT.linkProject],
              [ABOUT_LINKS.cc, ABOUT_TEXT.linkCc],
            ] as const
          ).map(([href, label]) => (
            <li key={href}>
              <a className={LINK} href={href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <p className="text-sm">{ABOUT_TEXT.jmdict}</p>
      </Block>
      <Block title={ABOUT_TEXT.listTitle}>
        <p>{ABOUT_TEXT.list}</p>
      </Block>
      <Block title={ABOUT_TEXT.thaiTitle}>
        <p>{ABOUT_TEXT.thai}</p>
      </Block>
    </div>
  );
}
