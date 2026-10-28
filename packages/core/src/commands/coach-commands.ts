// Coaching tools: 1–5 scores stamped on cards, a reader's green/red marks on
// the draft (flash feedback), and a log of coaching moves practiced.
import * as Y from 'yjs';
import { z } from 'zod';
import { anchorRange, findQuote, resolveLink } from '../doc/links.ts';
import type { BoardParts } from '../doc/model.ts';
import { CommandError, defineCommand, type AnyCommand } from './define.ts';

const id = z.string().min(1);

export interface CardScore {
  value: number;
  note: string;
  by: string;
}

export const cardScore = defineCommand({
  name: 'card_score',
  title: 'Score a card',
  description:
    "Stamps a 1–5 score on a card for how well the writing does that card's job (1 missing, 3 solid, 5 masterful), with a one-line reason. Pass score 0 to clear it.",
  access: 'write',
  input: z.object({ id, score: z.number().int().min(0).max(5), note: z.string().max(300).optional() }),
  run: (ctx, input) => {
    const card = ctx.parts.cards.get(input.id);
    if (!card) throw new CommandError('not_found', `No card with id ${input.id}`);
    if (input.score === 0) card.delete('score');
    else card.set('score', { value: input.score, note: input.note ?? '', by: ctx.actor.id } satisfies CardScore);
    return { id: input.id };
  },
});

export const feedbackAdd = defineCommand({
  name: 'feedback_add',
  title: 'Mark a passage of the draft',
  description: 'A reader marks a passage of the draft green (love it) or red (confused). The quote must appear verbatim; pass occurrence if it repeats.',
  access: 'write',
  input: z.object({ kind: z.enum(['love', 'confused']), quote: z.string().min(1).max(2_000), occurrence: z.number().int().min(1).optional() }),
  run: (ctx, input) => {
    const text = ctx.parts.manuscript;
    const match = findQuote(text.toString(), input.quote, input.occurrence);
    if (!match.ok) {
      throw new CommandError(match.reason === 'ambiguous' ? 'quote_ambiguous' : 'quote_not_found', 'Mark a passage that appears in the draft');
    }
    const feedbackId = ctx.newId();
    const mark = new Y.Map<unknown>();
    const { start, end } = anchorRange(text, match.index, input.quote.length);
    for (const [key, value] of Object.entries({ id: feedbackId, kind: input.kind, quote: input.quote, start, end, target: { kind: 'manuscript' }, createdBy: ctx.actor.id })) {
      mark.set(key, value);
    }
    ctx.parts.feedback.set(feedbackId, mark);
    return { id: feedbackId };
  },
});

export const feedbackClear = defineCommand({
  name: 'feedback_clear',
  title: 'Clear reader marks',
  description: 'Removes one reader mark, or all of them when no id is given.',
  access: 'write',
  input: z.object({ id: id.optional() }),
  run: (ctx, input) => {
    if (input.id) ctx.parts.feedback.delete(input.id);
    else for (const key of [...ctx.parts.feedback.keys()]) ctx.parts.feedback.delete(key);
    return { ok: true };
  },
});

export const coachLogAdd = defineCommand({
  name: 'coach_log_add',
  title: 'Log a coaching move',
  description: 'Records one coaching session: the complaint, the one move practiced, and which coaches helped.',
  access: 'write',
  input: z.object({
    complaint: z.string().min(1).max(200),
    move: z.string().min(1).max(200),
    coachIds: z.array(z.string()).max(5),
    target: z.string().max(200),
    at: z.number().int().optional(),
  }),
  run: (ctx, input) => {
    const entryId = ctx.newId();
    const entry = new Y.Map<unknown>();
    for (const [key, value] of Object.entries({ id: entryId, ...input, at: input.at ?? Date.now(), by: ctx.actor.id })) entry.set(key, value);
    ctx.parts.coachLog.set(entryId, entry);
    return { id: entryId };
  },
});

export interface FeedbackView {
  id: string;
  kind: 'love' | 'confused';
  quote: string;
  start: number;
  end: number;
  status: 'intact' | 'edited' | 'gone';
}

export interface CoachLogView {
  id: string;
  complaint: string;
  move: string;
  coachIds: string[];
  target: string;
  at: number;
}

export function readCoaching(doc: Y.Doc, parts: BoardParts) {
  return {
    feedback: [...parts.feedback.values()].map((mark): FeedbackView => {
      const resolved = resolveLink(doc, parts, mark);
      return { id: mark.get('id') as string, kind: mark.get('kind') as FeedbackView['kind'], quote: mark.get('quote') as string, ...resolved };
    }),
    coachLog: [...parts.coachLog.values()]
      .map((entry) => Object.fromEntries(entry.entries()) as unknown as CoachLogView)
      .sort((a, b) => a.at - b.at),
  };
}

export const COACH_COMMANDS: readonly AnyCommand[] = [cardScore, feedbackAdd, feedbackClear, coachLogAdd];
