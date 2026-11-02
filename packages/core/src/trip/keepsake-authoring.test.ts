import { describe, expect, it } from 'vitest';
import * as core from '../index.ts';
import { strFromU8, unzipSync } from 'fflate';

const person = { kind: 'human' as const, id: 'traveler', name: 'Traveler' };
const agent = { kind: 'agent' as const, id: 'assistant', name: 'Assistant' };
const original = { id: 'blue', hash: 'a'.repeat(64), mime: 'image/png', role: 'original' as const, caption: 'Original source caption', credit: 'Synthetic fixture', rightsStatus: 'approved' as const };
const replacement = { ...original, id: 'orange', hash: 'b'.repeat(64), caption: 'Different source caption' };
function fixture() {
  const session = new core.TripSession(core.createTrip({ title: 'Authored memories', city: 'Aspen', timeZone: 'America/Denver' }));
  const create = (title: string, kind: core.TripCard['kind'] = 'photo') => session.execute<{ id: string }>(person, 'trip_card_create', { kind, title, scope: 'stay' }).id;
  const first = create('First photograph'), second = create('Same bytes, different story');
  session.execute(person, 'trip_asset_attach', { cardId: first, asset: original });
  session.execute(person, 'trip_asset_attach', { cardId: second, asset: original });
  return { session, first, second, create };
}
const caption = (s: core.TripSession, cardId: string, format: 'postcard' | 'memory', text: string) => s.execute(person, 'trip_keepsake_caption', { cardId, format, caption: text });
const draft = (s: core.TripSession, cardId: string) => (core.readCard(s.parts, cardId) as core.TripCard & { keepsakes?: { postcard?: { caption?: string; photoChanged?: boolean }; memory?: { caption?: string; photoChanged?: boolean } } })?.keepsakes;
const selected = (s: core.TripSession) => (core.readTripMeta(s.doc) as core.TripMeta & { keepsakeSelection?: { cardId: string; format: string } }).keepsakeSelection;

describe('owner-selected trip-item/output caption contract', () => {
  it('preserves authored text, authored empty and independent formats/cards through Undo and native reopen', () => {
    const { session: s, first, second } = fixture();
    expect(draft(s, first)).toBeUndefined();
    caption(s, first, 'postcard', '  Our own words — 山\nSecond line  ');
    caption(s, first, 'memory', 'A different memory-page caption');
    caption(s, second, 'postcard', 'Their own story');
    caption(s, first, 'postcard', '');
    expect(draft(s, first)?.postcard?.caption).toBe('');
    s.undo(person.id);
    expect(draft(s, first)?.postcard?.caption).toBe('  Our own words — 山\nSecond line  ');
    s.redo(person.id);
    s.execute(person, 'trip_keepsake_select', { cardId: first, format: 'memory' });
    const reopened = new core.TripSession(core.loadTrip(core.encodeTrip(s.doc)));
    expect(draft(reopened, first)?.postcard?.caption).toBe('');
    expect(draft(reopened, first)?.memory?.caption).toBe('A different memory-page caption');
    expect(draft(reopened, second)?.postcard?.caption).toBe('Their own story');
    expect(selected(reopened)).toEqual({ cardId: first, format: 'memory' });
    expect(core.readAsset(s.parts, original.id)).toEqual(original);
  });

  it('duplicates permitted captions into an independent card identity', () => {
    const { session: s, first } = fixture();
    caption(s, first, 'postcard', 'Original wording');
    const copy = s.execute<{ id: string }>(person, 'trip_board_duplicate', { sourceCardId: first });
    expect(draft(s, copy.id)?.postcard?.caption).toBe('Original wording');
    caption(s, copy.id, 'postcard', 'Copy wording');
    expect(draft(s, first)?.postcard?.caption).toBe('Original wording');
    expect(copy.id).not.toBe(first);
  });

  it('rejects unauthorized, missing, private and oversized edits before mutation', () => {
    const { session: s, first } = fixture();
    const secret = s.execute<{ id: string }>(person, 'trip_card_create', { kind: 'photo', scope: 'private', assetIds: [original.id] }).id;
    caption(s, first, 'postcard', 'Kept');
    const before = core.encodeTrip(s.doc), revision = s.boardRev;
    for (const [actor, input] of [[agent, { cardId: first, format: 'postcard', caption: 'Override' }], [person, { cardId: 'missing', format: 'postcard', caption: 'Bad' }], [person, { cardId: secret, format: 'postcard', caption: 'PRIVATE CANARY' }], [person, { cardId: first, format: 'postcard', caption: 'x'.repeat(1001) }], [person, { cardId: first, format: 'postcard', caption: '\ud800' }]] as const) {
      expect(() => s.execute(actor, 'trip_keepsake_caption', input)).toThrow();
    }
    expect(core.encodeTrip(s.doc)).toEqual(before);
    expect(s.boardRev).toBe(revision);
  });
});

it('keeps item/output selection in native packages and removes private selection and captions from shared bytes', async () => {
  const s = new core.TripSession(core.createTrip({ title: 'Native captions', city: 'Aspen', timeZone: null }));
  const id = s.execute<{ id: string }>(person, 'trip_card_create', { kind: 'photo', title: 'Native image', scope: 'stay' }).id;
  const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  const media = { id: 'native-image', hash: await core.sha256Hex(bytes), mime: 'image/png', role: 'original' as const };
  s.execute(person, 'trip_asset_attach', { cardId: id, asset: media });
  caption(s, id, 'postcard', 'PRIVATE AFTER SCOPE CHANGE');
  s.execute(person, 'trip_keepsake_select', { cardId: id, format: 'postcard' });
  const restored = await core.importTripPackage(await core.exportTripPackage(s.doc, new Map([[media.id, bytes]]), { variant: 'private' }));
  const reopened = new core.TripSession(restored.doc);
  expect(selected(reopened)).toEqual({ cardId: id, format: 'postcard' });
  expect(draft(reopened, id)?.postcard?.caption).toBe('PRIVATE AFTER SCOPE CHANGE');
  expect(restored.assets.get(media.id)).toEqual(bytes);
  s.execute(person, 'trip_card_update', { id, scope: 'private' });
  const shared = await core.exportTripPackage(s.doc, new Map(), { variant: 'stay' });
  const readable = strFromU8(unzipSync(shared)['trip.json']!);
  expect(readable).not.toContain('PRIVATE AFTER SCOPE CHANGE');
  expect(readable).not.toContain(id);
  expect(JSON.parse(readable).meta.keepsakeSelection).toBeUndefined();
  const agentView = s.execute<{ cards: unknown[] }>(agent, 'trip_read');
  expect(JSON.stringify(agentView)).not.toContain('PRIVATE AFTER SCOPE CHANGE');
});

describe('explicit replacement uses existing item links', () => {
  it('replaces the current image and linked cover only; keeps source metadata, captions and independent uses', () => {
    const { session: s, first, second } = fixture();
    caption(s, first, 'postcard', 'Our wording');
    caption(s, first, 'memory', '');
    const linked = s.execute<{ id: string }>(person, 'trip_presentation_create', { cardId: first, assetId: original.id, scope: 'stay', magazineRole: 'backdrop' }).id;
    const independent = s.execute<{ id: string }>(person, 'trip_presentation_create', { assetId: original.id, scope: 'stay', magazineRole: 'foreground' }).id;
    const another = s.execute<{ id: string }>(person, 'trip_presentation_create', { cardId: second, assetId: original.id, scope: 'stay' }).id;
    s.execute(person, 'trip_asset_replace', { cardId: first, expectedAssetId: original.id, asset: replacement });
    expect(core.readCard(s.parts, first)?.assetIds).toEqual([replacement.id]);
    expect(core.readCard(s.parts, second)?.assetIds).toEqual([original.id]);
    expect(core.readPresentation(s.parts, linked)?.assetId).toBe(replacement.id);
    expect(core.readPresentation(s.parts, independent)?.assetId).toBe(original.id);
    expect(core.readPresentation(s.parts, another)?.assetId).toBe(original.id);
    expect(draft(s, first)).toEqual({ postcard: { caption: 'Our wording', photoChanged: true }, memory: { caption: '', photoChanged: true } });
    expect(core.readAsset(s.parts, original.id)).toEqual(original);
    expect(core.readAsset(s.parts, replacement.id)?.derivedFrom).toBeUndefined();
    s.undo(person.id);
    expect(core.readCard(s.parts, first)?.assetIds).toEqual([original.id]);
    expect(core.readPresentation(s.parts, linked)?.assetId).toBe(original.id);
    expect(draft(s, first)?.postcard?.photoChanged).toBeUndefined();
    s.redo(person.id);
    expect(core.readPresentation(s.parts, linked)?.assetId).toBe(replacement.id);
  });

  it('rejects stale, mismatched, non-image or immutable-ID replacement as an atomic no-op', () => {
    const { session: s, first } = fixture();
    const before = core.encodeTrip(s.doc), revision = s.boardRev;
    for (const input of [
      { cardId: first, expectedAssetId: 'stale', asset: replacement },
      { cardId: 'missing', expectedAssetId: original.id, asset: replacement },
      { cardId: first, expectedAssetId: original.id, asset: { ...replacement, mime: 'text/html' } },
      { cardId: first, expectedAssetId: original.id, asset: { ...replacement, id: original.id } },
    ]) expect(() => s.execute(person, 'trip_asset_replace', input)).toThrow();
    expect(core.encodeTrip(s.doc)).toEqual(before);
    expect(s.boardRev).toBe(revision);
  });
});

it('keeps authored material discoverable across lanes without turning source prose or art into a memory', () => {
  const { session: s, create } = fixture();
  const taskPhoto = create('A photo on a planning card', 'task');
  s.execute(person, 'trip_asset_attach', { cardId: taskPhoto, asset: original });
  const placeNote = s.execute<{ id: string }>(person, 'trip_card_create', { kind: 'place', title: 'A place', travelerNote: 'My own recollection', provenance: 'fcc' }).id;
  const sourceOnly = s.execute<{ id: string }>(person, 'trip_card_create', { kind: 'place', title: 'Source article', body: 'Published source text', provenance: 'fcc' }).id;
  const secret = s.execute<{ id: string }>(person, 'trip_card_create', { kind: 'note', body: 'PRIVATE CANARY', scope: 'private' }).id;
  for (const stage of core.STAGES) {
    s.execute(person, 'trip_card_move', { id: taskPhoto, stage });
    const ids = core.memoryShortlist(s, { limit: 500 }).items.map(item => item.cardId);
    expect(ids).toContain(taskPhoto);
    expect(ids).toContain(placeNote);
    expect(ids).not.toContain(sourceOnly);
    expect(ids).not.toContain(secret);
  }
  s.execute(person, 'trip_memory_react', { cardId: taskPhoto, reaction: 'skip' });
  const reactions = core.readTripMeta(s.doc).memoryWorkflow?.reactions;
  expect(core.memoryShortlist(s, { reactions }).skipped).toContain(taskPhoto);
});
