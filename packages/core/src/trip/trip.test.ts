import { describe, expect, it } from 'vitest';
import type { Actor } from '../doc/model.ts';
import { CommandError } from '../commands/define.ts';
import { createTrip, readTripMeta } from './model.ts';
import { TripSession } from './session.ts';
import { localDateFor } from './schema.ts';

const human: Actor = { kind: 'human', id: 'host-1', name: 'Host' };
const agent: Actor = { kind: 'agent', id: 'agent-1', name: 'Agent' };
function make(agentMode: 'solo' | 'together' = 'together') {
  let n = 0;
  const doc = createTrip({ title: 'Bangkok trip', city: 'bangkok', timeZone: 'Asia/Bangkok', agentMode, newId: () => `id-${++n}` });
  return new TripSession(doc, { newId: () => `id-${++n}` });
}
function expectError(fn: () => unknown, code: CommandError['code']) {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(CommandError); expect((e as CommandError).code).toBe(code); return; }
  throw new Error(`Expected ${code}`);
}

describe('MOT-10 schema', () => {
  it('stage and task status are independent', () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(human, 'trip_card_create', { kind: 'task', title: 'Dinner', stage: 'explore' });
    s.execute(human, 'trip_task_set_status', { id, status: 'done' });
    const read = s.execute<{ cards: { stage: string; status?: string }[] }>(human, 'trip_read');
    expect(read.cards[0]).toMatchObject({ stage: 'explore', status: 'done' });
  });
  it('rejects status on a non-task and duplicate validation at the boundary', () => {
    const s = make();
    expectError(() => s.execute(human, 'trip_card_create', { kind: 'place', title: 'X', status: 'done' }), 'invalid_input');
  });
  it('Today date is deterministic in the destination zone', () => {
    // 2026-01-01T17:30Z is already 2026-01-02 in Bangkok (UTC+7).
    expect(localDateFor(new Date('2026-01-01T17:30:00Z'), 'Asia/Bangkok')).toBe('2026-01-02');
    expect(localDateFor(new Date('2026-01-01T17:30:00Z'), 'UTC')).toBe('2026-01-01');
  });
  it('meta round-trips with a board identity', () => {
    const s = make();
    expect(readTripMeta(s.doc)).toMatchObject({ city: 'bangkok', timeZone: 'Asia/Bangkok', kind: 'traveler' });
    expect(s.boardId).toMatch(/^id-/);
  });
});

describe('MOT-11/12 revisions, session, undo', () => {
  it('revision strictly increases across edit and undo, and never rewinds', () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(human, 'trip_card_create', { kind: 'note', title: 'A' });
    const r1 = s.boardRev; const c1 = s.cardRev(id);
    s.execute(human, 'trip_card_update', { id, title: 'B' });
    expect(s.boardRev).toBeGreaterThan(r1); expect(s.cardRev(id)).toBeGreaterThan(c1);
    const r2 = s.boardRev;
    expect(s.undo(human.id)).toBe(true);
    expect(s.boardRev).toBeGreaterThan(r2);
    // Old token must not match again after undo returns to earlier content.
    expect(s.token([id]).cardRevs[id]).not.toBe(c1);
  });
  it('agents read only in Solo mode; a person undo never removes agent work', () => {
    const solo = make('solo');
    expectError(() => solo.execute(agent, 'trip_card_create', { kind: 'note', title: 'X' }), 'solo_mode');
    const s = make();
    const a = s.execute<{ id: string }>(agent, 'trip_card_create', { kind: 'note', title: 'Agent card' });
    s.execute(human, 'trip_card_create', { kind: 'note', title: 'Human card' });
    expect(s.undo(human.id)).toBe(true);
    const read = s.execute<{ cards: { id: string }[] }>(human, 'trip_read');
    expect(read.cards.map((c) => c.id)).toContain(a.id);
    expect(read.cards).toHaveLength(1);
  });
  it('validates before writing: a failing command leaves nothing partial', () => {
    const s = make();
    expectError(() => s.execute(human, 'trip_task_set_status', { id: 'missing', status: 'done' }), 'not_found');
    expect(s.execute<{ cards: unknown[] }>(human, 'trip_read').cards).toHaveLength(0);
  });
});
