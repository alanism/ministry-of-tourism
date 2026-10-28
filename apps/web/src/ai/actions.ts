// What the AI features do on the board. Each runs as a named agent, so its
// changes are tagged, follow Coach mode, and can be undone as one run.
import { BoardScores, CoachMove, CoachReview, ReverseEngineerResult, TUTORING_LOOP, applyReverseEngineer, cardDimensions, coachMovePrompts, coachReviewPrompts, getCoach, mergeReverseResults, preparePiece, reverseEngineerOrigin, reverseEngineerPartPrompts, reverseEngineerSystemPrompt, scoreBoardPrompts, type Actor, type CardView, type Coach, type ReverseEngineerOutcome, NOTE_COLORS } from '@writers-board/core';
import { boardSession, latestBoard } from '../state/board';
import { useUi } from '../state/ui';
import { generateStructured } from './providers';

export const REVERSE_ENGINEER: Actor = { kind: 'agent', id: 'agent:reverse-engineer', name: 'Reverse Engineer' };
const coachActor = (coach: Coach): Actor => ({ kind: 'agent', id: `agent:coach:${coach.id}`, name: coach.role });

/**
 * Reads a pasted piece and maps it onto the board. A long piece is read in
 * parts (a few at a time), so `onProgress` can say how far along it is.
 */
export async function reverseEngineer(
  input: { title: string; author?: string; text: string },
  options: { skipDebris?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<ReverseEngineerOutcome> {
  const piece = preparePiece(input.text, { skipDebris: options.skipDebris });
  const prompts = reverseEngineerPartPrompts(input.title, piece);
  const results: ReverseEngineerResult[] = new Array(prompts.length);
  let done = 0;
  options.onProgress?.(0, prompts.length);
  const readPart = async (i: number) => {
    results[i] = await generateStructured({
      job: 'reverse',
      name: 'reverse_engineer',
      system: reverseEngineerSystemPrompt(),
      user: prompts[i]!,
      schema: ReverseEngineerResult,
      effort: 'high',
    });
    options.onProgress?.(++done, prompts.length);
  };
  // Three parts at a time: quicker than one by one, gentler on rate limits than all at once.
  const queue = prompts.map((_, i) => i);
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) await readPart(i);
  }));
  // New work goes below everything already on the board.
  const board = latestBoard()!;
  const lowest = Math.max(
    0,
    ...board.cards.map((c) => c.y + cardDimensions(c.size, c.orientation).height),
    ...board.notes.map((n) => n.y + 144),
    ...board.images.map((i) => i.y + i.height + 44),
    ...board.guides.flatMap((g) => g.points.map((p) => p[1] + 60)),
  );
  return applyReverseEngineer(boardSession(), REVERSE_ENGINEER, input, mergeReverseResults(results), reverseEngineerOrigin(lowest), piece);
}

/** Places a sticky note beside a card, as the given agent, below any notes already there. */
function noteBeside(agent: Actor, card: CardView, text: string, color: string) {
  const { width } = cardDimensions(card.size, card.orientation);
  const x = card.x + width + 24;
  const taken = (latestBoard()?.notes ?? []).filter((n) => n.x === x && n.y >= card.y && n.y < card.y + 2000).length;
  boardSession().execute(agent, 'note_create', { x, y: card.y + taken * 160, text: text.slice(0, 2000), color });
}

export async function coachReview(cardId: string, coachId: string): Promise<CoachReview> {
  const coach = getCoach(coachId)!;
  const card = latestBoard()!.cards.find((c) => c.id === cardId)!;
  const { system, user } = coachReviewPrompts(coach, card, { draftExcerpt: latestBoard()!.manuscript.slice(0, 1500) });
  const review = await generateStructured({ job: 'coach', name: 'coach_review', system, user, schema: CoachReview, effort: 'medium' });
  const agent = coachActor(coach);
  const session = boardSession();
  session.beginRun(agent);
  try {
    noteBeside(agent, card, `${coach.role}: ${review.nextMove}`, NOTE_COLORS[0]);
  } finally {
    session.endRun(agent);
  }
  return review;
}

/** A coach scores every card with writing on it; the scores stamp onto the cards. */
export async function scoreBoard(coachId: string): Promise<number> {
  const coach = getCoach(coachId)!;
  const cards = latestBoard()!.cards;
  if (!cards.some((c) => c.text.trim())) throw new Error('Write on a few cards first; empty cards have nothing to score.');
  const { system, user } = scoreBoardPrompts(coach, cards);
  const result = await generateStructured({ job: 'coach', name: 'board_scores', system, user, schema: BoardScores, effort: 'medium' });
  const agent = coachActor(coach);
  const session = boardSession();
  let stamped = 0;
  session.beginRun(agent);
  try {
    for (const { cardId, score, note } of result.scores) {
      if (!cards.some((c) => c.id === cardId)) continue;
      session.execute(agent, 'card_score', { id: cardId, score: Math.min(5, Math.max(1, Math.round(score))), note: note.slice(0, 300) });
      stamped++;
    }
  } finally {
    session.endRun(agent);
  }
  return stamped;
}

export interface MoveTarget {
  /** A card to work on, or null for the whole draft. */
  cardId: string | null;
}

export async function coachMove(complaint: string, move: string, target: MoveTarget): Promise<CoachMove> {
  const route = TUTORING_LOOP.complaints.find((c) => c.complaint === complaint);
  const coaches = (route?.coachIds ?? ['essay-architect']).map((id) => getCoach(id)!);
  const board = latestBoard()!;
  const card = target.cardId ? board.cards.find((c) => c.id === target.cardId) : undefined;
  const writing = card ? `${card.name} card (${card.question}):\n${card.text}` : board.manuscript.slice(0, 6000);
  const { system, user } = coachMovePrompts(coaches, complaint, move, writing);
  const result = await generateStructured({ job: 'coach', name: 'coach_move', system, user, schema: CoachMove, effort: 'medium' });

  const agent = coachActor(coaches[0]!);
  const session = boardSession();
  session.beginRun(agent);
  try {
    session.execute(agent, 'coach_log_add', { complaint, move, coachIds: coaches.map((c) => c.id), target: card ? `${card.name} card` : 'the draft' });
    if (card) {
      noteBeside(agent, card, `Example: ${result.example}`, NOTE_COLORS[1]);
      noteBeside(agent, card, `Now you try: ${result.tryThis}`, NOTE_COLORS[3]);
    } else {
      // Working on the draft: the notes land in the middle of the current view.
      const { view } = useUi.getState();
      const x = Math.round(view.x - 160);
      const y = Math.round(view.y - 72);
      session.execute(agent, 'note_create', { x, y, text: `Example: ${result.example}`, color: NOTE_COLORS[1] });
      session.execute(agent, 'note_create', { x: x + 176, y, text: `Now you try: ${result.tryThis}`, color: NOTE_COLORS[3] });
    }
  } finally {
    session.endRun(agent);
  }
  return result;
}
