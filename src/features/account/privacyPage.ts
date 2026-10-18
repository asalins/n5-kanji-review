import { PRIVACY_LINKS, PRIVACY_TEXT as T } from './strings';

/** Public URL of the privacy notice: a static page next to the app, readable without signing in or JavaScript. */
export const PRIVACY_PAGE_PATH = '/privacy.html';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function block(lang: string, part: { heading: string; sections: readonly (readonly [string, string])[] }): string {
  const items = part.sections.map(([term, text]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(text)}</dd>`).join('');
  return `<section lang="${lang}"><h2>${escapeHtml(part.heading)}</h2><dl>${items}</dl></section>`;
}

/**
 * The same privacy notice as the in-app Privacy screen (one source: PRIVACY_TEXT), as a static HTML page. It is the
 * public privacy policy URL required by the Google sign-in consent screen. No script, no external request.
 */
export function renderPrivacyPage(): string {
  const links =
    `<section lang="th"><h2>${escapeHtml(T.links)}</h2><ul>` +
    `<li><a href="${PRIVACY_LINKS.google}" rel="noopener noreferrer">${escapeHtml(T.googleLink)}</a></li>` +
    `<li><a href="${PRIVACY_LINKS.firebase}" rel="noopener noreferrer">${escapeHtml(T.firebaseLink)}</a></li></ul></section>`;
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>N5 Kanji Review — ${escapeHtml(T.title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0 auto;max-width:42rem;padding:1rem;font-family:system-ui,sans-serif;line-height:1.6;background:#fafaf9;color:#1c1917}
@media (prefers-color-scheme:dark){body{background:#171717;color:#f5f5f4}a{color:#fca5a5}}
section{margin:1rem 0;padding:1rem;border:1px solid #d6d3d1;border-radius:1rem}
dt{font-weight:600;margin-top:.75rem}dd{margin:0}a{color:#b91c1c}
</style>
</head>
<body>
<h1>N5 Kanji Review — ${escapeHtml(T.title)}</h1>
${block('th', T.th)}
${block('en', T.en)}
${links}
<p><a href="/">N5 Kanji Review</a></p>
</body>
</html>
`;
}
