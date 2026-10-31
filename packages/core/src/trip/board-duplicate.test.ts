import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createTrip, readAllCards, readCard, readPresentation, writeAsset } from './model.ts';
import { TripSession } from './session.ts';
import { captureSameBoardClipboard, parseSameBoardClipboard, resolveSameBoardClipboard } from './board-duplicate.ts';
import { boardAssetRect, boardCardRect, compareBoardObjects } from './board-geometry.ts';
import type { Actor } from '../doc/model.ts';

// compareBoardObjects is typed by the existing helper module; the local alias below only
// names the object shape already accepted there (kind 'card' | 'asset') for test literals.
type BoardObject = Parameters<typeof compareBoardObjects>[0];
const you: Actor = { kind: 'human', id: 'traveler', name: 'Traveler' };
const agent: Actor = { kind: 'agent', id: 'agent', name: 'Agent' };
const HASH = 'a'.repeat(64);

function make(newId?: () => string) {
  let i = 0;
  return new TripSession(createTrip({ title: 'Trip', city: 'Lisbon', timeZone: 'Europe/Lisbon' }), { newId: newId ?? (() => `id-${++i}`) });
}
function seedCard(s: TripSession) {
  const card = s.execute<{ id: string }>(you, 'trip_card_create', {
    kind: 'place', title: 'Gallery', body: 'Meet at 10.', stage: 'plan', day: '2026-11-02', time: '10:30', scope: 'private',
    source: { id: 'external:gallery', retrievedAt: '2026-01-01T00:00:00Z' }, sourceText: 'Opening information', travelerNote: 'Allow an hour',
    currentFacts: [{ field: 'hours', value: '10-18', evidenceUrl: 'https://venue.example/hours', observedAt: '2026-01-01' }],
    booking: { status: 'confirmed', reference: 'SECRET-REF' }, x: 1000, y: 800, boardWidth: 1200, boardHeight: 900, boardStack: 7,
  });
  s.execute(you, 'trip_asset_attach', { cardId: card.id, asset: { id: 'asset-1', hash: HASH, mime: 'image/png', role: 'original', credit: 'FCC artist', rightsStatus: 'approved' } });
  return card.id;
}
const state = (s: TripSession) => Y.encodeStateAsUpdate(s.doc);

describe('trip_board_duplicate', () => {
  it('duplicates a card at 120/120 with one undo/redo step, preserving permitted fields and stripping authority', () => {
    const s = make(); const sourceId = seedCard(s);
    const copy = s.execute<{ id: string }>(you, 'trip_board_duplicate', { sourceCardId: sourceId });
    expect(copy.id).not.toBe(sourceId);
    const copied = readCard(s.parts, copy.id)!;
    expect(copied).toMatchObject({ title: 'Gallery', body: 'Meet at 10.', scope: 'private', stage: 'plan', day: '2026-11-02', time: '10:30', x: 1120, y: 920, boardStack: 7, assetIds: ['asset-1'], sourceText: 'Opening information', travelerNote: 'Allow an hour' });
    expect(copied.source?.id).toBe('external:gallery');
    expect(copied.currentFacts).toHaveLength(1);
    expect(copied.booking).toBeUndefined(); expect(copied.bookingAttention).toBeUndefined(); expect(copied.lineage).toBeUndefined();
    expect(readCard(s.parts, sourceId)!.booking?.reference).toBe('SECRET-REF');
    expect(s.undo(you.id)).toBe(true); expect(readCard(s.parts, copy.id)).toBeUndefined(); expect(readCard(s.parts, sourceId)).toBeDefined();
    expect(s.redo(you.id)).toBe(true); expect(readCard(s.parts, copy.id)!.title).toBe('Gallery');
  });
  it('keeps private scope, denies agents, and leaves bytes identical on missing media or ID collision', () => {
    const s = make(); const sourceId = seedCard(s);
    expect(() => s.execute(agent, 'trip_board_duplicate', { sourceCardId: sourceId })).toThrow(/person/);
    const orphan = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'photo', title: 'Orphan', assetIds: ['missing-asset'], x: 0, y: 0 });
    const before = state(s);
    expect(() => s.execute(you, 'trip_board_duplicate', { sourceCardId: orphan.id })).toThrow(/Missing media/);
    expect(state(s)).toEqual(before);
    let calls = 0;
    const colliding = make(() => (++calls === 1 ? 'fixed' : 'fixed'));
    const first = colliding.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'One' });
    const beforeCollision = state(colliding);
    expect(() => colliding.execute(you, 'trip_board_duplicate', { sourceCardId: first.id })).toThrow(/already exists/);
    expect(state(colliding)).toEqual(beforeCollision); expect(readAllCards(colliding.parts)).toHaveLength(1);
  });
  it('rejects a dangling derivedFrom ancestor and a derivedFrom cycle before any write', () => {
    const s = make(); const sourceId = seedCard(s);
    writeAsset(s.parts, { id: 'asset-dangling', hash: HASH, mime: 'image/png', role: 'original', credit: 'FCC artist', rightsStatus: 'approved', derivedFrom: 'missing-ancestor' } as never);
    writeAsset(s.parts, { id: 'asset-cycle-a', hash: HASH, mime: 'image/png', role: 'original', credit: 'FCC artist', rightsStatus: 'approved', derivedFrom: 'asset-cycle-b' } as never);
    writeAsset(s.parts, { id: 'asset-cycle-b', hash: HASH, mime: 'image/png', role: 'original', credit: 'FCC artist', rightsStatus: 'approved', derivedFrom: 'asset-cycle-a' } as never);
    const dangling = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'photo', title: 'Dangling', assetIds: ['asset-dangling'], x: 0, y: 0 });
    const cyclic = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'photo', title: 'Cyclic', assetIds: ['asset-cycle-a'], x: 0, y: 0 });
    const before = state(s);
    expect(() => s.execute(you, 'trip_board_duplicate', { sourceCardId: dangling.id })).toThrow(/Missing media missing-ancestor/);
    expect(state(s)).toEqual(before);
    expect(() => s.execute(you, 'trip_board_duplicate', { sourceCardId: cyclic.id })).toThrow(/cycle/);
    expect(state(s)).toEqual(before);
    expect(readCard(s.parts, sourceId)).toBeDefined();
  });
  it('rejects an out-of-board copy without changing anything', () => {
    const s = make(); const edge = s.execute<{ id: string }>(you, 'trip_card_create', { kind: 'note', title: 'Edge', x: 8800, y: 9100 });
    const before = state(s);
    expect(() => s.execute(you, 'trip_board_duplicate', { sourceCardId: edge.id })).toThrow(/fit/);
    expect(state(s)).toEqual(before);
  });
  it('duplicates a board asset placement sharing the asset, and rejects locked or magazine placements unchanged', () => {
    const s = make(); seedCard(s);
    const placed = s.execute<{ id: string }>(you, 'trip_presentation_create', { assetId: 'asset-1', surface: 'board', x: 0.1, y: 0.1, width: 0.2, height: 0.1, crop: [0, 0, 1, 1], rotation: 0, zIndex: 4, locked: false, scope: 'private' });
    const copy = s.execute<{ id: string }>(you, 'trip_board_duplicate', { sourcePresentationId: placed.id });
    const copied = readPresentation(s.parts, copy.id)!;
    expect(copied).toMatchObject({ assetId: 'asset-1', surface: 'board', zIndex: 4, scope: 'private', crop: [0, 0, 1, 1] });
    expect(copied.x).toBeCloseTo(0.112); expect(copied.y).toBeCloseTo(0.112);
    s.execute(you, 'trip_presentation_update', { id: placed.id, locked: true });
    const magazine = s.execute<{ id: string }>(you, 'trip_presentation_create', { assetId: 'asset-1', x: 0.2, y: 0.2, width: 0.2, height: 0.2 });
    const before = state(s);
    expect(() => s.execute(you, 'trip_board_duplicate', { sourcePresentationId: placed.id })).toThrow(/locked/);
    expect(() => s.execute(you, 'trip_board_duplicate', { sourcePresentationId: magazine.id })).toThrow(/magazine/);
    expect(state(s)).toEqual(before);
  });
});

describe('existing board geometry helpers and same-board clipboard', () => {
  it('uses boardCardRect and boardAssetRect in one rectangle space', () => {
    expect(boardCardRect({ x: 100, y: 200 })).toEqual({ x: 100, y: 200, width: 1200, height: 900, stack: 0 });
    expect(boardCardRect({ x: 100, y: 200, boardWidth: 800, boardHeight: 600, boardStack: 3 })).toEqual({ x: 100, y: 200, width: 800, height: 600, stack: 3 });
    expect(boardAssetRect({ surface: 'board', assetId: 'asset-1', x: 0.08, y: 0.08, width: 0.45, height: 0.315, zIndex: 0, rotation: 0 })).toEqual({ x: 800, y: 800, width: 4500, height: 3150, stack: 0 });
    expect(boardAssetRect({ surface: 'magazine', assetId: 'asset-1', x: 0.08, y: 0.08, width: 0.45, height: 0.315, zIndex: 0, rotation: 0 })).toBeNull();
    expect(() => boardAssetRect({ surface: 'board', assetId: 'asset-1', cardId: 'card-1', x: 0, y: 0, width: 0.1, height: 0.1, zIndex: 0, rotation: 0 })).toThrow(/cardId/);
  });
  it('orders with compareBoardObjects by stack, then kind, then id, independent of position', () => {
    const items: BoardObject[] = [{ kind: 'card', id: 'b', stack: 0 }, { kind: 'asset', id: 'a', stack: 0 }, { kind: 'card', id: 'a', stack: 0 }, { kind: 'asset', id: 'z', stack: -1 }];
    const sorted = [...items].sort(compareBoardObjects);
    expect(sorted.map((i) => `${i.kind}:${i.id}`)).toEqual(['asset:z', 'asset:a', 'card:a', 'card:b']);
    expect(items[0]!.id).toBe('b');
    expect(compareBoardObjects({ kind: 'asset', id: 'a', stack: 1 }, { kind: 'card', id: 'a', stack: 1 })).toBeLessThan(0);
  });
  it('resolves only against the capturing live source and rejects serialized or cross-board claims', () => {
    const s = make(); const sourceId = seedCard(s); const other = make();
    const source = { boardId: s.boardId, parts: s.parts };
    const clip = captureSameBoardClipboard(source, { sourceCardId: sourceId });
    expect(resolveSameBoardClipboard(source, clip)).toEqual({ sourceCardId: sourceId });
    expect(() => resolveSameBoardClipboard({ boardId: other.boardId, parts: other.parts }, clip)).toThrow(/native trip package/);
    expect(() => parseSameBoardClipboard(JSON.parse(JSON.stringify({ version: 1, boardId: s.boardId, ref: { sourceCardId: sourceId } })))).toThrow(/cannot prove its source/);
    s.execute(you, 'trip_card_delete', { id: sourceId });
    expect(() => resolveSameBoardClipboard(source, clip)).toThrow(/no longer/);
  });
});
