// The framework is a product rule: these names, their categories, their order
// and the starter set must never change. If this test fails, the change is wrong,
// not the test.
import { describe, expect, it } from 'vitest';
import { CATEGORIES, FRAMEWORK_CARDS, OPENING_HAND, cardsInCategory, getFrameworkCard } from './catalog.ts';

const LOCKED = {
  NOUNS: ['Character', 'Setting', 'Object', 'Desire', 'Obstacle', 'Role', 'Time', 'Weather', 'Texture', 'Symbol', 'Tool', 'Artifact'],
  IDEA: ['Material', 'Thesis', 'Title', 'Experience', 'Argument', 'References', 'Microcosm', 'Response', 'Catalyst', 'Mystery', 'Target', 'Phonetics'],
  FORM: ['Paragraphs', 'Structure', 'Tension', 'Frame', 'Flow', 'Finale', 'Sequence', 'Cohesion', 'Modularity', 'Conflict', 'Threads', 'Hook'],
  VOICE: ['Spirit', 'Sound', 'Sight', 'Tone', 'Perspective', 'Subtext', 'Repetition', 'Rhythm', 'Rhyme', 'Imagery', 'Words', 'Motif'],
} as const;

describe('framework lock', () => {
  it('has exactly four categories in order', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['NOUNS', 'IDEA', 'FORM', 'VOICE']);
    expect(CATEGORIES.map((c) => c.label)).toEqual(['Nouns', 'Idea', 'Form', 'Voice']);
  });

  it('has exactly 48 cards', () => {
    expect(FRAMEWORK_CARDS).toHaveLength(48);
  });

  it.each(Object.entries(LOCKED))('%s holds its 12 locked names in order', (category, names) => {
    expect(cardsInCategory(category as keyof typeof LOCKED).map((c) => c.name)).toEqual(names);
  });

  it('marks the first three cards of each column as the starters', () => {
    const starters = FRAMEWORK_CARDS.filter((c) => c.starter).map((c) => c.name);
    expect(starters).toEqual(['Character', 'Setting', 'Object', 'Material', 'Thesis', 'Title', 'Paragraphs', 'Structure', 'Tension', 'Spirit', 'Sound', 'Sight']);
  });

  it('opens new boards with six of the starters: the Nouns, Material, Tension and Spirit', () => {
    expect(OPENING_HAND.map((id) => getFrameworkCard(id)?.name)).toEqual(['Character', 'Setting', 'Object', 'Material', 'Tension', 'Spirit']);
    expect(OPENING_HAND.every((id) => getFrameworkCard(id)?.starter)).toBe(true);
  });

  it('derives stable ids from category and name', () => {
    for (const card of FRAMEWORK_CARDS) {
      expect(card.id).toBe(`${card.category.toLowerCase()}.${card.name.toLowerCase()}`);
    }
    expect(new Set(FRAMEWORK_CARDS.map((c) => c.id)).size).toBe(48);
    expect(getFrameworkCard('idea.thesis')?.name).toBe('Thesis');
  });

  it('cannot be mutated at runtime', () => {
    const card = getFrameworkCard('form.hook')!;
    expect(() => {
      (card as { name: string }).name = 'Opener';
    }).toThrow();
    expect(Object.isFrozen(FRAMEWORK_CARDS)).toBe(true);
  });
});
