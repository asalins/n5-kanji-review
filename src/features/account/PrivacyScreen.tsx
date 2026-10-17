import { useId, type ReactNode } from 'react';
import { FOCUS_RING, SECONDARY_BUTTON } from '../../components/styles';
import { PRIVACY_LINKS, PRIVACY_TEXT as T } from './strings';

function Block({ title, lang, children }: { title: string; lang: string; children: ReactNode }) {
  const id = useId();
  return (
    <section lang={lang} aria-labelledby={id} className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left dark:border-neutral-700 dark:bg-neutral-800/60">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const LINK = `inline-flex min-h-11 items-center underline underline-offset-4 ${FOCUS_RING}`;

/** Privacy notice (C3), Thai and English. Static text: readable offline; the provider links need internet. */
export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{T.title}</h1>
        <button type="button" className={SECONDARY_BUTTON} onClick={onBack}>
          {T.back}
        </button>
      </div>
      {[
        { lang: 'th', part: T.th },
        { lang: 'en', part: T.en },
      ].map(({ lang, part }) => (
        <Block key={lang} lang={lang} title={part.heading}>
          <dl className="flex flex-col gap-3">
            {part.sections.map(([term, text]) => (
              <div key={term}>
                <dt className="font-semibold">{term}</dt>
                <dd className="text-sm leading-relaxed">{text}</dd>
              </div>
            ))}
          </dl>
        </Block>
      ))}
      <Block title={T.links} lang="th">
        <a className={LINK} href={PRIVACY_LINKS.google} target="_blank" rel="noopener noreferrer">
          {T.googleLink}
        </a>
        <a className={LINK} href={PRIVACY_LINKS.firebase} target="_blank" rel="noopener noreferrer">
          {T.firebaseLink}
        </a>
      </Block>
    </div>
  );
}
