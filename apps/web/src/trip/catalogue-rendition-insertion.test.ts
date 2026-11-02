import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTrip, readAsset, readPresentations, TripSession } from '@writers-board/core';
import type { Artwork } from '../artwork/catalog';
import ArtworkPreview from '../artwork/ArtworkPreview';
const blobs = vi.hoisted(() => new Map<string, Blob>());
vi.mock('../state/blobs', () => {
  const hashBlob = async (blob: Blob) => Buffer.from(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toString('hex');
  return { hashBlob, getBlob: async (hash: string) => blobs.get(hash) ?? null, putBlob: async (blob: Blob) => { blobs.set(await hashBlob(blob), blob); } };
});
import { placeBoardArtwork } from './board-artwork';
import { getTripBlob, placeTripArtwork } from './trip-assets';

const actor = { kind: 'human' as const, id: 'owner', name: 'Owner' };
async function fixture(derivative: boolean) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, 260); view.setUint32(20, 520); bytes[24] = 8; bytes[25] = 6;
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const url = 'https://foreignclubberscorespondence.web.app/available-figure.png';
  const artwork: Artwork & { renditionRole?: 'original' | 'derivative' } = {
    id: 'fcc:new-york:figure-0', styleId: 'fcc-editorial', label: 'Selected figure', city: 'new-york', subject: 'people',
    thumb: url, src: url, ...(derivative ? { renditionRole: 'derivative' as const } : { original: url }), width: 260, height: 520, crop: [0, 0, 1, 1],
    artRef: { assetId: 'fcc:new-york:figure-0', kind: 'original-art', category: 'people', originCityId: 'new-york', countryCode: 'US',
      thumbnailUrl: url, renditionUrl: url, ...(!derivative ? { originalUrl: url } : {}), width: 260, height: 520, mimeType: 'image/png', hash,
      credit: 'FCC source credit', rightsStatus: 'unknown', source: { provider: 'fcc', sourceId: 'sheet:figure-0', canonicalUrl: 'https://foreignclubberscorespondence.web.app/new-york.html', cityId: 'new-york', countryCode: 'US', kind: 'artwork', retrievedAt: '2026-11-02', version: 'pinned-source', contentHash: 'a'.repeat(64), origin: 'artwork' } },
  };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([bytes], { type: 'image/png' }))));
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 260, height: 520, close() {} })));
  return { artwork, bytes, hash };
}
afterEach(() => { vi.unstubAllGlobals(); blobs.clear(); });

it.each(['board', 'composition'] as const)('preserves declared derivative identity and pixels through %s insertion and Undo', async surface => {
  const { artwork, bytes, hash } = await fixture(true);
  const session = new TripSession(createTrip({ title: 'Rendition check', city: 'New York', countryCode: 'US', timeZone: null }));
  const signal = new AbortController().signal;
  if (surface === 'board') await placeBoardArtwork(session, actor, artwork, signal);
  else await placeTripArtwork(session, actor, artwork, signal);
  const placed = readPresentations(session.parts)[0]!;
  const asset = readAsset(session.parts, placed.assetId!)!;
  expect(asset.role).toBe('derivative');
  expect(asset.hash).toBe(hash);
  expect(asset.source).toMatchObject({ sourceId: 'sheet:figure-0', contentHash: 'a'.repeat(64), cityId: 'new-york', version: 'pinned-source' });
  expect(asset.derivedFrom).toBeUndefined(); // No invented local parent asset for an unavailable sheet.
  expect(asset.rightsStatus).toBe('unknown');
  expect(placed.crop).toEqual([0, 0, 1, 1]);
  expect(new Uint8Array(await (await getTripBlob(hash))!.arrayBuffer())).toEqual(bytes);
  session.undo(actor.id);
  expect(readPresentations(session.parts)).toHaveLength(0);
  session.redo(actor.id);
  expect(readAsset(session.parts, readPresentations(session.parts)[0]!.assetId!)!.role).toBe('derivative');
});

it('retains original identity when an original URL is supplied', async () => {
  const { artwork } = await fixture(false);
  const session = new TripSession(createTrip({ title: 'Original check', city: 'New York', countryCode: 'US', timeZone: null }));
  await placeBoardArtwork(session, actor, artwork, new AbortController().signal);
  expect(readAsset(session.parts, readPresentations(session.parts)[0]!.assetId!)!.role).toBe('original');
});

it('labels the available derivative and missing full-sheet original before the user adds it', async () => {
  const { artwork } = await fixture(true);
  const html = renderToStaticMarkup(createElement(ArtworkPreview, { artwork, origin: 'New York', away: false, busy: false, onAdd() {}, onBack() {} }));
  expect(html).toContain('Existing cropped rendition');
  expect(html).toContain('Full-sheet original unavailable');
  expect(html).not.toContain('original pixels verified on Add');
});
