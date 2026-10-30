import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { readCatalog } from './catalog';

const schema = z.object({ label: z.string(), items: z.array(z.string()) });

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    json: async () => structuredClone(body),
  } as unknown as Response;
}

function mockFetcher(body: unknown) {
  return vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch;
}

function calls(fetcher: typeof fetch) {
  return (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('readCatalog caching', () => {
  it('remains fresh by default, including for country catalogs', async () => {
    const fetcher = mockFetcher({ label: 'Country', items: ['a'] });
    const url = '/artwork/countries/thailand.json';
    const first = await readCatalog(url, schema, new AbortController().signal, fetcher);
    const second = await readCatalog(url, schema, new AbortController().signal, fetcher);
    expect(first).toEqual({ label: 'Country', items: ['a'] });
    expect(second).toEqual({ label: 'Country', items: ['a'] });
    expect(calls(fetcher)).toBe(2);
  });

  it('reuses a response only when caching is explicitly enabled', async () => {
    const fetcher = mockFetcher({ label: 'Index', items: ['a'] });
    const url = '/artwork/index.json';
    const first = await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    const second = await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    expect(second).toEqual(first);
    expect(calls(fetcher)).toBe(1);
  });

  it('isolates cache entries by fetcher identity', async () => {
    const url = '/artwork/fetcher-isolation/manifest.json';
    const fetcherA = mockFetcher({ label: 'A', items: [] });
    const fetcherB = mockFetcher({ label: 'B', items: [] });
    await expect(readCatalog(url, schema, new AbortController().signal, fetcherA, { cache: true })).resolves.toEqual({ label: 'A', items: [] });
    await expect(readCatalog(url, schema, new AbortController().signal, fetcherB, { cache: true })).resolves.toEqual({ label: 'B', items: [] });
    await expect(readCatalog(url, schema, new AbortController().signal, fetcherA, { cache: true })).resolves.toEqual({ label: 'A', items: [] });
    expect(calls(fetcherA)).toBe(1);
    expect(calls(fetcherB)).toBe(1);
  });

  it('isolates cache entries by schema identity', async () => {
    const url = '/artwork/schema-isolation/manifest.json';
    const schemaA = z.object({ value: z.string() });
    const schemaB = z.object({ value: z.string() }).transform(value => ({ value: `${value.value}-b` }));
    const fetcher = mockFetcher({ value: 'same' });
    await expect(readCatalog(url, schemaA, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ value: 'same' });
    await expect(readCatalog(url, schemaB, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ value: 'same-b' });
    await expect(readCatalog(url, schemaA, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ value: 'same' });
    expect(calls(fetcher)).toBe(2);
  });

  it('refetches after the five-minute TTL expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const fetcher = mockFetcher({ label: 'Manifest', items: [] });
    const url = '/artwork/expiry/manifest.json';
    await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000 + 1));
    await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    expect(calls(fetcher)).toBe(2);
  });

  it('refetches when the clock moves backwards', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:05:00.000Z'));
    const fetcher = mockFetcher({ label: 'Manifest', items: [] });
    const url = '/artwork/negative-clock/manifest.json';
    await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    vi.setSystemTime(new Date(Date.now() - 1));
    await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    expect(calls(fetcher)).toBe(2);
  });

  it('invalidates the old entry before a forced refresh so a failed retry cannot revive it', async () => {
    const url = '/artwork/forced-refresh/manifest.json';
    const fetcher = mockFetcher({ label: 'Old', items: [] });
    await expect(readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ label: 'Old', items: [] });
    (fetcher as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    await expect(readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true, forceRefresh: true })).rejects.toThrow('offline');
    (fetcher as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonResponse({ label: 'New', items: [] }));
    await expect(readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ label: 'New', items: [] });
    expect(calls(fetcher)).toBe(3);
  });

  it('does not cache invalid responses', async () => {
    const url = '/artwork/invalid/manifest.json';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ label: 42, items: [] }))
      .mockResolvedValueOnce(jsonResponse({ label: 'Valid', items: [] })) as unknown as typeof fetch;
    await expect(readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true })).rejects.toThrow('This artwork catalog is not supported.');
    await expect(readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ label: 'Valid', items: [] });
    expect(calls(fetcher)).toBe(2);
  });

  it('does not cache a response that arrives after abort', async () => {
    const url = '/artwork/late-abort/manifest.json';
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { resolveFetch = resolve; })) as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = readCatalog(url, schema, controller.signal, fetcher, { cache: true });
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    resolveFetch(jsonResponse({ label: 'Late', items: [] }));
    await new Promise(resolve => setTimeout(resolve, 0));
    (fetcher as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ label: 'Fresh', items: [] }));
    await expect(readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true })).resolves.toEqual({ label: 'Fresh', items: [] });
    expect(calls(fetcher)).toBe(2);
  });

  it('throws before returning a cached value when the signal is already aborted', async () => {
    const url = '/artwork/aborted-cache-read/manifest.json';
    const fetcher = mockFetcher({ label: 'Cached', items: [] });
    await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(readCatalog(url, schema, controller.signal, fetcher, { cache: true })).rejects.toThrow('cancelled');
    expect(calls(fetcher)).toBe(1);
  });

  it('returns clones so mutating a result cannot poison the cache', async () => {
    const url = '/artwork/clone/manifest.json';
    const fetcher = mockFetcher({ label: 'Cached', items: ['original'] });
    const first = await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    first.items.push('mutated');
    first.label = 'mutated';
    const second = await readCatalog(url, schema, new AbortController().signal, fetcher, { cache: true });
    expect(second).toEqual({ label: 'Cached', items: ['original'] });
    expect(second).not.toBe(first);
    expect(second.items).not.toBe(first.items);
    expect(calls(fetcher)).toBe(1);
  });

  it('bounds the cache to 32 entries', async () => {
    const fetcher = mockFetcher({ label: 'Manifest', items: [] });
    for (let index = 0; index < 33; index += 1) {
      await readCatalog(`/artwork/bounded-${index}/manifest.json`, schema, new AbortController().signal, fetcher, { cache: true });
    }
    expect(calls(fetcher)).toBe(33);
    await readCatalog('/artwork/bounded-32/manifest.json', schema, new AbortController().signal, fetcher, { cache: true });
    expect(calls(fetcher)).toBe(33);
    await readCatalog('/artwork/bounded-0/manifest.json', schema, new AbortController().signal, fetcher, { cache: true });
    expect(calls(fetcher)).toBe(34);
  });
});
