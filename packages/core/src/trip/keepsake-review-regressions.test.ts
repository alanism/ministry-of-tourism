import { expect, it } from 'vitest';
import * as core from '../index.ts';

const actor = { kind: 'human' as const, id: 'traveler', name: 'Traveler' };
const photo = { id: 'original', mime: 'image/png', hash: 'a'.repeat(64), role: 'original' as const };
function setup() {
  const session = new core.TripSession(core.createTrip({ title: 'Review regressions', city: 'Aspen', timeZone: null }));
  const { id } = session.execute<{ id: string }>(actor, 'trip_card_create', { kind: 'photo', title: 'Guest item', scope: 'guide' });
  session.execute(actor, 'trip_asset_attach', { cardId: id, asset: photo });
  return { session, id };
}

it('invalidates revision-bound work on authored captions, empty, Undo and Redo', () => {
  const { session: s, id } = setup();
  let previous = s.boardRev;
  const check = () => {
    expect(s.boardRev).toBeGreaterThan(previous);
    expect(core.cardRev(s.parts, id)).toBe(s.boardRev);
    previous = s.boardRev;
  };
  const token = core.tokenFor(s.parts, s.boardId, [id]);
  s.execute(actor, 'trip_keepsake_caption', { cardId: id, format: 'postcard', caption: 'Our wording' }); check();
  expect(core.tokenMatches(s.parts, s.boardId, token)).toBe(false);
  s.execute(actor, 'trip_keepsake_caption', { cardId: id, format: 'postcard', caption: '' }); check();
  s.undo(actor.id); check(); s.redo(actor.id); check();
});

it('guide updates preserve guest captions and blank values, marking changed media for review', () => {
  const { session: s, id } = setup();
  s.execute(actor, 'trip_keepsake_caption', { cardId: id, format: 'postcard', caption: 'Guest wording' });
  s.execute(actor, 'trip_keepsake_caption', { cardId: id, format: 'memory', caption: '' });
  const guest = core.readCard(s.parts, id)!;
  const { keepsakes: _drafts, ...host } = guest;
  s.execute(actor, 'trip_lineage_sync', { id, card: { ...host, title: 'Source update' } });
  expect(core.readCard(s.parts, id)?.keepsakes).toEqual(guest.keepsakes);
  const next = { ...photo, id: 'new-source-photo', hash: 'b'.repeat(64) };
  s.execute(actor, 'trip_asset_register', { asset: next });
  s.execute(actor, 'trip_lineage_sync', { id, card: { ...host, assetIds: [next.id], keepsakes: { postcard: { caption: 'HOST CAPTION CANARY' } } } });
  expect(core.readCard(s.parts, id)?.keepsakes).toEqual({ postcard: { caption: 'Guest wording', photoChanged: true }, memory: { caption: '', photoChanged: true } });
  s.undo(actor.id);
  expect(core.readCard(s.parts, id)?.keepsakes).toEqual(guest.keepsakes);
});

it('refuses missing or cyclic candidate ancestry before any replacement write', () => {
  for (const cycle of [false, true]) {
    const { session: s, id } = setup();
    s.execute(actor, 'trip_asset_register', { asset: { ...photo, id: 'parent', derivedFrom: cycle ? 'candidate' : 'missing-grandparent' } });
    const before = core.encodeTrip(s.doc), revision = s.boardRev;
    expect(() => s.execute(actor, 'trip_asset_replace', { cardId: id, expectedAssetId: photo.id, asset: { ...photo, id: 'candidate', derivedFrom: 'parent' } })).toThrow(/ancestor|cycle/i);
    expect(core.encodeTrip(s.doc)).toEqual(before);
    expect(s.boardRev).toBe(revision);
    expect(core.readCard(s.parts, id)?.assetIds).toEqual([photo.id]);
  }
});
