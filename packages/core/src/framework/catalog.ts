// The Nouns / Idea / Form / Voice framework. Card names, categories and the
// count are fixed product rules; only the question and lesson wording may change.
// framework.lock.test.ts fails if anything else does.
import { z } from 'zod';
import data from '../../content/framework.json' with { type: 'json' };

export const CATEGORY_IDS = ['NOUNS', 'IDEA', 'FORM', 'VOICE'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

const CategorySchema = z.object({
  id: z.enum(CATEGORY_IDS),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9A-F]{6}$/i),
});

const CardSchema = z.object({
  id: z.string().regex(/^[a-z]+\.[a-z]+$/),
  category: z.enum(CATEGORY_IDS),
  name: z.string().min(1),
  order: z.number().int().min(1).max(12),
  starter: z.boolean(),
  question: z.string().min(1),
  lesson: z.string().min(1),
  /** Coach tips for the back of the card (filled in by the description rewrite). */
  tips: z.array(z.object({ coach: z.string(), tip: z.string().min(1) })).default([]),
});

const FrameworkSchema = z.object({
  schemaVersion: z.literal(1),
  categories: z.array(CategorySchema).length(4),
  cards: z.array(CardSchema).length(48),
});

export type Category = z.infer<typeof CategorySchema>;
export type FrameworkCard = z.infer<typeof CardSchema>;

const parsed = FrameworkSchema.parse(data);

function freeze<T>(items: T[]): readonly Readonly<T>[] {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

export const CATEGORIES = freeze(parsed.categories);
export const FRAMEWORK_CARDS = freeze(parsed.cards);

const byId = new Map(FRAMEWORK_CARDS.map((card) => [card.id, card]));

export type CardTypeId = string;

export function getFrameworkCard(id: CardTypeId): Readonly<FrameworkCard> | undefined {
  return byId.get(id);
}

export function isCardTypeId(id: string): boolean {
  return byId.has(id);
}

export function cardsInCategory(category: CategoryId): readonly Readonly<FrameworkCard>[] {
  return FRAMEWORK_CARDS.filter((card) => card.category === category).sort((a, b) => a.order - b.order);
}

export function getCategory(id: CategoryId): Readonly<Category> {
  const category = CATEGORIES.find((c) => c.id === id);
  if (!category) throw new Error(`Unknown category ${id}`);
  return category;
}

/**
 * What a new board opens with: six of the twelve starter cards. The three
 * Nouns plus the friendliest first question in each other column; the rest
 * of the starters are a click away in the palette, or come in a Draw 3 hand.
 */
export const OPENING_HAND: readonly CardTypeId[] = Object.freeze([
  'nouns.character',
  'nouns.setting',
  'nouns.object',
  'idea.material',
  'form.tension',
  'voice.spirit',
]);
