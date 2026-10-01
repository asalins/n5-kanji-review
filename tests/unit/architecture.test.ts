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
});
