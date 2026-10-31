import { afterEach, expect, it, vi } from 'vitest';
import { createTrip, encodeTrip, readAsset, readPresentations, readTripMeta, TripSession } from '@writers-board/core';
import type { Artwork } from '../artwork/catalog';
const blobControl = vi.hoisted(() => ({ stored: new Map<string, Blob>(), putImpl: null as null | ((blob: Blob) => Promise<unknown>) }));
vi.mock('../state/blobs', () => {
  const hashBlob = async (blob: Blob) => Buffer.from(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toString('hex');
  return { hashBlob, getBlob: async (hash: string) => blobControl.stored.get(hash) ?? null, putBlob: async (blob: Blob) => { if (blobControl.putImpl) return blobControl.putImpl(blob); blobControl.stored.set(await hashBlob(blob), blob); } };
});
import { placeBoardArtwork } from './board-artwork';
import { getTripBlob } from './trip-assets';
const actor = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const sha = async (bytes: Uint8Array) => Buffer.from(await crypto.subtle.digest('SHA-256', bytes as BufferSource)).toString('hex');
function pngBytes(width: number, height: number, tag = ''): Uint8Array {
  const extra = new TextEncoder().encode(tag);
  const bytes = new Uint8Array(33 + extra.length);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, width); view.setUint32(20, height); bytes[24] = 8; bytes[25] = 6;
  bytes.set(extra, 33);
  return bytes;
}
interface Fixture { art: Artwork; bytes: Uint8Array; url: string }
async function fixture(opts: { width?: number; height?: number; crop?: Artwork['crop']; rights?: 'approved' | 'unknown' | 'restricted'; tag?: string; hash?: string } = {}): Promise<Fixture> {
  const width = opts.width ?? 1200, height = opts.height ?? 800;
  const bytes = pngBytes(width, height, opts.tag ?? 'selected original');
  const thumb = 'https://foreignclubberscorespondence.web.app/preview.png', url = 'https://foreignclubberscorespondence.web.app/original.png';
  const art: Artwork = { id: 'fcc:barcelona:test', styleId: 'fcc-editorial', label: 'A source drawing', city: 'barcelona', subject: 'city-ink', thumb, src: thumb, original: url, width, height, crop: opts.crop ?? [0, 0, 0.5, 1], artRef: { assetId: 'fcc:barcelona:test', kind: 'original-art', category: 'city-ink', originCityId: 'barcelona', countryCode: 'ES', thumbnailUrl: thumb, renditionUrl: thumb, originalUrl: url, width, height, mimeType: 'image/png', hash: opts.hash ?? await sha(bytes), credit: 'The actual source artist', rightsStatus: opts.rights ?? 'restricted', source: { provider: 'fcc', sourceId: 'original-source', canonicalUrl: 'https://foreignclubberscorespondence.web.app/barcelona.html', cityId: 'barcelona', countryCode: 'ES', kind: 'artwork', retrievedAt: '2026-10-26', version: 'catalog-v3', origin: 'artwork' } } };
  return { art, bytes, url };
}
function setup(bytes: Uint8Array, width = 1200, height = 800) {
  const session = new TripSession(createTrip({ title: 'Trip', city: 'Bilbao', countryCode: 'ES', timeZone: null }));
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Blob([bytes as BlobPart], { type: 'image/png' })));
  vi.stubGlobal('fetch', fetchMock);
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })));
  return { session, fetchMock, close };
}
afterEach(() => { vi.unstubAllGlobals(); blobControl.stored.clear(); blobControl.putImpl = null; });
const signal = () => new AbortController().signal;

it('places only a private board presentation with cropped square geometry, credit, provenance and unchanged original bytes, as one Undo/Redo step', async () => {
  const { art, bytes, url } = await fixture();
  const { session, fetchMock } = setup(bytes);
  const committed = vi.fn();
  const result = await placeBoardArtwork(session, actor, art, signal(), { onCommitted: committed });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]![0]).toBe(url);
  expect(fetchMock.mock.calls[0]![1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
  const placed = readPresentations(session.parts);
  expect(placed).toHaveLength(1);
  expect(result.presentationId).toBeTruthy();
  expect(placed[0]!.id).toBe(result.presentationId);
  expect(placed[0]).toMatchObject({ surface: 'board', scope: 'private', rotation: 0, x: 0.012, y: 0.012, width: 0.18, height: 0.24, zIndex: 1 });
  expect(placed[0]!.crop).toEqual([0, 0, 0.5, 1]);
  expect(placed[0]!.cardId).toBeUndefined();
  const asset = readAsset(session.parts, placed[0]!.assetId!)!;
  expect(asset).toMatchObject({ width: 1200, height: 800, caption: 'A source drawing', credit: 'The actual source artist', rightsStatus: 'restricted', source: { id: art.id, url, sourceId: 'original-source', canonicalUrl: 'https://foreignclubberscorespondence.web.app/barcelona.html', retrievedAt: '2026-10-26', version: 'catalog-v3', cityId: 'barcelona', countryCode: 'ES' } });
  expect(new Uint8Array(await (await getTripBlob(asset.hash))!.arrayBuffer())).toEqual(bytes);
  expect(session.parts.cards.size).toBe(0); expect(readTripMeta(session.doc).city).toBe('Bilbao');
  expect(committed).toHaveBeenCalledTimes(1); expect(result.persisted).toBe(true);
  session.undo(actor.id); expect(readPresentations(session.parts)).toHaveLength(0); expect(session.parts.assets.size).toBe(0);
  session.redo(actor.id); expect(readPresentations(session.parts)).toHaveLength(1); expect(session.parts.assets.size).toBe(1);
});

it('accepts restricted and unknown rights without changing their policy', async () => {
  for (const rights of ['restricted', 'unknown'] as const) {
    const { art, bytes } = await fixture({ rights, tag: rights });
    const { session } = setup(bytes);
    await placeBoardArtwork(session, actor, art, signal());
    const asset = readAsset(session.parts, readPresentations(session.parts)[0]!.assetId!)!;
    expect(asset.rightsStatus).toBe(rights); expect(asset.credit).toBe('The actual source artist');
  }
});

it('fails hash and decoded-size checks all-or-nothing before any document or blob write', async () => {
  for (const mode of ['hash', 'decode', 'catalog'] as const) {
    const f = await fixture({ hash: mode === 'hash' ? '0'.repeat(64) : undefined, tag: mode });
    if (mode === 'catalog') { f.art.width = 999; f.art.artRef!.width = 999; }
    const { session } = setup(f.bytes);
    if (mode === 'decode') vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 800, close: () => undefined })));
    const before = encodeTrip(session.doc);
    await expect(placeBoardArtwork(session, actor, f.art, signal())).rejects.toThrow(/changed|size|match|refresh|Decoded/i);
    expect(encodeTrip(session.doc)).toEqual(before); expect(session.parts.assets.size).toBe(0); expect(blobControl.stored.size).toBe(0);
  }
});

it('rejects invalid origin, too-thin crop and stack overflow visibly with no new placement', async () => {
  const f = await fixture();
  const badOrigin = setup(f.bytes);
  await expect(placeBoardArtwork(badOrigin.session, actor, f.art, signal(), { origin: { x: Number.NaN, y: 120 } })).rejects.toThrow(/room|valid/i);
  expect(badOrigin.fetchMock).not.toHaveBeenCalled();
  expect(readPresentations(badOrigin.session.parts)).toHaveLength(0);
  const thinFixture = await fixture({ crop: [0, 0, 0.001, 1], tag: 'thin' });
  const thin = setup(thinFixture.bytes);
  await expect(placeBoardArtwork(thin.session, actor, thinFixture.art, signal())).rejects.toThrow(/outside|board|room|valid/i);
  expect(thin.fetchMock).not.toHaveBeenCalled();
  expect(readPresentations(thin.session.parts)).toHaveLength(0);
  const full = setup(f.bytes);
  full.session.executeAll(actor, [
    { command: 'trip_asset_register', input: { asset: { id: 'existing-asset', hash: 'a'.repeat(64), mime: 'image/png', role: 'original', width: 100, height: 100 } } },
    { command: 'trip_presentation_create', input: { assetId: 'existing-asset', surface: 'board', x: 0, y: 0, width: 0.1, height: 0.1, crop: [0, 0, 1, 1], rotation: 0, zIndex: 1000000, locked: false, scope: 'private' } },
  ]);
  await expect(placeBoardArtwork(full.session, actor, f.art, signal())).rejects.toThrow(/layer|stack/i);
  expect(readPresentations(full.session.parts)).toHaveLength(1); expect(full.session.parts.assets.size).toBe(1);
});

it('rejects nonfinite origins before any fetch', async () => {
  const f = await fixture();
  for (const origin of [{ x: Number.POSITIVE_INFINITY, y: 120 }, { x: 120, y: Number.NEGATIVE_INFINITY }]) {
    const attempt = setup(f.bytes);
    await expect(placeBoardArtwork(attempt.session, actor, f.art, signal(), { origin })).rejects.toThrow(/room|valid/i);
    expect(attempt.fetchMock).not.toHaveBeenCalled();
    expect(readPresentations(attempt.session.parts)).toHaveLength(0);
  }
});

it('rejects apparel, malformed URL and non-human actors before any fetch', async () => {
  const f = await fixture();
  const apparel = setup(f.bytes); const apparelArt = { ...f.art, subject: 'apparel', artRef: undefined };
  await expect(placeBoardArtwork(apparel.session, actor, apparelArt, signal())).rejects.toThrow(/apparel/i); expect(apparel.fetchMock).not.toHaveBeenCalled();
  const malformed = setup(f.bytes); const badArt = { ...f.art, src: 'not-a-url', thumb: 'not-a-url', original: undefined, artRef: undefined } as unknown as Artwork;
  await expect(placeBoardArtwork(malformed.session, actor, badArt, signal())).rejects.toThrow(); expect(malformed.fetchMock).not.toHaveBeenCalled();
  const agent = setup(f.bytes);
  await expect(placeBoardArtwork(agent.session, { kind: 'agent', id: 'bot', name: 'Bot' } as never, f.art, signal())).rejects.toThrow(/person|human/i); expect(agent.fetchMock).not.toHaveBeenCalled(); expect(createImageBitmap).not.toHaveBeenCalled();
});

it('cancels the response body for an unsupported MIME type before throwing', async () => {
  const f = await fixture();
  const attempt = setup(f.bytes);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(f.bytes); }, cancel() { cancelled = true; } });
  attempt.fetchMock.mockImplementation(async (_url: string, _init?: RequestInit) => new Response(stream, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  await expect(placeBoardArtwork(attempt.session, actor, f.art, signal())).rejects.toThrow(/supported image/i);
  expect(cancelled).toBe(true);
  expect(createImageBitmap).not.toHaveBeenCalled();
  expect(readPresentations(attempt.session.parts)).toHaveLength(0);
});

it('enforces the advertised length cap before reading and the actual streamed byte cap while reading', async () => {
  const f = await fixture();
  const advertised = setup(f.bytes);
  advertised.fetchMock.mockImplementation(async (_url: string, _init?: RequestInit) => new Response(new Blob([f.bytes as BlobPart], { type: 'image/png' }), { headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } }));
  await expect(placeBoardArtwork(advertised.session, actor, f.art, signal())).rejects.toThrow(/10 MiB|limit/i);
  expect(createImageBitmap).not.toHaveBeenCalled(); expect(readPresentations(advertised.session.parts)).toHaveLength(0);
  const streamed = setup(f.bytes);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(6 * 1024 * 1024)); controller.enqueue(new Uint8Array(6 * 1024 * 1024)); }, cancel() { cancelled = true; } });
  streamed.fetchMock.mockImplementation(async (_url: string, _init?: RequestInit) => new Response(stream, { headers: { 'content-type': 'image/png', 'content-length': '12' } }));
  await expect(placeBoardArtwork(streamed.session, actor, f.art, signal())).rejects.toThrow(/10 MiB|limit/i);
  expect(cancelled).toBe(true); expect(createImageBitmap).not.toHaveBeenCalled(); expect(readPresentations(streamed.session.parts)).toHaveLength(0);
});

it('does no work when pre-aborted and settles delayed decode cancellation, closing the bitmap with no writes', async () => {
  const f = await fixture();
  const pre = setup(f.bytes); const controller = new AbortController(); controller.abort();
  await expect(placeBoardArtwork(pre.session, actor, f.art, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(pre.fetchMock).not.toHaveBeenCalled(); expect(createImageBitmap).not.toHaveBeenCalled();
  const delayed = setup(f.bytes); const aborter = new AbortController();
  let resolveBitmap!: (value: unknown) => void; const close = vi.fn(); let started!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  vi.stubGlobal('createImageBitmap', vi.fn(() => { started(); return new Promise((resolve) => { resolveBitmap = resolve; }); }));
  const run = placeBoardArtwork(delayed.session, actor, f.art, aborter.signal); await began; aborter.abort();
  resolveBitmap({ width: 1200, height: 800, close });
  await expect(run).rejects.toThrow(); expect(close).toHaveBeenCalledTimes(1);
  expect(delayed.session.parts.assets.size).toBe(0); expect(readPresentations(delayed.session.parts)).toHaveLength(0); expect(blobControl.stored.size).toBe(0);
});

it('uses the invocation snapshot even if the caller mutates the artwork while fetching', async () => {
  const f = await fixture(); const { session } = setup(f.bytes);
  let resolveFetch!: (value: Response) => void;
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  const run = placeBoardArtwork(session, actor, f.art, signal(), { origin: { x: 120, y: 120 } });
  f.art.label = 'Mutated label'; f.art.crop = [0, 0, 1, 1]; f.art.original = 'https://foreignclubberscorespondence.web.app/other.png'; f.art.src = 'https://foreignclubberscorespondence.web.app/other.png'; f.art.width = 10;
  resolveFetch(new Response(new Blob([f.bytes as BlobPart], { type: 'image/png' })));
  await run;
  expect(fetchMock.mock.calls[0]![0]).toBe('https://foreignclubberscorespondence.web.app/original.png');
  const placed = readPresentations(session.parts)[0]!; expect(placed.crop).toEqual([0, 0, 0.5, 1]);
  expect(readAsset(session.parts, placed.assetId!)!.caption).toBe('A source drawing');
});

it('survives an observer throw, allows sequential distinct Adds, and reports tab-only persistence honestly', async () => {
  const f = await fixture(); const { session } = setup(f.bytes);
  const first = await placeBoardArtwork(session, actor, f.art, signal(), { onCommitted: () => { throw new Error('observer failed'); } });
  expect(first.persisted).toBe(true); expect(readPresentations(session.parts)).toHaveLength(1);
  const second = await placeBoardArtwork(session, actor, f.art, signal());
  const placed = readPresentations(session.parts); expect(placed).toHaveLength(2);
  expect(new Set(placed.map((p) => p.id)).size).toBe(2); expect(new Set(placed.map((p) => p.assetId)).size).toBe(2);
  expect(placed.map((p) => p.id)).toContain(first.presentationId); expect(placed.map((p) => p.id)).toContain(second.presentationId);
  expect(Math.max(...placed.map((p) => p.zIndex))).toBeGreaterThan(Math.min(...placed.map((p) => p.zIndex)));
  expect(second.presentationId).not.toBe(first.presentationId);
  const tab = await fixture({ tag: 'tab only' }); const tabSetup = setup(tab.bytes);
  blobControl.putImpl = async () => { throw new Error('storage full'); };
  const tabResult = await placeBoardArtwork(tabSetup.session, actor, tab.art, signal());
  expect(tabResult.persisted).toBe(false); expect(readPresentations(tabSetup.session.parts)).toHaveLength(1);
  expect(readPresentations(tabSetup.session.parts)[0]!.id).toBe(tabResult.presentationId);
});

it('places legacy artwork without an ArtRef with unknown rights and FCC provenance', async () => {
  const f = await fixture();
  const legacyArt: Artwork = { ...f.art, artRef: undefined };
  const { session } = setup(f.bytes);
  const result = await placeBoardArtwork(session, actor, legacyArt, signal());
  const placed = readPresentations(session.parts);
  expect(placed).toHaveLength(1); expect(placed[0]!.id).toBe(result.presentationId);
  const asset = readAsset(session.parts, placed[0]!.assetId!)!;
  expect(asset.rightsStatus).toBe('unknown'); expect(asset.credit).toBeUndefined();
  expect(asset.source).toMatchObject({ id: legacyArt.id, url: f.url, provider: 'fcc', cityId: 'barcelona', kind: 'artwork', origin: 'artwork' });
});

it('rejects a concurrent operation before IO, lets an aborted pre-commit operation be replaced, and does not let its cleanup delete the retry', async () => {
  const f = await fixture(); const { session } = setup(f.bytes);
  let resolveFirst!: (value: Response) => void;
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
    if (fetchMock.mock.calls.length === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
    return Promise.resolve(new Response(new Blob([f.bytes as BlobPart], { type: 'image/png' })));
  });
  vi.stubGlobal('fetch', fetchMock);
  const firstController = new AbortController();
  const first = placeBoardArtwork(session, actor, f.art, firstController.signal);
  await expect(placeBoardArtwork(session, actor, f.art, signal())).rejects.toThrow(/already/i);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(createImageBitmap).toHaveBeenCalledTimes(0);
  firstController.abort();
  const retry = placeBoardArtwork(session, actor, f.art, signal());
  resolveFirst(new Response(new Blob([f.bytes as BlobPart], { type: 'image/png' })));
  await expect(first).rejects.toThrow();
  await expect(retry).resolves.toMatchObject({ persisted: true });
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(readPresentations(session.parts)).toHaveLength(1);
});

it('does not fake rollback when cancellation arrives after commit while bytes are still persisting', async () => {
  const f = await fixture(); const { session } = setup(f.bytes); const controller = new AbortController();
  let resolvePut!: (value: unknown) => void;
  blobControl.putImpl = () => new Promise((resolve) => { resolvePut = resolve; });
  const run = placeBoardArtwork(session, actor, f.art, controller.signal);
  await vi.waitFor(() => expect(readPresentations(session.parts)).toHaveLength(1));
  const committedDoc = encodeTrip(session.doc); controller.abort();
  resolvePut('stored');
  await expect(run).resolves.toMatchObject({ persisted: true });
  expect(encodeTrip(session.doc)).toEqual(committedDoc); expect(readPresentations(session.parts)).toHaveLength(1);
});

it('keeps a committed operation in flight even after abort until storage settles', async () => {
  const f = await fixture(); const { session } = setup(f.bytes); const controller = new AbortController();
  let resolvePut!: (value: unknown) => void;
  blobControl.putImpl = () => new Promise((resolve) => { resolvePut = resolve; });
  const run = placeBoardArtwork(session, actor, f.art, controller.signal);
  await vi.waitFor(() => expect(readPresentations(session.parts)).toHaveLength(1));
  controller.abort();
  await expect(placeBoardArtwork(session, actor, f.art, signal())).rejects.toThrow(/already/i);
  expect(readPresentations(session.parts)).toHaveLength(1);
  resolvePut('stored');
  await expect(run).resolves.toMatchObject({ persisted: true });
  expect(readPresentations(session.parts)).toHaveLength(1);
});
