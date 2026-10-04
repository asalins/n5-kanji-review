import { describe, expect, it } from 'vitest';
import { spreadNewCards } from '../../../src/services/session/spreadNewCards';
import type { PlannedCard } from '../../../src/services/session/types';
import { storedCard } from '../../helpers/sessionFixtures';

const plan = (spec: string): PlannedCard[] =>
  spec.split(' ').map((token) => ({ card: storedCard(token[0]!, token[1] as 'A'), kind: 'new' as const }));
const label = (cards: readonly PlannedCard[]) =>
  cards.map((c) => `${String.fromCodePoint(Number.parseInt(c.card.itemId.slice('kanji:U+'.length), 16))}${c.card.mode}`).join(' ');
const sameKanjiNeighbours = (cards: readonly PlannedCard[]) =>
  cards.filter((c, i) => i > 0 && c.card.itemId === cards[i - 1]!.card.itemId).length;

describe('spreading the new cards of a session', () => {
  it('keeps exactly the same cards, only reorders them', () => {
    const input = plan('一A 一B 一C 一D 二A 二B 二C 二D 三A 三B');
    const output = spreadNewCards(input);
    expect(output).toHaveLength(input.length);
    expect(new Set(output)).toEqual(new Set(input));
    expect(output.map((c) => c.card.id).sort()).toEqual(input.map((c) => c.card.id).sort());
  });

  it('no two cards of the same kanji are adjacent when that is possible; modes stay A->B->C->D per kanji', () => {
    const output = spreadNewCards(plan('一A 一B 一C 一D 二A 二B 二C 二D 三A 三B'));
    expect(sameKanjiNeighbours(output)).toBe(0);
    expect(label(output)).toBe('一A 二A 一B 二B 一C 二C 三A 一D 二D 三B');
    for (const kanji of ['一', '二', '三']) {
      const modes = label(output).split(' ').filter((t) => t.startsWith(kanji)).map((t) => t[1]);
      expect(modes).toEqual([...modes].sort());
    }
  });

  it('is deterministic', () => {
    const input = plan('一A 一B 一C 一D 二A 二B 二C 二D 三A 三B 三C 三D 四A');
    expect(label(spreadNewCards(input))).toBe(label(spreadNewCards(input)));
    expect(sameKanjiNeighbours(spreadNewCards(input))).toBe(0);
  });

  it('when adjacency is unavoidable it does its best and never adds or drops a card (no dummy cards)', () => {
    const output = spreadNewCards(plan('一A 一B 一C 一D 二A'));
    expect(output).toHaveLength(5);
    expect(label(output)).toBe('一A 二A 一B 一C 一D');
    expect(sameKanjiNeighbours(output)).toBe(2); // the minimum possible for 4 + 1
  });

  it('single cards and empty input', () => {
    expect(spreadNewCards([])).toEqual([]);
    expect(label(spreadNewCards(plan('水A')))).toBe('水A');
  });
});
