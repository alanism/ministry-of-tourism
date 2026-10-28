// Regression tests for the 28 Oct build review's "fix next" items #8 and #11.
import { describe, expect, it } from 'vitest';
import type { Actor } from '../doc/model.ts';
import { CommandError } from '../commands/define.ts';
import { createTrip } from './model.ts';
import { TripSession } from './session.ts';
import { applyProposal, type Proposal } from './proposals.ts';
import { createGuestCopy, keepGuestVersions, planGuideUpdate } from './lineage.ts';

const you: Actor = { kind: 'human', id: 'you', name: 'You' };
const host: Actor = { kind: 'human', id: 'host', name: 'Host' };
let n = 0; const nid = () => `n-${++n}`;
const make = (kind: 'traveler' | 'host_guide' = 'traveler') => new TripSession(createTrip({ title: 'T', city: 'bangkok', timeZone: 'Asia/Bangkok', kind, newId: nid }), { newId: nid });
const body = (s: TripSession, id: string) => s.execute<{ cards: { id: string; body: string }[] }>(you, 'trip_read').cards.find((c) => c.id === id)!.body;

describe('#8 partial approval leaves the rest approvable', () => {
  function setup() {
    const s = make();
    const a = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'A', body: 'a0' }).id;
    const b = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'B', body: 'b0' }).id;
    const p: Proposal = { id: 'p-8', boardId: s.boardId, token: s.token([a, b]), sources: [], reason: 'r', author: 'agent:x', status: 'proposed',
      ops: [{ command: 'trip_card_update', input: { id: a, body: 'a1' } }, { command: 'trip_card_update', input: { id: b, body: 'b1' } }, { command: 'trip_card_update', input: { id: a, title: 'A2' } }] };
    return { s, a, b, p };
  }
  it('approves op 0, then the remaining ops, including another change to the same card', () => {
    const { s, a, b, p } = setup();
    expect(applyProposal(s, you, p, [0]).appliedOps).toBe(1);
    expect(applyProposal(s, you, p, [1, 2]).appliedOps).toBe(2);
    expect(body(s, a)).toBe('a1'); expect(body(s, b)).toBe('b1');
  });
  it('replaying an approved op changes nothing, and a full replay is a no-op', () => {
    const { s, p } = setup();
    applyProposal(s, you, p, [0]);
    const rev = s.boardRev;
    expect(applyProposal(s, you, p, [0])).toMatchObject({ appliedOps: 0, alreadyApplied: true });
    applyProposal(s, you, p);
    expect(applyProposal(s, you, p)).toMatchObject({ appliedOps: 0, alreadyApplied: true });
    expect(s.boardRev).toBe(rev + 1);
  });
  it("still refuses the rest when the person edited a covered card in between", () => {
    const { s, b, p } = setup();
    applyProposal(s, you, p, [0]);
    s.execute(you, 'trip_card_update', { id: b, body: 'mine' });
    expect(() => applyProposal(s, you, p, [1])).toThrowError(CommandError);
    expect(body(s, b)).toBe('mine');
  });
});

describe('#11 a guest can keep their version of a guide card', () => {
  it('keep mine clears the conflict until the host changes the card again', () => {
    const g = make('host_guide');
    const card = g.execute<{ id: string }>(host, 'trip_card_create', { kind: 'place', title: 'Market', body: 'Go early', scope: 'guide', provenance: 'host' }).id;
    const guestDoc = createGuestCopy(g.doc);
    const gs = new TripSession(guestDoc);
    gs.execute(you, 'trip_card_update', { id: card, body: 'We went at noon' });
    g.execute(host, 'trip_card_update', { id: card, body: 'Go early, before 9' });
    expect(planGuideUpdate(guestDoc, g.doc).map((p) => p.kind)).toEqual(['conflict']);
    expect(keepGuestVersions(gs, you, guestDoc, g.doc, new Set([card]))).toBe(1);
    expect(planGuideUpdate(guestDoc, g.doc)).toEqual([]);
    expect(body(gs, card)).toBe('We went at noon');
    g.execute(host, 'trip_card_update', { id: card, body: 'Closed on Mondays' });
    expect(planGuideUpdate(guestDoc, g.doc).map((p) => p.kind)).toEqual(['conflict']);
  });
});
