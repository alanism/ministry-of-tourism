// Coaches: prompts and answer shapes for a coach reviewing a card, and for the
// "What's wrong?" loop (one complaint, one move, one modeled example, then the
// writer tries their own). Coaches never write the writer's words; the one
// example goes on its own sticky note, marked as an example.
import { z } from 'zod';
import type { Coach } from '../lenses/build.ts';
import type { CardView } from '../commands/board-commands.ts';

export const CoachReview = z.object({
  checks: z
    .array(
      z.object({
        name: z.string().describe("The check's name, as given"),
        verdict: z.enum(['works', 'needs work', 'not yet written']),
        note: z.string().describe('One short sentence about this card, under 25 words'),
      }),
    )
    .describe('One entry per check, in the order given'),
  nextMove: z.string().describe('The single most useful next move for the writer, under 30 words, phrased as an instruction'),
});
export type CoachReview = z.infer<typeof CoachReview>;

export const CoachMove = z.object({
  diagnosis: z.string().describe('What is going on in this writing, in under 30 words'),
  example: z.string().describe('ONE short modeled example of the move (a sentence or two), clearly separate from the writer’s text'),
  tryThis: z.string().describe('What the writer should try now in their own words, under 30 words'),
});
export type CoachMove = z.infer<typeof CoachMove>;

function coachBrief(coach: Coach): string {
  const card = coach.roleCard;
  return [
    `You are the ${coach.role} coach. Your question: ${coach.question}`,
    `Core idea: ${card.coreMetaphor}`,
    `Mission: ${card.mission}`,
    `You cover:\n${card.owns.map((o) => `- ${o}`).join('\n')}`,
    `You never:\n${card.vetoes.map((v) => `- ${v}`).join('\n')}`,
    `Phrases that sound like you:\n${card.samplePhrases.map((p) => `- ${p}`).join('\n')}`,
  ].join('\n\n');
}

const COACH_RULES = [
  'Coach mode: the writer writes every sentence. Never rewrite their text or hand them finished prose.',
  'Talk to the writer directly, plainly and briefly. Be specific to what they wrote.',
  'If there is nothing written yet, say what to write about, not what to write.',
].join('\n');

export function coachReviewPrompts(coach: Coach, card: CardView, context: { draftExcerpt?: string }) {
  const checks = coach.roleCard.outputFormat.map((c, i) => `${i + 1}. ${c.name} — ${c.question}`).join('\n');
  const passages = card.links
    .filter((l) => l.status !== 'gone')
    .map((l) => `- "${l.current || l.quote}"`)
    .join('\n');
  return {
    system: `${coachBrief(coach)}\n\n${COACH_RULES}\n\nReview one card from the writer's board using exactly these checks:\n${checks}`,
    user: [
      `Card: ${card.name} (${card.category.toLowerCase()} column)`,
      `The card asks: ${card.question}`,
      `What the writer wrote on it: ${card.text.trim() ? card.text : '(nothing yet)'}`,
      passages ? `Passages from their draft pinned to this card:\n${passages}` : '',
      context.draftExcerpt ? `Opening of their draft, for context:\n${context.draftExcerpt}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

export function coachMovePrompts(coaches: Coach[], complaint: string, move: string, writing: string) {
  return {
    system: [
      coaches.map(coachBrief).join('\n\n---\n\n'),
      COACH_RULES,
      'You may model the move ONCE, in a short example of your own that is clearly not the writer’s text. Then hand it back: tell the writer what to try in their own words.',
    ].join('\n\n'),
    user: [`The writer says: "${complaint}"`, `Today's move: ${move}.`, `Their writing:\n${writing.trim() || '(nothing yet)'}`].join('\n\n'),
  };
}

export const BoardScores = z.object({
  scores: z
    .array(
      z.object({
        cardId: z.string().describe('The card id, exactly as given'),
        score: z.number().int().describe('1 = missing, 3 = solid, 5 = masterful'),
        note: z.string().describe('One short reason, under 20 words'),
      }),
    )
    .describe('One score for each card listed'),
});
export type BoardScores = z.infer<typeof BoardScores>;

/** Scores every card that has writing on it, 1 to 5, through one coach's eyes. */
export function scoreBoardPrompts(coach: Coach, cards: CardView[]) {
  const listed = cards
    .filter((c) => c.text.trim())
    .map((c) => `- id ${c.id} | ${c.name} (${c.category.toLowerCase()}): asks "${c.question}" | writer wrote: "${c.text.trim()}"`)
    .join('\n');
  return {
    system: [
      coachBrief(coach),
      COACH_RULES,
      "Score how well the writing on each card does that card's job, from 1 (missing) to 3 (solid) to 5 (masterful). Be honest and specific.",
    ].join('\n\n'),
    user: listed ? `Cards:\n${listed}` : 'There are no cards with writing yet.',
  };
}
