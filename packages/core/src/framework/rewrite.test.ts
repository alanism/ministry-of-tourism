// The description rewrite may change wording only. This keeps the draft
// complete, short and pointed at real coaches before it is applied.
import { describe, expect, it } from 'vitest';
import draft from '../../content/framework-rewrite.json' with { type: 'json' };
import { COACHES } from '../lenses/coaches.ts';
import { FRAMEWORK_CARDS } from './catalog.ts';

const words = (text: string) => text.trim().split(/\s+/).length;

describe('description rewrite draft', () => {
  it('covers each of the 48 cards exactly once, in framework order', () => {
    expect(draft.cards.map((c) => c.id)).toEqual(FRAMEWORK_CARDS.map((c) => c.id));
  });

  it('keeps questions to 12 words and lessons to 45', () => {
    for (const card of draft.cards) {
      expect(words(card.question), card.id).toBeLessThanOrEqual(12);
      expect(card.question.endsWith('?'), card.id).toBe(true);
      expect(words(card.lesson), card.id).toBeLessThanOrEqual(45);
    }
  });

  it('only cites real coaches', () => {
    const ids = new Set(COACHES.map((c) => c.id));
    for (const card of draft.cards) for (const tip of card.tips) expect(ids.has(tip.coach), `${card.id}: ${tip.coach}`).toBe(true);
  });
});
