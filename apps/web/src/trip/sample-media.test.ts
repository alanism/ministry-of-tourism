import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTrip, readAllCards, TripSession } from '@writers-board/core';
import { FirstScreen } from './FirstScreen';
import { seedSample } from './sample';
import { attachPhoto } from './trip-assets';

vi.mock('./trip-assets', () => ({ attachPhoto: vi.fn(async () => {}) }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const session = () => new TripSession(createTrip({ title: 'Sample', city: 'bangkok', timeZone: 'Asia/Bangkok' }));
const landing = () => renderToStaticMarkup(createElement(FirstScreen, { onStart: () => {}, boards: [], onOpen: () => {} }));

describe('optional sample media', () => {
  it('renders a product demo landing and seeds original cards without requesting omitted photos', async () => {
    vi.stubEnv('VITE_MOT_SAMPLE_MEDIA', undefined);
    const fetcher = vi.fn(() => { throw new Error('Sample binaries are omitted'); });
    vi.stubGlobal('fetch', fetcher);
    const html = landing();
    expect(html).not.toContain('/sample/');
    expect(html).toContain('/assets/mot-product-and-technical-demo-20261030.mp4');
    expect(html).toContain('Make this my trip');
    const trip = session();
    await seedSample(trip, 'traveler');
    expect(fetcher).not.toHaveBeenCalled();
    const cards = readAllCards(trip.parts);
    expect(cards).toHaveLength(8);
    expect(cards.find(card => card.title === 'A moment on the river')).toMatchObject({ kind: 'note', body: 'Sunset from the river.', day: '2026-11-13', assetIds: [] });
    expect(cards.find(card => card.title === 'Check-in notes')?.scope).toBe('private');
    expect(vi.mocked(attachPhoto).mock.calls.length).toBe(0);
  });

  it('allows explicitly enabled local photos without treating an HTML fallback as an image', async () => {
    vi.stubEnv('VITE_MOT_SAMPLE_MEDIA', 'enabled');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })));
    const trip = session();
    await expect(seedSample(trip, 'host_guide')).resolves.toBeUndefined();
    expect(readAllCards(trip.parts)).toHaveLength(5);
    expect(vi.mocked(attachPhoto).mock.calls.length).toBe(0);
  });

  it('attaches existing licensed sample photos only when enabled', async () => {
    vi.stubEnv('VITE_MOT_SAMPLE_MEDIA', 'enabled');
    const fetcher = vi.fn(async () => new Response(new Blob(['test image bytes'], { type: 'image/jpeg' })));
    vi.stubGlobal('fetch', fetcher);
    const trip = session();
    await seedSample(trip, 'traveler');
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(attachPhoto).toHaveBeenCalledTimes(2);
    expect(readAllCards(trip.parts).find(card => card.title === 'A moment on the river')?.kind).toBe('photo');
    expect(landing()).toContain('/assets/mot-product-and-technical-demo-20261030.mp4');
    expect(landing()).not.toContain('/sample/');
  });
});
