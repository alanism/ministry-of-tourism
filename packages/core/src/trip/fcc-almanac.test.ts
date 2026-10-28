import { describe, expect, it, vi } from 'vitest';
import { createFccAdapter, FCC_ORIGIN, MemoryCityCache } from './city-source.ts';

// Public San Sebastián response inspected 28 Oct 2026. Only one public benchmark
// is retained here; its observation, collection and FX dates intentionally differ.
const snapshot = () => ({ schema: 'fcc.almanac.city/1', asOf: '2026-10-16', slug: 'san-sebastian', status: 'available',
  page: '/san-sebastian.html?section=almanac', market: 'Spain', labels: { it: [['frappuccino', 'Starbucks Frappuccino']], co: [], me: [], fa: [] },
  city: { s: 'san-sebastian', n: 'San Sebastián / Donostia', c: 'Spain', cur: 'EUR', r: 1.1208, st: 'r', fx: '2026-10-15', asOf: '2026-10-25',
    it: { frappuccino: [6.7, 'Starbucks San Sebastián · Uber Eats', 'https://www.ubereats.com/es/store/starbucks-san-sebastian/GRwvyPpJTFS18_JgIa-ofg', '2026-10-25', 'Caramel Cream Frappuccino; local delivery menu price. Fees and customizations can change checkout.', 0] },
    co: {}, me: {}, fa: {}, fu: null, scene: null, pal: ['#c0b490', '#0d2b52', '#5c7287', '#9e194d'], ll: [43.3183, -1.9812], market: 'Spain',
    sourceNote: 'Dated local delivery-menu listings.', fxNote: 'Existing dated Eurozone rate retained.' }, economy: {} });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ETag: '"almanac-8"' } });
const setup = (fetcher: typeof fetch, cache = new MemoryCityCache()) => createFccAdapter({ feedUrl: id => `${FCC_ORIGIN}/feeds/cities/${id}.json`, fetcher, cache, now: () => new Date('2026-10-28T13:00:00Z'), maxRetries: 1 });

describe('MOT-78 real separate Almanac publication', () => {
  it('loads the actual public city path and preserves observation, units, currency, FX and qualification fields', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(snapshot()));
    const result = await setup(fetcher as typeof fetch).getAlmanac('san-sebastian');
    expect(result.status).toBe('ready');
    if (result.status === 'unavailable') throw new Error(result.reason);
    expect(result.value).toEqual(snapshot());
    expect(result.retrievedAt).toBe('2026-10-28T13:00:00.000Z');
    expect(result.sourceVersion).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(fetcher).toHaveBeenCalledWith(`${FCC_ORIGIN}/almanac/city/san-sebastian.json`, expect.objectContaining({ credentials: 'omit', redirect: 'error' }));
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('does not treat a published empty or unavailable source as a network failure', async () => {
    const empty = { ...snapshot(), city: { ...snapshot().city, it: {} } };
    expect(await setup((async () => response(empty)) as typeof fetch).getAlmanac('san-sebastian')).toMatchObject({ status: 'ready', value: { status: 'available', city: { it: {} } } });
    const absent = { ...snapshot(), status: 'unavailable', city: null };
    expect(await setup((async () => response(absent)) as typeof fetch).getAlmanac('san-sebastian')).toMatchObject({ status: 'ready', value: { status: 'unavailable', city: null } });
    expect(await setup((async () => { throw new Error('network'); }) as typeof fetch).getAlmanac('san-sebastian')).toMatchObject({ status: 'unavailable', error: { code: 'network' } });
  });

  it('rejects malformed tuple positions, future schemas, unsafe source URLs and cross-city responses', async () => {
    const invalid = [
      { ...snapshot(), schema: 'fcc.almanac.city/2' },
      { ...snapshot(), slug: 'bilbao' },
      { ...snapshot(), city: { ...snapshot().city, it: { frappuccino: [6.7, 'Source', 1.2, '2026-10-25', 'Wrong tuple', 0] } } },
      { ...snapshot(), city: { ...snapshot().city, it: { frappuccino: [6.7, 'Source', 'javascript:alert(1)', '2026-10-25', 'Unsafe source', 0] } } },
    ];
    for (const data of invalid) expect(await setup((async () => response(data)) as typeof fetch).getAlmanac('san-sebastian')).toMatchObject({ status: 'unavailable', error: { code: 'invalid_feed' } });
  });

  it('preserves a separate complete Almanac cache across adapter reopen and uses ETag revalidation', async () => {
    const cache = new MemoryCityCache(); let next: Response = response(snapshot());
    const fetcher = vi.fn<typeof fetch>(async () => next);
    const adapter = setup(fetcher as typeof fetch, cache);
    await adapter.getAlmanac('san-sebastian');
    next = new Response(null, { status: 304 });
    const checked = await adapter.getAlmanac('san-sebastian');
    expect(checked.status).toBe('cached');
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('If-None-Match')).toBe('"almanac-8"');
    const reopened = setup(vi.fn() as unknown as typeof fetch, cache);
    expect(await reopened.getAlmanac('san-sebastian', { offline: true })).toMatchObject({ status: 'cached', value: snapshot(), retrievedAt: '2026-10-28T13:00:00.000Z' });
    expect(await reopened.getAlmanac('bilbao', { offline: true })).toMatchObject({ status: 'unavailable', error: { code: 'offline' } });
  });

  it('retains last-known-good on a partial invalid refresh and bounds retryable failures', async () => {
    const cache = new MemoryCityCache(); let data: unknown = snapshot();
    const adapter = setup((async () => response(data)) as typeof fetch, cache);
    await adapter.getAlmanac('san-sebastian'); data = { schema: 'fcc.almanac.city/1' };
    expect(await adapter.getAlmanac('san-sebastian')).toMatchObject({ status: 'stale', value: snapshot(), error: { code: 'invalid_feed' } });
    const failed = vi.fn(async () => response({}, 503));
    expect(await setup(failed as typeof fetch, cache).getAlmanac('san-sebastian')).toMatchObject({ status: 'stale', error: { code: 'http', httpStatus: 503 } });
    expect(failed).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed IDs before fetching and leaves cache untouched on cancellation', async () => {
    const fetcher = vi.fn(async () => response(snapshot())); const cache = new MemoryCityCache(); const writer = vi.spyOn(cache, 'write');
    const adapter = setup(fetcher as typeof fetch, cache);
    expect(await adapter.getAlmanac('../private')).toMatchObject({ status: 'unavailable', error: { code: 'invalid_feed' } });
    const controller = new AbortController(); controller.abort();
    expect(await adapter.getAlmanac('san-sebastian', { signal: controller.signal })).toMatchObject({ status: 'unavailable', error: { code: 'cancelled' } });
    expect(fetcher).not.toHaveBeenCalled(); expect(writer).not.toHaveBeenCalled();
  });

  it('reports the final network error honestly and never logs raw error text', async () => {
    const diagnostics: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 503)).mockRejectedValueOnce(new Error('private-guest-name secret-stay-code'));
    const adapter = createFccAdapter({ feedUrl: () => '', fetcher, onDiagnostic: entry => diagnostics.push(entry) });
    expect(await adapter.getAlmanac('san-sebastian')).toMatchObject({ status: 'unavailable', error: { code: 'network' } });
    expect(diagnostics).toEqual([{ operation: 'fcc-almanac-fetch', sourceUrl: `${FCC_ORIGIN}/almanac/city/san-sebastian.json`, errorClass: 'network' }]);
    expect(JSON.stringify(diagnostics)).not.toContain('secret-stay-code');
  });

  it('preserves fashion units and their absent price-check date without borrowing the wrapper date', async () => {
    // Fictional schema fixture for the separate five-position market-price contract.
    const synthetic = { ...snapshot(), city: { ...snapshot().city, fa: { example: [42, 'USD', 1, 'https://example.com/retail', 'Country retail-market example; stock unknown.'] } } };
    const result = await setup((async () => response(synthetic)) as typeof fetch).getAlmanac('san-sebastian');
    expect(result).toMatchObject({ status: 'ready', value: { city: { fa: synthetic.city.fa } } });
  });

  it('bounds an unresponsive request with a retryable timeout', async () => {
    const fetcher = ((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))) as typeof fetch;
    const adapter = createFccAdapter({ feedUrl: () => '', fetcher, timeoutMs: 5 });
    const result = await adapter.getAlmanac('san-sebastian');
    expect(result).toMatchObject({ status: 'unavailable', error: { code: 'network' } });
    if (result.status !== 'unavailable') throw new Error('Expected unavailable');
    expect(result.reason).toMatch(/timed out.*retry/i);
  });
});
