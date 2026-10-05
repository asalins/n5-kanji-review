import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auditThai } from '../../../scripts/dataset/thaiAudit';
import { buildContentBundle } from '../../../src/services/content/buildContentBundle';
import { alignThaiVersion } from '../../../scripts/dataset/thaiVersion';
import { kanjiDatasetFileSchema, thaiDatasetFileSchema, type ThaiDatasetFile } from '../../../src/services/content/datasetFiles';
import { makeKanjiId } from '../../../src/utils/kanjiId';
import { makeDataset } from '../../helpers/datasetFixtures';

const LIST = ['水', '火', '山', '木'];
const dataset = makeDataset('v1', [['水', '6C34', 'water'], ['火', '706B', 'fire'], ['山', '5C71', 'mountain'], ['木', '6728', 'tree']]);
const entry = (c: string, meaningsTh: string[], reviewed: boolean, ambiguous = false) => ({ kanjiId: makeKanjiId(c), meaningsTh, reviewed, ambiguous });
const thai = (entries: ThaiDatasetFile['entries'], datasetVersion = 'v1'): ThaiDatasetFile => ({ datasetVersion, entries });

describe('Thai audit (read-only)', () => {
  it('counts every state and lists pending kanji in Project N5 order', () => {
    const report = auditThai(LIST, dataset, thai([entry('水', ['น้ำ'], true), entry('火', ['ไฟ'], false), entry('山', [], false)]));
    expect(report).toMatchObject({ total: 4, hasMeaning: 2, reviewed: 1, notReviewed: 2, ambiguous: 0, missing: 1, versionMatches: true, complete: false });
    expect(report.pending.map((p) => `${p.position}${p.character}:${p.status}`)).toEqual(['2火:draft', '3山:empty', '4木:no-entry']);
  });

  it('ambiguous entries stay pending even when reviewed', () => {
    const report = auditThai(['水'], dataset, thai([entry('水', ['น้ำ'], true, true)]));
    expect(report.pending).toEqual([{ position: 1, character: '水', kanjiId: makeKanjiId('水'), status: 'ambiguous' }]);
    expect(report.complete).toBe(false);
  });

  it('flags contradictions: reviewed without a meaning, unknown or duplicate entries, version mismatch', () => {
    const report = auditThai(LIST, dataset, thai([entry('水', [], true), entry('龍', ['มังกร'], false), entry('火', ['ไฟ'], false), entry('火', ['ไฟ'], false)], 'v0'));
    expect(report.inconsistent).toEqual([`${makeKanjiId('水')}: reviewed without a meaning`]);
    expect(report.unknownEntries).toEqual([makeKanjiId('龍')]);
    expect(report.duplicateEntries).toEqual([makeKanjiId('火')]);
    expect(report.versionMatches).toBe(false);
  });

  it('complete only when every kanji is reviewed, has a meaning and is not ambiguous', () => {
    const all = thai(LIST.map((c) => entry(c, ['x'], true)));
    expect(auditThai(LIST, dataset, all).complete).toBe(true);
  });

  it('runs on the real files: 196 kanji, consistent, and nothing is approved automatically', () => {
    const list = (JSON.parse(readFileSync('data/lists/n5-list.json', 'utf8')) as { kanji: string[] }).kanji;
    const realDataset = kanjiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.json', 'utf8')));
    const realThai = thaiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.th.json', 'utf8')));
    const report = auditThai(list, realDataset, realThai);
    expect(report.total).toBe(196);
    expect([report.missing, report.unknownEntries.length, report.duplicateEntries.length, report.inconsistent.length]).toEqual([0, 0, 0, 0]);
    expect(report.versionMatches).toBe(true);
    expect(report.reviewed + report.notReviewed).toBe(196);
  });
});

describe('dataset version change keeps the Thai review work', () => {
  it('only the version changes: entries and reviewed flags are untouched', () => {
    const before = thai([entry('水', ['น้ำ'], true), entry('火', ['ไฟ'], false)], 'n5-2026.10.01');
    const after = alignThaiVersion(before, 'n5-2026.11.01');
    expect(after).toEqual({ datasetVersion: 'n5-2026.11.01', entries: before.entries });
    expect(before.datasetVersion).toBe('n5-2026.10.01'); // input not mutated
  });
});

describe('drafts never reach the app', () => {
  it('with the real files, a kanji gets Thai text only from a reviewed, non-ambiguous entry', () => {
    const realDataset = kanjiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.json', 'utf8')));
    const realThai = thaiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.th.json', 'utf8')));
    const approved = new Set(realThai.entries.filter((e) => e.reviewed && !e.ambiguous).map((e) => e.kanjiId));
    const { bundle } = buildContentBundle(realDataset, realThai);
    for (const kanji of bundle.kanji) {
      if (!approved.has(kanji.id)) expect(kanji.meanings.th, kanji.character).toEqual([]);
    }
  });

  it('whatever the file state, a draft (reviewed:false) or an ambiguous entry is never shown', () => {
    const realDataset = kanjiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.json', 'utf8')));
    const realThai = thaiDatasetFileSchema.parse(JSON.parse(readFileSync('data/kanji/n5.th.json', 'utf8')));
    const water = makeKanjiId('水');
    const fire = makeKanjiId('火');
    const withDraftAndAmbiguous: ThaiDatasetFile = {
      ...realThai,
      entries: realThai.entries.map((e) =>
        e.kanjiId === water ? { ...e, meaningsTh: ['ร่าง'], reviewed: false } : e.kanjiId === fire ? { ...e, meaningsTh: ['ไฟ'], reviewed: true, ambiguous: true } : e,
      ),
    };
    const { bundle } = buildContentBundle(realDataset, withDraftAndAmbiguous);
    expect(bundle.kanji.find((k) => k.id === water)?.meanings.th).toEqual([]);
    expect(bundle.kanji.find((k) => k.id === fire)?.meanings.th).toEqual([]);
  });
});

