import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { buildMagazine, createTrip, encodeTrip, readAllCards, readAsset, readPresentations, TripSession } from '@mot/core';
const storage = vi.hoisted(() => ({ values: new Map<string, Blob>(), fail: false }));
vi.mock('../state/blobs', () => {
  const hashBlob = async (blob: Blob) => Buffer.from(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toString('hex');
  return { hashBlob, getBlob: async (hash: string) => storage.values.get(hash) ?? null, putBlob: async (blob: Blob) => { if (storage.fail) throw Error('Fixture storage full'); storage.values.set(await hashBlob(blob), blob); } };
});
import { storeTripBlob, assetBytes } from './trip-assets';
import { useBoardImageInMagazine } from './magazine-board-image';
const actor = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const bytes = readFileSync(new URL('../../public/assets/photo-illustration/fashion-reference.png', import.meta.url));
async function setup(fail = false) {
  storage.fail = fail;
  const session = new TripSession(createTrip({ title: 'Trip', city: 'Copenhagen', timeZone: 'Europe/Copenhagen' }));
  const blob = new Blob([bytes], { type: 'image/png' }), { hash } = await storeTripBlob(blob);
  session.executeAll(actor, [
    { command: 'trip_asset_register', input: { asset: { id: 'local-image', hash, mime: 'image/png', role: 'original', width: 431, height: 433, caption: 'Downloaded portrait' } } },
    { command: 'trip_presentation_create', input: { assetId: 'local-image', surface: 'board', x: .1, y: .1, width: .2, height: .2, crop: [0, 0, 1, 1], rotation: 0, zIndex: 1, locked: false, scope: 'private' } },
  ]);
  return { session, presentation: readPresentations(session.parts)[0]! };
}
afterEach(() => { storage.values.clear(); storage.fail = false; vi.restoreAllMocks(); });
it('reuses the original local asset as a private Remember photo, without a provider or invented AI provenance', async () => {
  const { session, presentation } = await setup(), original = readAsset(session.parts, 'local-image');
  const network = vi.spyOn(globalThis, 'fetch');
  const result = await useBoardImageInMagazine(session, actor, presentation.id, new AbortController().signal);
  expect(result.persisted).toBe(true); expect(network).not.toHaveBeenCalled();
  expect(readAsset(session.parts, 'local-image')).toEqual(original); expect(readAsset(session.parts, 'local-image')?.generated).toBeUndefined();
  expect(readPresentations(session.parts)).toEqual([presentation]);
  const [card] = readAllCards(session.parts);
  expect(card).toMatchObject({ kind: 'photo', scope: 'private', stage: 'remember', title: 'Downloaded portrait', assetIds: ['local-image'] });
  expect(buildMagazine(session.doc, { variant: 'stay' }).selection!.assets).toHaveLength(0);
  const personal = buildMagazine(session.doc, { variant: 'personal', assetUrls: new Map([['local-image', 'data:image/png;base64,' + bytes.toString('base64')]]), assetDimensions: new Map([['local-image', { width: 431, height: 433 }]]) });
  expect(personal.selection!.assets.find(asset => asset.id === 'local-image')!.pageIds.length).toBeGreaterThan(0);
  expect((await assetBytes(session.doc)).get('local-image')).toEqual(new Uint8Array(bytes));
  expect(session.undo(actor.id)).toBe(true); expect(readAllCards(session.parts)).toHaveLength(0); expect(readPresentations(session.parts)).toEqual([presentation]);
});
it('rejects cancellation, missing selections, non-human actors and duplicate magazine use without changing the board', async () => {
  const { session, presentation } = await setup(); const before = encodeTrip(session.doc), abort = new AbortController(); abort.abort();
  for (const [who, id, signal] of [[actor, presentation.id, abort.signal], [actor, 'gone', new AbortController().signal], [{ kind: 'agent', id: 'muse', name: 'Muse' }, presentation.id, new AbortController().signal]] as const) {
    await expect(useBoardImageInMagazine(session, who as typeof actor, id, signal)).rejects.toThrow(); expect(encodeTrip(session.doc)).toEqual(before);
  }
  await useBoardImageInMagazine(session, actor, presentation.id, new AbortController().signal); const added = encodeTrip(session.doc);
  await expect(useBoardImageInMagazine(session, actor, presentation.id, new AbortController().signal)).rejects.toThrow(/already/i); expect(encodeTrip(session.doc)).toEqual(added);
});
it('reports tab-only storage honestly and retains recoverable bytes without a new generation', async () => {
  const { session, presentation } = await setup(true);
  expect(await useBoardImageInMagazine(session, actor, presentation.id, new AbortController().signal)).toMatchObject({ persisted: false });
  expect(readAllCards(session.parts)).toHaveLength(1); expect((await assetBytes(session.doc)).get('local-image')).toEqual(new Uint8Array(bytes));
});
