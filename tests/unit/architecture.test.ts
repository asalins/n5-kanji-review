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
      .filter((f) => /(services\/storage|repositories\/indexeddb|data-sources|KANJIDIC|JMdict)/i.test(f.text))
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
      .filter((f) => !/^(features\/review\/[A-Za-z]*[Oo]rchestrator[A-Za-z]*\.ts|services\/session\/cardFactory\.ts)$/.test(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
  it('the session engine and review session never read the system clock or randomness directly', () => {
    const offenders = files
      .filter((f) => /^(services\/session\/|services\/statistics\/|features\/progress\/|features\/review\/(useReviewSession|ReviewSession)\.)/.test(f.rel))
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
});
