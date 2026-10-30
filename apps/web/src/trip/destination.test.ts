import { describe, expect, it, vi } from 'vitest';
import { countryChoices, destinationDetails, destinationRows, foldDestination, loadDestinations, matchRange, searchDestinations } from './destination';

const cities = [
  { id: 'san-sebastian', name: 'San Sebastián', aliases: ['Donostia'], countryCode: 'ES', timeZone: 'Europe/Madrid' },
  { id: 'zurich', name: 'Zürich', aliases: ['Zurich'], countryCode: 'CH', timeZone: 'Europe/Zurich' },
  { id: 'kyoto', name: 'Kyoto', aliases: ['Kyōto'], countryCode: 'JP', timeZone: 'Asia/Tokyo' },
];
const cache = (value?: unknown) => {
  let current = value === undefined ? null : JSON.stringify(value);
  return { getItem: vi.fn(() => current), setItem: vi.fn((_key: string, next: string) => { current = next; }) };
};

describe('MOT-77 destination search and explicit selection', () => {
  it('matches names, stable slugs and aliases without accents, case or whitespace friction', () => {
    expect(foldDestination('  SÁN-Sebastián  ')).toBe('san sebastian');
    expect(searchDestinations(cities, 'san sebastian')[0]?.row.id).toBe('san-sebastian');
    expect(searchDestinations(cities, 'DONOSTIA')[0]).toMatchObject({ row: { id: 'san-sebastian' }, via: 'Donostia' });
    expect(searchDestinations(cities, 'zurich')[0]?.row.id).toBe('zurich');
    expect(searchDestinations(cities, 'kyō')[0]?.row.id).toBe('kyoto');
    expect(searchDestinations(cities, 'bilbao')).toEqual([]);
  });
  it('highlights the matched characters of the original name, through accents, ligatures and spacing', () => {
    expect(matchRange('San Sebastián', 'sebastian')).toEqual([4, 13]);
    expect(matchRange('Donostia', 'DONOSTIA')).toEqual([0, 8]);
    expect(matchRange('New  York', 'new york')).toEqual([0, 9]);
    expect(matchRange('Saint-Tropez', 'saint tro')).toEqual([0, 9]);
    expect(matchRange('ﬁesta', 'iesta')).toEqual([0, 5]);
    expect(matchRange('Bilbao', 'porto')).toBeUndefined();
    expect(matchRange('Bilbao', '  ')).toBeUndefined();
  });
  it('preserves ambiguous matching cities for an explicit choice instead of guessing a country', () => {
    const ambiguous = [...cities, { id: 'san-sebastian-other', name: 'San Sebastián', countryCode: 'US', timeZone: null }];
    expect(searchDestinations(ambiguous, 'san sebastian').map(match => match.row.id)).toEqual(['san-sebastian', 'san-sebastian-other']);
  });
  it('uses full country names and supports a named country without any city registry', () => {
    expect(countryChoices('Spain')).toEqual([{ code: 'ES', name: 'Spain' }]);
    expect(countryChoices('JAPAN')).toEqual([{ code: 'JP', name: 'Japan' }]);
    expect(destinationDetails({ city: '  Bilbao  ', countryCode: 'ES' })).toMatchObject({ city: 'Bilbao', countryCode: 'ES', timeZone: null, title: 'Bilbao trip' });
    expect(destinationDetails({ city: 'Bilbao', countryCode: 'ES' })).not.toHaveProperty('cityId');
  });
  it('takes timezone only from the explicitly selected authoritative record, preserving unknown values', () => {
    expect(destinationDetails({ city: 'Donostia', countryCode: 'ES', destination: cities[0] })).toMatchObject({ city: 'San Sebastián', cityId: 'san-sebastian', timeZone: 'Europe/Madrid' });
    expect(destinationDetails({ city: 'Own city', countryCode: 'US' }).timeZone).toBeNull();
    expect(() => destinationDetails({ city: 'San Sebastián', countryCode: 'JP', destination: cities[0] })).toThrow();
    expect(destinationRows.safeParse([{ ...cities[0], timeZone: 'Guess/Spain' }]).success).toBe(false);
  });
  it('changes destination metadata only and preserves the existing title, dates and party', () => {
    const current = { schemaVersion: 2 as const, boardId: 'trip-a', title: 'Our own title', kind: 'traveler' as const, city: 'Kyoto', cityId: 'kyoto', countryCode: 'JP', timeZone: 'Asia/Tokyo', agentMode: 'together' as const, dates: { start: '2026-12-01', end: '2026-12-03' }, party: 'couple' as const };
    const before = structuredClone(current);
    const next = destinationDetails({ city: 'Bilbao', countryCode: 'ES', current });
    expect(next).toMatchObject({ title: 'Our own title', city: 'Bilbao', timeZone: null, dates: current.dates, party: 'couple' });
    expect(next).not.toHaveProperty('cards'); expect(next).not.toHaveProperty('assets'); expect(current).toEqual(before);
  });
});

describe('MOT-77 registry consumer without a replacement producer', () => {
  it('reads only the bundled publication, validates it, and caches the exact records', async () => {
    const storage = cache(); const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ version: 1, cities })));
    const result = await loadDestinations({ fetcher, storage, now: () => new Date('2026-10-28T14:00:00Z') });
    expect(result).toMatchObject({ status: 'ready', cities, retrievedAt: '2026-10-28T14:00:00.000Z' });
    expect(fetcher).toHaveBeenCalledWith('/fcc/destinations.json', expect.objectContaining({ credentials: 'omit' }));
    expect(JSON.parse(storage.setItem.mock.calls[0]![1]).cities).toEqual(cities);
  });
  it('keeps producer absence explicit and leaves the unlisted-city flow available', async () => {
    const result = await loadDestinations({ fetcher: (async () => new Response('', { status: 404 })) as typeof fetch, storage: cache() });
    expect(result.status).toBe('unavailable'); expect(result.cities).toEqual([]);
    expect(result.error).toMatch(/not been published/i);
    expect(result.error).toMatch(/name a city/i);
  });
  it('retains the last good delivered registry on network or malformed-publication failure', async () => {
    const storage = cache({ schema: 'mot.destination-cache/1', retrievedAt: '2026-10-27T00:00:00Z', cities });
    for (const response of [new Response('', { status: 503 }), new Response(JSON.stringify({ version: 2, cities })), new Response(JSON.stringify([...cities, { ...cities[0], id: 'bad', countryCode: 'ZZ' }]))]) {
      const result = await loadDestinations({ fetcher: (async () => response) as typeof fetch, storage });
      expect(result).toMatchObject({ status: 'cached', cities, retrievedAt: '2026-10-27T00:00:00Z' });
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });
  it('supports the existing browser cache offline without inventing a retrieval date', async () => {
    const fetcher = vi.fn(); const result = await loadDestinations({ fetcher, storage: cache(cities), offline: true });
    expect(result).toMatchObject({ status: 'cached', cities }); expect(result.retrievedAt).toBeUndefined(); expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects contradictory IDs and unsafe tag URLs instead of publishing partial data', async () => {
    expect(destinationRows.safeParse([...cities, { ...cities[0], countryCode: 'FR' }]).success).toBe(false);
    expect(destinationRows.safeParse([{ ...cities[0], tagUrl: 'https://attacker.example/tag.svg' }]).success).toBe(false);
    const storage = cache(); const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(); const result = await loadDestinations({ fetcher, storage, signal: controller.signal });
    expect(result.status).toBe('unavailable'); expect(fetcher).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
  });
});
