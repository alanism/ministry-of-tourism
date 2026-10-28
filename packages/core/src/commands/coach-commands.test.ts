import { describe, expect, it } from 'vitest';
import { createBoard, type Actor } from '../doc/model.ts';
import { TUTORING_LOOP } from '../lenses/coaches.ts';
import type { BoardView } from './board-commands.ts';
import { BoardSession } from './session.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
const coach: Actor = { kind: 'agent', id: 'agent:coach:essay-architect', name: 'Essay Architect' };

function setup() {
  const session = new BoardSession(createBoard({ starterCards: false }));
  const read = () => session.execute<BoardView>(writer, 'board_read');
  return { session, read };
}

describe('coaching tools', () => {
  it('stamps and clears 1–5 scores on cards, from a coach', () => {
    const { session, read } = setup();
    const { id } = session.execute<{ id: string }>(writer, 'card_create', { type: 'idea.thesis' });
    session.execute(coach, 'card_score', { id, score: 3, note: 'Clear claim, borrowed phrasing.' });
    expect(read().cards[0]!.score).toEqual({ value: 3, note: 'Clear claim, borrowed phrasing.', by: coach.id });
    session.execute(coach, 'card_score', { id, score: 0 });
    expect(read().cards[0]!.score).toBeUndefined();
    expect(() => session.execute(coach, 'card_score', { id, score: 6 })).toThrow();
  });

  it('keeps a reader’s marks on the words while the draft changes', () => {
    const { session, read } = setup();
    session.execute(writer, 'manuscript_insert', { index: 0, text: 'The kettle sang. Nobody moved.' });
    session.execute(writer, 'feedback_add', { kind: 'love', quote: 'The kettle sang.' });
    session.execute(writer, 'feedback_add', { kind: 'confused', quote: 'Nobody moved.' });
    session.execute(writer, 'manuscript_insert', { index: 0, text: 'Dawn. ' });
    const marks = read().feedback;
    expect(marks.map((m) => [m.kind, m.status, read().manuscript.slice(m.start, m.end)])).toEqual([
      ['love', 'intact', 'The kettle sang.'],
      ['confused', 'intact', 'Nobody moved.'],
    ]);
    expect(() => session.execute(writer, 'feedback_add', { kind: 'love', quote: 'Not in the draft' })).toThrow(/appears in the draft/);
    session.execute(writer, 'feedback_clear', {});
    expect(read().feedback).toHaveLength(0);
  });

  it('logs coaching moves in order', () => {
    const { session, read } = setup();
    session.execute(coach, 'coach_log_add', { complaint: 'My essay is messy', move: 'Today we fix the thesis', coachIds: ['essay-architect'], target: 'Thesis card', at: 2 });
    session.execute(coach, 'coach_log_add', { complaint: 'It feels preachy', move: 'Today we turn telling into showing', coachIds: ['storyteller'], target: 'the draft', at: 1 });
    expect(read().coachLog.map((e) => e.move)).toEqual(['Today we turn telling into showing', 'Today we fix the thesis']);
  });

  it('ships the tutor phrasing from the tutoring loop', () => {
    expect(TUTORING_LOOP.phrasing).toContainEqual({ instead: 'Add detail.', say: 'Give me one sight, one sound, one action.' });
    expect(TUTORING_LOOP.phrasing).toHaveLength(6);
  });
});
