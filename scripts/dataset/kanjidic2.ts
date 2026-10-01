import { XMLParser } from 'fast-xml-parser';

/** Raw facts read from KANJIDIC2, before any normalization. JLPT/grade fields are ignored on purpose. */
export interface RawKanjidicCharacter {
  readonly literal: string;
  readonly strokeCounts: readonly number[];
  readonly frequency: number | null;
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly meaningsEn: readonly string[];
}

export interface KanjidicHeader {
  readonly fileVersion: string | null;
  readonly databaseVersion: string | null;
  readonly dateOfCreation: string | null;
}

export interface ParsedKanjidic {
  readonly header: KanjidicHeader;
  readonly characters: readonly RawKanjidicCharacter[];
}

type Node = Record<string, unknown>;

const ARRAY_TAGS = new Set(['character', 'rmgroup', 'reading', 'meaning', 'stroke_count']);

function asNode(value: unknown): Node {
  return typeof value === 'object' && value !== null ? (value as Node) : {};
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}
function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return String(value);
  const inner = asNode(value)['#text'];
  return typeof inner === 'string' ? inner.trim() : null;
}
function positiveInt(value: unknown): number | null {
  const t = text(value);
  if (t === null || !/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Parses KANJIDIC2 XML (structure per the file's DTD). Verify against the real file before trusting. */
export function parseKanjidic2(xml: string): ParsedKanjidic {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
    processEntities: false,
  });
  const root = asNode(asNode(parser.parse(xml))['kanjidic2']);
  const header = asNode(root['header']);

  const characters = asArray(root['character']).map((raw): RawKanjidicCharacter => {
    const c = asNode(raw);
    const misc = asNode(c['misc']);
    const groups = asArray(asNode(c['reading_meaning'])['rmgroup']).map(asNode);
    const readings = groups.flatMap((g) => asArray(g['reading']).map(asNode));
    const readingsOfType = (type: string): string[] =>
      readings
        .filter((r) => r['@_r_type'] === type)
        .map((r) => text(r))
        .filter((t): t is string => t !== null);
    const meanings = groups
      .flatMap((g) => asArray(g['meaning']))
      // A bare <meaning> parses to a string (English); with attributes it parses to an object.
      .filter((m) => typeof m === 'string' || asNode(m)['@_m_lang'] === undefined || asNode(m)['@_m_lang'] === 'en')
      .map((m) => text(m))
      .filter((t): t is string => t !== null);
    return {
      literal: text(c['literal']) ?? '',
      strokeCounts: asArray(misc['stroke_count'])
        .map(positiveInt)
        .filter((n): n is number => n !== null),
      frequency: positiveInt(misc['freq']),
      onReadings: readingsOfType('ja_on'),
      kunReadings: readingsOfType('ja_kun'),
      meaningsEn: meanings,
    };
  });

  return {
    header: {
      fileVersion: text(header['file_version']),
      databaseVersion: text(header['database_version']),
      dateOfCreation: text(header['date_of_creation']),
    },
    characters,
  };
}
