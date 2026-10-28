// Regression tests for the 28 Oct build review defects #2, #3, #4, #6 and #7.
// Each one broke a first-board protection; each test failed before its fix.
import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { Actor } from '../doc/model.ts';
import { CommandError } from '../commands/define.ts';
import { createTrip, readAsset, tripParts } from './model.ts';
import { TripSession } from './session.ts';
import { applyProposal, type Proposal } from './proposals.ts';
import { agentView, todayProjection } from './projections.ts';
import { tasksList, tripBriefRead } from './gateway.ts';
import { fakeProposal } from './agent-fake.ts';
import { exportTripPackage, sha256Hex } from './package.ts';
import { importTripPackage } from './import.ts';
import { createGuestCopy } from './lineage.ts';

const you: Actor = { kind: 'human', id: 'you', name: 'You' };
const agent: Actor = { kind: 'agent', id: 'agent:fake', name: 'Fake' };
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function make(kind: 'traveler' | 'host_guide' = 'traveler') {
  let n = 0; const nid = () => `p-${++n}`;
  return new TripSession(createTrip({ title: 'T', city: 'bangkok', timeZone: 'Asia/Bangkok', kind, newId: nid }), { newId: nid });
}
function proposal(s: TripSession, ops: Proposal['ops'], tokenIds: string[] = []): Proposal {
  return { id: `prop-${Math.random()}`, boardId: s.boardId, token: s.token(tokenIds), ops, sources: [], reason: 'r', author: agent.id, status: 'proposed' };
}
const titles = (s: TripSession) => s.execute<{ cards: { title: string }[] }>(you, 'trip_read').cards.map((c) => c.title);

describe('#2 proposals are atomic', () => {
  it('when a later op fails at run time, earlier ops do not land and the revision does not move', () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'A note' });
    const rev = s.boardRev;
    // Input schemas pass; the second op fails only when it runs (status is for tasks).
    const p = proposal(s, [
      { command: 'trip_card_create', input: { kind: 'note', title: 'Should not land' } },
      { command: 'trip_task_set_status', input: { id, status: 'done' } },
    ], [id]);
    expect(() => applyProposal(s, you, p)).toThrowError(CommandError);
    expect(titles(s)).toEqual(['A note']);
    expect(s.boardRev).toBe(rev);
  });
  it('an op on a card that does not exist lands nothing', () => {
    const s = make();
    const p = proposal(s, [
      { command: 'trip_card_create', input: { kind: 'note', title: 'Should not land' } },
      { command: 'trip_card_update', input: { id: 'missing-card', title: 'x' } },
    ], ['missing-card']);
    expect(() => applyProposal(s, you, p)).toThrowError(CommandError);
    expect(titles(s)).toEqual([]);
  });
  it('a multi-op proposal is one undo step and one revision bump', () => {
    const s = make();
    const rev = s.boardRev;
    const p = proposal(s, [
      { command: 'trip_card_create', input: { kind: 'note', title: 'One' } },
      { command: 'trip_card_create', input: { kind: 'note', title: 'Two' } },
    ]);
    applyProposal(s, you, p);
    expect(s.boardRev).toBe(rev + 1);
    // Proposals have their own undo (MOT-12/21); one step removes both ops.
    expect(s.execute<{ cards: unknown[] }>(you, 'trip_read').cards).toHaveLength(2);
    s.undo(`proposal:${p.id}`);
    expect(titles(s)).toEqual([]);
  });
});

describe('#3 stale check covers every card a proposal touches', () => {
  it('rejects an op on a card missing from the token, so a later edit is never overwritten', () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'Mine', body: 'v1' });
    const p = proposal(s, [{ command: 'trip_card_update', input: { id, body: 'agent text' } }], []);
    s.execute(you, 'trip_card_update', { id, body: 'my edit' });
    expect(() => applyProposal(s, you, p)).toThrowError(/older revision|not covered/);
    expect(s.execute<{ cards: { body: string }[] }>(you, 'trip_read').cards[0]!.body).toBe('my edit');
  });
  it('still applies when the token covers the touched card and nothing changed', () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'Mine', body: 'v1' });
    applyProposal(s, you, proposal(s, [{ command: 'trip_card_update', input: { id, body: 'agent text' } }], [id]));
    expect(s.execute<{ cards: { body: string }[] }>(you, 'trip_read').cards[0]!.body).toBe('agent text');
  });
});

describe('#4 private cards never reach the agent path', () => {
  function withSecret() {
    const s = make('host_guide');
    const secret = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'stay_fact', title: 'Door code 4821', scope: 'private', provenance: 'host' });
    const shared = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'place', title: 'Market', scope: 'guide', provenance: 'host' });
    return { s, secret: secret.id, shared: shared.id };
  }
  it('agent view, gateway tools and agent reads exclude private cards', () => {
    const { s } = withSecret();
    expect(JSON.stringify(agentView(s.doc))).not.toContain('4821');
    expect(JSON.stringify(tripBriefRead(s))).not.toContain('4821');
    expect(JSON.stringify(tasksList(s))).not.toContain('4821');
    expect(JSON.stringify(s.execute(agent, 'trip_read'))).not.toContain('4821');
    expect(JSON.stringify(fakeProposal(s))).not.toContain('4821');
  });
  it('rejects agent ops that change scope or touch a private card', () => {
    const { s, secret, shared } = withSecret();
    const rescope = proposal(s, [{ command: 'trip_card_update', input: { id: secret, scope: 'guide' } }], [secret]);
    expect(() => applyProposal(s, you, rescope)).toThrowError(CommandError);
    const touch = proposal(s, [{ command: 'trip_card_move', input: { id: secret, stage: 'explore' } }], [secret]);
    expect(() => applyProposal(s, you, touch)).toThrowError(CommandError);
    const widen = proposal(s, [{ command: 'trip_card_update', input: { id: shared, scope: 'private' } }], [shared]);
    expect(() => applyProposal(s, you, widen)).toThrowError(CommandError);
    expect(s.execute<{ cards: { id: string; scope: string }[] }>(you, 'trip_read').cards.find((c) => c.id === secret)!.scope).toBe('private');
  });
});

describe('#6 export keeps the traveler\'s own content and photos', () => {
  it('traveler cards default to stay scope, so a personal trip exports them', async () => {
    const s = make();
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Dinner by the river' });
    const files = unzipSync(await exportTripPackage(s.doc));
    expect(decode(files['trip.json']!)).toContain('Dinner by the river');
  });
  it('a host guide still defaults new cards to private', () => {
    const s = make('host_guide');
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Spare key' });
    expect(s.execute<{ cards: { scope: string }[] }>(you, 'trip_read').cards[0]!.scope).toBe('private');
  });
  it('a full backup includes private cards; the default package does not', async () => {
    const s = make();
    s.execute(you, 'trip_card_create', { kind: 'note', title: 'Passport copy', scope: 'private' });
    expect(decode(unzipSync(await exportTripPackage(s.doc))['trip.json']!)).not.toContain('Passport copy');
    expect(decode(unzipSync(await exportTripPackage(s.doc, new Map(), { includePrivate: true }))['trip.json']!)).toContain('Passport copy');
  });
  it('photo bytes and their metadata survive export and import', async () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'photo', title: 'River' });
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const asset = { id: 'asset-1', hash: await sha256Hex(bytes), mime: 'image/png', role: 'original' as const };
    s.execute(you, 'trip_asset_attach', { cardId: id, asset });
    const pkg = await exportTripPackage(s.doc, new Map([['asset-1', bytes]]));
    const manifest = JSON.parse(decode(unzipSync(pkg)['manifest.json']!)) as { assets: { mime: string }[] };
    expect(manifest.assets[0]!.mime).toBe('image/png');
    const { doc, assets } = await importTripPackage(pkg);
    expect(assets.get('asset-1')).toEqual(bytes);
    expect(readAsset(tripParts(doc), 'asset-1')).toMatchObject({ mime: 'image/png', hash: asset.hash });
  });
});

describe('guest copy honours the host\'s selection', () => {
  it('copies only the chosen guide cards, with their photo metadata', async () => {
    const s = make('host_guide');
    const keep = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'place', title: 'Welcome', scope: 'guide', provenance: 'host' });
    s.execute(you, 'trip_card_create', { kind: 'place', title: 'Riverside', scope: 'guide', provenance: 'host' });
    const bytes = new Uint8Array([1, 2, 3]);
    s.execute(you, 'trip_asset_attach', { cardId: keep.id, asset: { id: 'door', hash: await sha256Hex(bytes), mime: 'image/jpeg', role: 'original' } });
    const guest = createGuestCopy(s.doc, { cardIds: new Set([keep.id]) });
    const gs = new TripSession(guest);
    expect(gs.execute<{ cards: { title: string }[] }>(you, 'trip_read').cards.map((c) => c.title)).toEqual(['Welcome']);
    expect(readAsset(tripParts(guest), 'door')?.mime).toBe('image/jpeg');
  });
});

describe('#7 cards can be put on a day and taken off it', () => {
  it('sets and clears day and time, and Today follows', () => {
    const s = make();
    const { id } = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'Boat' });
    s.execute(you, 'trip_card_update', { id, day: '2026-11-13', time: '18:30' });
    const fri = new Date('2026-11-13T05:00:00Z');
    expect(todayProjection(s.doc, fri).map((c) => c.time)).toEqual(['18:30']);
    s.execute(you, 'trip_card_update', { id, day: null, time: null });
    expect(todayProjection(s.doc, fri)).toEqual([]);
  });
});
