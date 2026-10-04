import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const STORAGE_LAYERS = ['services/storage', 'repositories/indexeddb'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  rel: relative(SRC, path).split('\\').join('/'),
  text: readFileSync(path, 'utf8'),
}));

describe('architecture boundaries', () => {
  it('only the storage layers import idb', () => {
    const offenders = files
      .filter((f) => /from ['"]idb['"]/.test(f.text))
      .filter((f) => !STORAGE_LAYERS.some((layer) => f.rel.startsWith(layer)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('UI and features never import the storage layer or raw datasets', () => {
    const offenders = files
      .filter((f) => /^(pages|components|hooks|features)\//.test(f.rel))
      // Checks import specifiers (not prose): the About screen must be able to NAME KANJIDIC2/JMdict in its
      // licence acknowledgement while still never importing raw or bundled data. (Phase 12 refinement.)
      .filter((f) =>
        [...f.text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].some((m) =>
          /(services\/storage|repositories\/indexeddb|data-sources|kanjidic|jmdict|\/data\/|\.json$)/i.test(m[1] ?? ''),
        ),
      )
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('does not use the any type', () => {
    const offenders = files.filter((f) => /:\s*any\b|<any>|\bas any\b/.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('content is read-only for UI: ContentWriter is never used by pages/components/hooks/features', () => {
    const offenders = files
      .filter((f) => /^(pages|components|hooks|features)\//.test(f.rel))
      .filter((f) => /ContentWriter|saveContent/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('repository interfaces do not depend on implementations or idb', () => {
    const offenders = files
      .filter((f) => f.rel.startsWith('repositories/interfaces/'))
      .filter((f) => /(indexeddb|services\/storage|from ['"]idb['"])/i.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
  it('src never imports build-time scripts or raw data sources', () => {
    const offenders = files
      .filter((f) => /from ['"][^'"]*(scripts\/dataset|data-sources)[^'"]*['"]/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('only app code and the content loader service wire ContentWriter', () => {
    const offenders = files
      .filter((f) => /ContentWriter|replaceContent|saveContent/.test(f.text))
      .filter((f) => !/^(repositories\/|services\/content\/|types\/)/.test(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
  it('only the composition root (src/app) and the storage layers touch IndexedDB implementations or the bundled dataset', () => {
    const offenders = files
      .filter((f) => !/^(app|repositories|services\/storage|services\/content)\//.test(f.rel))
      .filter((f) => /(repositories\/indexeddb|services\/storage|bundledDataset)/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('UI layers only depend on repository interfaces', () => {
    const offenders = files
      .filter((f) => /^(pages|components|hooks|features)\//.test(f.rel))
      .filter((f) => /from ['"][^'"]*repositories\/(?!interfaces)[^'"]*['"]/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('the review boundary carries no SRS scheduling values', () => {
    const boundary = files.find((f) => f.rel === 'features/review/reviewBoundary.ts')?.text ?? '';
    expect(boundary).not.toMatch(/interval|ease|dueDate|nextReview|stateAfter/i);
  });
  it('only the review orchestrator may use the SRS service (UI never calculates scheduling)', () => {
    const offenders = files
      .filter((f) => !f.rel.startsWith('services/srs/'))
      .filter((f) => /from ['"][^'"]*services\/srs[^'"]*['"]/.test(f.text))
      .filter((f) => !/^(features\/review\/[A-Za-z]*[Oo]rchestrator[A-Za-z]*\.ts|services\/session\/cardFactory\.ts|services\/backup\/backupCompatibility\.ts)$/.test(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
  it('the session engine and review session never read the system clock or randomness directly', () => {
    const offenders = files
      .filter((f) => /^(services\/session\/|services\/statistics\/|services\/kanjiSearch\/|features\/progress\/|features\/review\/(useReviewSession|ReviewSession)\.)/.test(f.rel))
      .filter((f) => /Date\.now\(|Math\.random\(|new Date\(\)/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('only services/content reads bundled data files (the UI and engine receive ports)', () => {
    const offenders = files
      .filter((f) => !f.rel.startsWith('services/content/'))
      .filter((f) => /from ['"][^'"]*\/data\/[^'"]*\.json['"]|import\(['"][^'"]*\/data\/[^'"]*['"]\)/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('UI, hooks and the review feature never write persistence or compute scheduling themselves', () => {
    const offenders = files
      .filter((f) => /^(pages|components|hooks|features)\//.test(f.rel))
      .filter((f) => f.rel !== 'features/review/reviewOrchestrator.ts') // the one place that applies SRS and writes the review
      .filter((f) => /\.(saveCard|appendLog|recordReview)\(|updateCardState|createNewCard/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
  it('statistics never use the legacy StreakState: streak is calculated from ReviewLogs only', () => {
    const offenders = files
      .filter((f) => /^(services\/statistics\/|features\/progress\/)/.test(f.rel))
      .filter((f) => /StreakState|getStreakState|saveStreakState/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('statistics and the dashboard never hard-code the kanji total (it comes from the dataset)', () => {
    const offenders = files
      .filter((f) => /^(services\/statistics\/|features\/progress\/)/.test(f.rel))
      .filter((f) => /\b196\b/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('statistics and the dashboard are read-only: they never write persistence', () => {
    const offenders = files
      .filter((f) => /^(services\/statistics\/|features\/progress\/)/.test(f.rel))
      .filter((f) => /\.(saveCard|appendLog|recordReview|saveSession|saveContent|replaceContent)\(/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('getCardsByStates reads through the existing by-state index', () => {
    const source = files.find((f) => f.rel === 'repositories/indexeddb/IndexedDbReviewRepository.ts')?.text ?? '';
    const body = source.slice(source.indexOf('getCardsByStates('), source.indexOf('getNewCards('));
    expect(body).toMatch(/index\('by-state'\)/);
  });
  it('Due has ONE definition (utils/dueCard.ts): statistics and the repository reuse it, nobody re-implements it', () => {
    const comparisons = files
      .filter((f) => f.rel !== 'utils/dueCard.ts')
      .filter((f) => /\.due\s*(<=|>=|<(?!=)|>(?!=))|(?<![=-])(<=|>=|<|>)\s*[\w.]*\.due\b/.test(f.text))
      .map((f) => f.rel);
    expect(comparisons).toEqual([]);
    const statistics = files.find((f) => f.rel === 'services/statistics/statisticsService.ts')?.text ?? '';
    expect(statistics).toMatch(/isDueCard\(/);
    expect(statistics).not.toMatch(/getDueCards\(/); // no second path to a "due" number
    const repository = files.find((f) => f.rel === 'repositories/indexeddb/IndexedDbReviewRepository.ts')?.text ?? '';
    const body = repository.slice(repository.indexOf('getDueCards('), repository.indexOf('getCardsByStates('));
    expect(body).toMatch(/isDueCard\(/);
    expect(body).not.toMatch(/state\s*[!=]==?\s*'NEW'/); // the NEW exclusion lives only in isDueCard
    const session = files.find((f) => f.rel === 'services/session/sessionEngine.ts')?.text ?? '';
    expect(session).toMatch(/getDueCards\(/); // the session selects due cards through the same repository rule
  });

  it('statistics and the dashboard never touch IndexedDB or the storage layer, directly or through an implementation', () => {
    const offenders = files
      .filter((f) => /^(services\/statistics\/|features\/progress\/)/.test(f.rel))
      .filter((f) => /from ['"](idb|[^'"]*(repositories\/indexeddb|services\/storage)[^'"]*)['"]|\bindexedDB\b|\bIDBKeyRange\b/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('statistics never write ReviewCard, ReviewLog, StudySession or StreakState', () => {
    const offenders = files
      .filter((f) => /^(services\/statistics\/|features\/progress\/)/.test(f.rel))
      .filter((f) => /\b(saveCard|appendLog|recordReview|saveSession|saveStreakState|saveSettings)\s*\(/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
  it('search (services/kanjiSearch, features/kanji) is read-only and never touches SRS', () => {
    const search = files.filter((f) => /^(services\/kanjiSearch\/|features\/kanji\/)/.test(f.rel));
    expect(search.length).toBeGreaterThan(0);
    const writes = search.filter((f) => /\.(saveCard|appendLog|recordReview|saveSession|saveStreakState|saveContent|replaceContent)\(/.test(f.text)).map((f) => f.rel);
    expect(writes).toEqual([]);
    const srs = search.filter((f) => /from ['"][^'"]*services\/srs[^'"]*['"]|StreakState/.test(f.text)).map((f) => f.rel);
    expect(srs).toEqual([]);
  });

  it('search goes through the repository interfaces only and never queries per kanji (no N+1)', () => {
    const search = files.filter((f) => /^(services\/kanjiSearch\/|features\/kanji\/)/.test(f.rel));
    const direct = search.filter((f) => /from ['"](idb|[^'"]*(repositories\/indexeddb|services\/storage)[^'"]*)['"]|\bindexedDB\b/.test(f.text)).map((f) => f.rel);
    expect(direct).toEqual([]);
    const perKanji = search.filter((f) => /\.(getReadings|getById|getCard|getVocabulary|getExamples)\(/.test(f.text)).map((f) => f.rel);
    expect(perKanji).toEqual([]);
  });

  it('search reuses the single Due definition and the Phase 7 Learned/Mastered meaning without a second Due predicate', () => {
    const states = files.find((f) => f.rel === 'services/kanjiSearch/kanjiReviewStates.ts')?.text ?? '';
    expect(states).toMatch(/isDueCard\(/);
    const second = files.filter((f) => /^(services\/kanjiSearch\/|features\/kanji\/)/.test(f.rel)).filter((f) => /\.due\s*(<=|>=|<(?!=)|>(?!=))|(?<![=-])(<=|>=|<|>)\s*[\w.]*\.due\b/.test(f.text)).map((f) => f.rel);
    expect(second).toEqual([]);
  });

  it('search normalization is pure and never rewrites stored data', () => {
    const normalize = files.find((f) => f.rel === 'services/kanjiSearch/normalize.ts')?.text ?? '';
    expect(normalize).not.toMatch(/Date\.now|Math\.random|\bawait\b|\bimport\b[^;]*repositories/);
  });
  it('settings and backup UI reach storage only through services and repository interfaces', () => {
    const offenders = files
      .filter((f) => /^(features\/settings\/|pages\/SettingsPage|components\/ConfirmPanel)/.test(f.rel))
      .filter((f) => /from ['"](idb|[^'"]*(repositories\/indexeddb|services\/storage)[^'"]*)['"]|\bindexedDB\b|\blocalStorage\b|\bIDBKeyRange\b/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('backup never runs the SRS: only the algorithm version label is imported, never updateCardState/createNewCard', () => {
    const backup = files.filter((f) => f.rel.startsWith('services/backup/'));
    expect(backup.length).toBeGreaterThan(0);
    const srsImports = backup.flatMap((f) => [...f.text.matchAll(/import\s*{([^}]*)}\s*from ['"][^'"]*services\/srs[^'"]*['"]|import\s*{([^}]*)}\s*from ['"]\.\.\/srs[^'"]*['"]/g)].map((m) => (m[1] ?? m[2] ?? '').trim()));
    expect(srsImports).toEqual(['SRS_ALGORITHM_VERSION']);
    const calls = backup.filter((f) => /updateCardState|createNewCard|srsV1|newCardFor/.test(f.text)).map((f) => f.rel);
    expect(calls).toEqual([]);
  });

  it('backup cannot write the dataset: no content writer, no content stores, no streakState', () => {
    const backupCode = files.filter((f) => f.rel.startsWith('services/backup/') || f.rel === 'repositories/indexeddb/IndexedDbBackupRepository.ts' || f.rel.startsWith('features/settings/'));
    const offenders = backupCode
      .filter((f) => /ContentWriter|saveContent|replaceContent|STORES\.(kanji|kanjiReadings|vocabulary|exampleSentences|contentMeta|streakState)\b|StreakState/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('import and reset are single transactions in the repository (no store-by-store writes from services)', () => {
    const repo = files.find((f) => f.rel === 'repositories/indexeddb/IndexedDbBackupRepository.ts')?.text ?? '';
    const replace = repo.slice(repo.indexOf('replaceUserData('), repo.indexOf('resetProgress('));
    expect(replace.match(/this\.db\.transaction\(/g)).toHaveLength(1);
    expect(replace).toMatch(/'readwrite'/);
    expect(replace).not.toMatch(/this\.db\.(put|add|clear|delete)\(/);
    const reset = repo.slice(repo.indexOf('resetProgress('));
    expect(reset.match(/this\.db\.transaction\(/g)).toHaveLength(1);
    const services = files.filter((f) => f.rel.startsWith('services/backup/'));
    expect(services.filter((f) => /\.(saveCard|appendLog|recordReview|saveSession|clear)\(/.test(f.text)).map((f) => f.rel)).toEqual([]);
  });
  it('the PWA layer is asset caching and the update lifecycle only: no repository, IndexedDB, SRS, statistics or search', () => {
    const pwaFiles = files.filter((f) => /^app\/(pwaUpdate|UpdateBanner)\./.test(f.rel));
    expect(pwaFiles.map((f) => f.rel).sort()).toEqual(['app/UpdateBanner.tsx', 'app/pwaUpdate.ts']);
    const offenders = pwaFiles
      .filter((f) => /from ['"](idb|[^'"]*(repositories|services|hooks\/useRepositories|features|types\/schemas)[^'"]*)['"]|\bindexedDB\b/.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
    const config = readFileSync(join(process.cwd(), 'pwa.config.ts'), 'utf8');
    expect(config).not.toMatch(/from ['"]\.\/src\//); // the service-worker config imports no application code
  });

  it('only the PWA update hook talks to the service worker; nothing in the app reads Cache Storage', () => {
    const swUsers = files.filter((f) => /virtual:pwa-register|navigator\.serviceWorker|\bcaches\./.test(f.text)).map((f) => f.rel);
    expect(swUsers).toEqual(['app/pwaUpdate.ts']);
    const cacheUse = files.filter((f) => /\bcaches\.(open|match|keys|delete)\b|CacheStorage/.test(f.text)).map((f) => f.rel);
    expect(cacheUse).toEqual([]);
  });

  it('no hand-written service worker: the generated Workbox worker caches assets only, with no runtime (network/API) caching', () => {
    expect(files.filter((f) => /(^|\/)(sw|service-?worker)\.(ts|js)$/i.test(f.rel))).toEqual([]);
    const config = readFileSync(join(process.cwd(), 'pwa.config.ts'), 'utf8');
    expect(config).toMatch(/runtimeCaching: \[\]/);
    expect(config).toMatch(/registerType: 'prompt'/);
  });
});
