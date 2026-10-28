// MOT-16: first usable board with no network, keys or map service.
import { describe, expect, it } from 'vitest';
import type { Actor } from '../doc/model.ts';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';
import { boardProjection, todayProjection } from './projections.ts';
import { encodeTrip, loadTrip } from './persist.ts';

const you: Actor = { kind: 'human', id: 'you', name: 'You' };

describe('first usable board', () => {
  it('create, move, edit in Today view, reload: everything survives with one identity', () => {
    let n = 0; const nid = () => `b-${++n}`;
    const doc = createTrip({ title: 'Trip', city: 'bangkok', timeZone: 'Asia/Bangkok', newId: nid });
    const s = new TripSession(doc, { newId: nid });
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'task', title: 'Dinner', stage: 'plan', day: '2026-01-02' });
    s.execute(you, 'trip_card_move', { id, stage: 'explore' });
    // Edit through Today (same card id), then reload from bytes.
    const today = todayProjection(s.doc, new Date('2026-01-01T17:30:00Z'));
    expect(today.map((c) => c.id)).toEqual([id]);
    s.execute(you, 'trip_card_update', { id, title: 'Dinner at the market' });
    const reloaded = new TripSession(loadTrip(encodeTrip(doc)), { newId: nid });
    const board = boardProjection(reloaded.doc);
    expect(board.explore.map((c) => c.title)).toEqual(['Dinner at the market']);
    expect(board.plan).toEqual([]);
    expect(reloaded.boardId).toBe(s.boardId);
  });
  it('fails if a projection returns a stale revision', () => {
    let n = 0; const nid = () => `s-${++n}`;
    const s = new TripSession(createTrip({ title: 'T', city: 'bangkok', timeZone: 'Asia/Bangkok', newId: nid }), { newId: nid });
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'A' });
    const revBefore = boardProjection(s.doc).plan[0]!.rev;
    s.execute(you, 'trip_card_update', { id, title: 'B' });
    expect(boardProjection(s.doc).plan[0]!.rev).toBeGreaterThan(revBefore);
  });
});
