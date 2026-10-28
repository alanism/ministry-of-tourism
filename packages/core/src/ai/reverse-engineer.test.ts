import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBoard, type Actor } from '../doc/model.ts';
import type { BoardView } from '../commands/board-commands.ts';
import { BoardSession } from '../commands/session.ts';
import { COACHES } from '../lenses/coaches.ts';
import { CoachReview, coachMovePrompts, coachReviewPrompts } from './coach.ts';
import {
  ReverseEngineerResult,
  applyReverseEngineer,
  locateLoose,
  reverseEngineerSystemPrompt,
  reverseEngineerUserPrompt,
  splitParagraphs,
} from './reverse-engineer.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
const agent: Actor = { kind: 'agent', id: 'agent:reverse-engineer', name: 'Reverse Engineer' };

const SOURCE = [
  'My grandmother kept a chipped blue mug by the stove. She said it was “the only honest cup in the house.”',
  'Every winter the kettle sang before dawn. The steam fogged the window, and she drew a small house in it.',
  'I never asked why she wiped it away. Some questions stay on the glass.',
].join('\n\n');

function newSession() {
  let n = 0;
  return new BoardSession(createBoard({ starterCards: false }), { newId: () => `id-${++n}` });
}

describe('loose quote matching', () => {
  it('returns the source text when the model straightened quotes or dashes', () => {
    expect(locateLoose(SOURCE, 'the only honest cup in the house."')).toBe('the only honest cup in the house.”');
    expect(locateLoose('A long—very long—road', 'long-very long-road')).toBe('long—very long—road');
    expect(locateLoose(SOURCE, 'kettle  sang\nbefore dawn')).toBe('kettle sang before dawn');
  });

  it('gives up on words that are not in the source', () => {
    expect(locateLoose(SOURCE, 'a chipped red mug')).toBeNull();
  });
});

describe('Reverse Engineer', () => {
  it('builds prompts from the 48 fixed cards and numbered paragraphs', () => {
    const system = reverseEngineerSystemPrompt();
    expect(system).toContain('idea.microcosm (Microcosm)');
    expect(system.match(/^- [a-z]+\.[a-z]+ /gm)).toHaveLength(48);
    expect(reverseEngineerUserPrompt('Mug', SOURCE)).toContain('[3] I never asked');
    expect(splitParagraphs(SOURCE)).toHaveLength(3);
  });

  it('only accepts the 48 card types in the model answer', () => {
    const bad = { paragraphs: [], cards: [{ type: 'idea.plot', quote: 'x', why: 'y', paragraph: 1 }] };
    expect(ReverseEngineerResult.safeParse(bad).success).toBe(false);
  });

  it('places verified quotes, rejects invented ones, and undoes as one run', () => {
    const session = newSession();
    const result: ReverseEngineerResult = {
      kind: 'personal essay',
      paragraphs: [
        { index: 1, question: 'Who is this about?' },
        { index: 2, question: 'What happened each winter?' },
        { index: 3, question: 'What does it mean?' },
      ],
      cards: [
        { type: 'nouns.object', quote: 'a chipped blue mug', why: 'A concrete object carries the memory.', paragraph: 1 },
        { type: 'voice.subtext', quote: 'the only honest cup in the house."', why: 'Says more than it says.', paragraph: 1 },
        { type: 'form.hook', quote: 'My grandmother kept a chipped blue mug by the stove.', why: 'Opens on a scene.', paragraph: 1 },
        { type: 'form.finale', quote: 'Some questions stay on the glass.', why: 'Ends on an image, not a summary.', paragraph: 3 },
        { type: 'idea.mystery', quote: 'She never explained the house.', why: 'Invented.', paragraph: 3 },
      ],
    };
    const outcome = applyReverseEngineer(session, agent, { title: 'The Mug', text: SOURCE }, result, { x: 100, y: 900 });
    expect(outcome.placed).toHaveLength(4);
    expect(outcome.rejected).toEqual([expect.objectContaining({ type: 'idea.mystery', reason: 'not in the source' })]);

    const board = session.execute<BoardView>(writer, 'board_read');
    expect(board.cards.every((c) => c.links[0]?.status === 'intact' && c.createdBy === agent.id)).toBe(true);
    expect(board.cards.find((c) => c.name === 'Subtext')?.links[0]?.quote).toBe('the only honest cup in the house.”');
    // Coach mode holds: the agent labeled the cards but wrote none of the writer's words.
    expect(board.cards.every((c) => c.text === '')).toBe(true);

    const timeline = board.guides[0]!;
    expect(timeline.stops.map((s) => s.label)).toEqual(['1. Who is this about?', '2. What happened each winter?', '3. What does it mean?']);
    const hook = board.cards.find((c) => c.name === 'Hook')!;
    const finale = board.cards.find((c) => c.name === 'Finale')!;
    expect(finale.x).toBeGreaterThan(hook.x);

    expect(session.undo(agent.id)).toBe(true);
    const after = session.execute<BoardView>(writer, 'board_read');
    expect(after.cards).toHaveLength(0);
    expect(after.sources).toHaveLength(0);
    expect(after.guides).toHaveLength(0);
  });

  it('maps a 1,500-word essay with every quote matched', () => {
    const words = ['kettle', 'window', 'winter', 'mug', 'stove', 'house', 'steam', 'glass', 'morning', 'tea', 'quiet', 'hands'];
    const paragraphs = Array.from({ length: 10 }, (_, p) =>
      Array.from({ length: 10 }, (_, s) => `In paragraph ${p + 1}, sentence ${s + 1} turns the ${words[(p + s) % 12]} over and looks again at the ${words[(p * 3 + s) % 12]}.`).join(' '),
    );
    const essay = paragraphs.join('\n\n');
    expect(essay.split(/\s+/).length).toBeGreaterThanOrEqual(1500);

    const types = ['nouns.object', 'idea.thesis', 'form.paragraphs', 'voice.rhythm'] as const;
    const result: ReverseEngineerResult = {
      kind: 'personal essay',
      paragraphs: paragraphs.map((_, i) => ({ index: i + 1, question: `What happens in part ${i + 1}?` })),
      cards: paragraphs.flatMap((_, p) =>
        types.map((type, k) => ({
          type,
          quote: `In paragraph ${p + 1}, sentence ${k + 2} turns the`,
          why: 'Shows the pattern.',
          paragraph: p + 1,
        })),
      ),
    };
    const session = newSession();
    const outcome = applyReverseEngineer(session, agent, { title: 'Long piece', text: essay }, result, { x: 0, y: 900 });
    expect(outcome.rejected).toEqual([]);
    expect(outcome.placed).toHaveLength(40);
    const board = session.execute<BoardView>(writer, 'board_read');
    expect(board.cards.every((c) => c.links[0]?.status === 'intact')).toBe(true);
  });
});

describe('coach prompts', () => {
  it('builds a review prompt from the role card, never naming a person', () => {
    const coach = COACHES.find((c) => c.id === 'essay-architect')!;
    const card = {
      id: 'c',
      type: 'idea.thesis',
      category: 'IDEA',
      name: 'Thesis',
      question: 'What one idea must your reader take away?',
      x: 0,
      y: 0,
      rotation: 0,
      orientation: 'landscape' as const,
      size: '3x5' as const,
      text: 'Small objects hold whole families.',
      annotation: '',
      createdBy: 'writer',
      links: [],
    };
    const { system, user } = coachReviewPrompts(coach, card, {});
    expect(system).toContain('You are the Essay Architect coach');
    expect(system).toContain('1. Idea check');
    expect(system).toContain('the writer writes every sentence');
    expect(user).toContain('Small objects hold whole families.');
    expect(coachMovePrompts([coach], 'My essay is messy', 'Today we fix the thesis', '').user).toContain('(nothing yet)');
    expect(z.toJSONSchema(CoachReview)).toMatchObject({ type: 'object' });
  });
});
