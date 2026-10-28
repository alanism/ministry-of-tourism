import { describe, expect, it, vi } from 'vitest';
import type { Manifest } from './catalog';
import { loadCountryArtwork, resolveArtScope, type ArtDestination, type CountryArtCache } from './country-art';

const destinations: ArtDestination[] = [
  { id: 'san-sebastian', name: 'San Sebastián', countryCode: 'ES', timeZone: 'Europe/Madrid' },
  { id: 'bilbao', name: 'Bilbao', countryCode: 'ES', timeZone: 'Europe/Madrid' },
  { id: 'paris', name: 'Paris', countryCode: 'FR', timeZone: 'Europe/Paris' },
];
const manifest: Manifest = { version: 1, styleId: 'fcc-editorial', subjects: [{ id: 'people', label: 'People' }, { id: 'objects', label: 'Objects' }],
  cities: destinations.map(city => ({ id: city.id, label: city.name })), catalogs: [
    { city: 'san-sebastian', subject: 'people', count: 1, url: '/artwork/san-sebastian/people.json' },
    { city: 'bilbao', subject: 'objects', count: 1, url: '/artwork/bilbao/objects.json' },
    { city: 'paris', subject: 'objects', count: 1, url: '/artwork/paris/objects.json' },
  ] };
const select = (overrides: Partial<Parameters<typeof resolveArtScope>[0]> = {}) => resolveArtScope({ cityId: 'san-sebastian', countryCode: 'ES', category: 'objects', mode: 'city', destinations, manifest, ...overrides });
const artwork = (city: string, subject = 'objects') => ({ id: `${city}-art`, city, styleId: 'fcc-editorial', label: 'A decorative city map', subject,
  thumb: 'https://example.com/thumb.webp', src: 'https://example.com/art.webp', width: 1000, height: 1000 });
const catalog = (city: string, subject = 'objects') => ({ version: 1, styleId: 'fcc-editorial', items: [artwork(city, subject)] });
const fetchOk = (async (url: string | URL | Request) => new Response(JSON.stringify(catalog(String(url).split('/')[2]!)))) as typeof fetch;

describe('MOT-85 explicit geography table', () => {
  it('keeps exact-city categories first and leaves country browsing available', () => {
    expect(select({ category: 'people' })).toMatchObject({ state: 'cityavailable', catalogPaths: ['/artwork/san-sebastian/people.json'] });
    expect(select({ mode: 'country' })).toMatchObject({ state: 'countryavailable', catalogPaths: ['/artwork/bilbao/objects.json'], originCities: { bilbao: 'Bilbao' } });
  });
  it('offers the selected category across the country without removing other city categories', () => {
    const before = structuredClone(manifest);
    expect(select()).toMatchObject({ state: 'categorygap', catalogPaths: ['/artwork/bilbao/objects.json'] });
    expect(manifest).toEqual(before);
  });
  it('keeps an absent destination and selects only explicitly matched country cities', () => {
    expect(select({ cityId: 'burgos' })).toMatchObject({ state: 'cityabsent', catalogPaths: ['/artwork/bilbao/objects.json'] });
    expect(select({ cityId: 'burgos' }).catalogPaths).not.toContain('/artwork/paris/objects.json');
  });
  it('requires an explicit country and never guesses it from a city name or language', () => {
    expect(select({ countryCode: undefined })).toMatchObject({ state: 'countryunknown', catalogPaths: [] });
  });
  it('distinguishes empty-country results from an unavailable country index', () => {
    expect(select({ mode: 'country', countryCode: 'NO' })).toMatchObject({ state: 'countryempty', catalogPaths: [] });
    expect(select({ mode: 'country', destinations: [] })).toMatchObject({ state: 'indexunavailable', catalogPaths: [] });
    expect(select({ category: 'people', destinations: [] })).toMatchObject({ state: 'cityavailable' });
  });
  it('rejects contradictory registry identities instead of choosing a geography silently', () => {
    expect(select({ mode: 'country', destinations: [...destinations, { ...destinations[1]!, countryCode: 'FR' }] })).toMatchObject({ state: 'indexunavailable' });
  });
});

describe('MOT-85 country catalog loading', () => {
  it('loads selected country catalogs only and retains the original city on every item', async () => {
    const fetcher = vi.fn(fetchOk);
    const state = await loadCountryArtwork({ scope: select({ mode: 'country' }), manifest, subject: 'objects', signal: new AbortController().signal, fetcher });
    expect(state.status).toBe('ready');
    expect(state.items).toMatchObject([{ originCityId: 'bilbao', originCityName: 'Bilbao', artwork: { city: 'bilbao' } }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/artwork/bilbao/objects.json');
  });
  it('treats network failure as retryable rather than city absence and preserves dated cached results', async () => {
    const cache: CountryArtCache = new Map(); const scope = select({ mode: 'country' });
    const first = await loadCountryArtwork({ scope, manifest, subject: 'objects', signal: new AbortController().signal, fetcher: fetchOk, cache, now: () => new Date('2026-10-28T12:00:00Z') });
    expect(first.status).toBe('ready');
    const failed = await loadCountryArtwork({ scope, manifest, subject: 'objects', signal: new AbortController().signal, fetcher: vi.fn(async () => { throw new Error('network'); }), cache });
    expect(failed).toMatchObject({ status: 'cached', retrievedAt: '2026-10-28T12:00:00.000Z' });
    expect(failed.error).toMatch(/retry/i);
    expect(failed.error).not.toMatch(/unsupported|absent/i);
    expect(failed.items).toEqual(first.items);
  });
  it('rejects wrong style, subject, city and incomplete catalog identities atomically', async () => {
    const invalid = [
      { ...catalog('bilbao'), styleId: 'wrong' },
      catalog('paris'), catalog('bilbao', 'people'),
      { ...catalog('bilbao'), items: [] },
    ];
    for (const body of invalid) {
      const state = await loadCountryArtwork({ scope: select({ mode: 'country' }), manifest, subject: 'objects', signal: new AbortController().signal, fetcher: (async () => new Response(JSON.stringify(body))) as typeof fetch });
      expect(state.status).toBe('unavailable'); expect(state.items).toEqual([]);
    }
  });
  it('does not read cached results from another country or category', async () => {
    const cache: CountryArtCache = new Map();
    await loadCountryArtwork({ scope: select({ mode: 'country' }), manifest, subject: 'objects', signal: new AbortController().signal, fetcher: fetchOk, cache });
    const french = await loadCountryArtwork({ scope: select({ mode: 'country', countryCode: 'FR' }), manifest, subject: 'objects', signal: new AbortController().signal, offline: true, cache });
    expect(french).toMatchObject({ status: 'unavailable', items: [] });
  });
  it('limits concurrent requests to four and cancellation prevents cache insertion', async () => {
    const cities = Array.from({ length: 9 }, (_, i) => ({ id: `city-${i}`, name: `City ${i}`, countryCode: 'ES', timeZone: null }));
    const many: Manifest = { ...manifest, cities: cities.map(c => ({ id: c.id, label: c.name })), catalogs: cities.map(c => ({ city: c.id, subject: 'objects', count: 1, url: `/artwork/${c.id}/objects.json` })) };
    let active = 0, peak = 0;
    const fetcher = (async (url) => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 3)); active--; return fetchOk(url); }) as typeof fetch;
    const scope = select({ mode: 'country', manifest: many, destinations: cities });
    const cache: CountryArtCache = new Map();
    const loaded = await loadCountryArtwork({ scope, manifest: many, subject: 'objects', signal: new AbortController().signal, fetcher, cache });
    expect(loaded.items).toHaveLength(9); expect(peak).toBeLessThanOrEqual(4);
    const controller = new AbortController(); controller.abort(); const cancelledCache: CountryArtCache = new Map();
    expect((await loadCountryArtwork({ scope, manifest: many, subject: 'objects', signal: controller.signal, fetcher, cache: cancelledCache })).status).toBe('cancelled');
    expect(cancelledCache.size).toBe(0);
  });
  it('times out an incomplete request without reporting unsupported city', async () => {
    const fetcher = ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))) as typeof fetch;
    const state = await loadCountryArtwork({ scope: select({ mode: 'country' }), manifest, subject: 'objects', signal: new AbortController().signal, fetcher, timeoutMs: 5 });
    expect(state.status).toBe('unavailable'); expect(state.error).toMatch(/retry/i); expect(state.error).not.toMatch(/unsupported/);
  });
});
