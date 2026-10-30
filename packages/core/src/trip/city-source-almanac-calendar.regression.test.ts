import { describe, expect, it } from 'vitest';
import { createFccAdapter } from './city-source.ts';

const snapshot = (patch: Record<string, unknown>) => ({
  schema: 'fcc.almanac.city/1',
  asOf: '2026-10-16',
  slug: 'san-sebastian',
  status: 'available',
  page: '/san-sebastian.html?section=almanac',
  market: 'Spain',
  labels: { it: [['coffee', 'Coffee']], co: [], me: [], fa: [] },
  economy: {},
  city: {
    s: 'san-sebastian',
    n: 'San Sebastian',
    c: 'Spain',
    cur: 'EUR',
    r: 1.1208,
    fx: '2026-10-15',
    it: { coffee: [6.7, 'A menu', 'https://example.org/menu', '2026-10-25', 'Dated observation.', 0] },
    co: {},
    me: {},
    fu: null,
    fa: {},
  },
  ...patch,
});

const adapterFor = (value: unknown) => createFccAdapter({
  feedUrl: (id) => `https://foreignclubberscorespondence.web.app/feeds/cities/${id}.json`,
  fetcher: async () => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
  now: () => new Date('2026-10-29T08:15:00.000Z'),
});

describe('MOT-81 Almanac calendar dates', () => {
  it('rejects a snapshot whose collection date is not a real calendar date', async () => {
    const result = await adapterFor(snapshot({ asOf: '2026-02-31' })).getAlmanac('san-sebastian');

    expect(result.status).toBe('unavailable');
    expect(result.status === 'unavailable' && result.error.code).toBe('invalid_feed');
  });

  it('rejects a snapshot whose exchange-rate date has an impossible month', async () => {
    const value = snapshot({});
    (value.city as Record<string, unknown>).fx = '2026-13-01';

    const result = await adapterFor(value).getAlmanac('san-sebastian');

    expect(result.status).toBe('unavailable');
    expect(result.status === 'unavailable' && result.error.code).toBe('invalid_feed');
  });

  it('rejects an item observation dated on a nonexistent day', async () => {
    const value = snapshot({});
    const city = value.city as { it: Record<string, unknown[]> };
    city.it.coffee = [6.7, 'A menu', 'https://example.org/menu', '2026-02-31', 'Dated observation.', 0];

    const result = await adapterFor(value).getAlmanac('san-sebastian');

    expect(result.status).toBe('unavailable');
    expect(result.status === 'unavailable' && result.error.code).toBe('invalid_feed');
  });

  it('accepts a legitimate leap day', async () => {
    const result = await adapterFor(snapshot({ asOf: '2028-02-29' })).getAlmanac('san-sebastian');

    expect(result.status).toBe('ready');
    expect(result.status !== 'unavailable' && result.value.asOf).toBe('2028-02-29');
  });

  it('rejects 1900-02-29 under Gregorian century leap-year rules', async () => {
    const result = await adapterFor(snapshot({ asOf: '1900-02-29' })).getAlmanac('san-sebastian');

    expect(result.status).toBe('unavailable');
    expect(result.status === 'unavailable' && result.error.code).toBe('invalid_feed');
  });

  it('accepts 2000-02-29 under Gregorian century leap-year rules', async () => {
    const result = await adapterFor(snapshot({ asOf: '2000-02-29' })).getAlmanac('san-sebastian');

    expect(result.status).toBe('ready');
    expect(result.status !== 'unavailable' && result.value.asOf).toBe('2000-02-29');
  });

  it('keeps the cached snapshot when a later feed has a nonexistent date', async () => {
    let value = snapshot({});
    const adapter = createFccAdapter({
      feedUrl: (id) => `https://foreignclubberscorespondence.web.app/feeds/cities/${id}.json`,
      fetcher: async () => new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      now: () => new Date('2026-10-29T08:15:00.000Z'),
    });

    const first = await adapter.getAlmanac('san-sebastian');
    value = snapshot({ asOf: '2026-02-31' });
    const next = await adapter.getAlmanac('san-sebastian');

    expect(first.status).toBe('ready');
    expect(next.status).toBe('stale');
    expect(next.status !== 'unavailable' && next.value.asOf).toBe('2026-10-16');
    expect(next.status !== 'unavailable' && next.error?.code).toBe('invalid_feed');
  });
});
