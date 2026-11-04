import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISCOVERY_MODEL, type FccCityContent } from '@mot/core';
import { createDiscoveryAdapter, parseDiscoveryEnvelope, DISCOVERY_LIMITS, META_RESPONSES_URL } from './discovery.ts';

const date = '2026-11-04T16:00:00.000Z';
const source = { id: 'fcc:copenhagen:la', url: 'https://foreignclubberscorespondence.web.app/copenhagen.html', canonicalUrl: 'https://foreignclubberscorespondence.web.app/copenhagen.html', provider: 'fcc' as const, sourceId: 'la', cityId: 'copenhagen', kind: 'venue' as const, retrievedAt: date, version: '1', origin: 'catalogue' as const };
const city: FccCityContent = { city: { id: 'copenhagen', name: 'Copenhagen', countryCode: 'DK', timeZone: 'Europe/Copenhagen' }, articles: [], almanac: [], places: [
  { id: source.id, name: 'La Banchina', city: 'copenhagen', provenance: 'fcc', retrievedAt: date, fixture: false, source },
  { id: 'fcc:copenhagen:coffee', name: 'Coffee Collective', city: 'copenhagen', provenance: 'fcc', retrievedAt: date, fixture: false, source: { ...source, id: 'fcc:copenhagen:coffee' } },
] };
const request = { cityId: 'copenhagen', seedIds: [source.id], category: 'food' };
const env = { MOT_DISCOVERY_MODE: 'loopback-preview', MOT_DISCOVERY_CONTRIBUTOR_ACK: 'true', META_API_KEY: 'fictional-test-only' };
const url = 'https://guide.example/copenhagen';
const proposal = { name: 'Lille Bakery', relatedSeedId: source.id, reason: 'Mentioned together in a guide.', sourceUrls: [url] };
const hit = { url, title: 'Test guide', snippet: 'Test fixture: Lille Bakery is across from La Banchina.' };
const envelope = (candidates = [proposal], hits = [hit]) => ({ model: DISCOVERY_MODEL, status: 'completed', output: [
  { type: 'web_search_call', status: 'completed', results: hits },
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ candidates }) }] },
] });
const response = () => new Response(JSON.stringify(envelope()));
const adapter = (fetcher: typeof fetch = async () => response(), loadCity = async () => city) => createDiscoveryAdapter(env, { fetcher, loadCity, now: () => new Date(date) });
afterEach(() => vi.useRealTimers());

describe('public-only discovery boundary', () => {
  it('makes no network request unless the local mode, key and Contributor acknowledgement are all configured', async () => {
    for (const config of [{}, { ...env, META_API_KEY: undefined }, { ...env, MOT_DISCOVERY_CONTRIBUTOR_ACK: undefined }, { ...env, MOT_DISCOVERY_MODE: 'production' }]) {
      const fetcher = vi.fn(async () => response()), loadCity = vi.fn(async () => city);
      const subject = createDiscoveryAdapter(config, { fetcher, loadCity });
      expect(subject.status().available).toBe(false);
      expect(await subject.discover(request)).toMatchObject({ status: 'unavailable' });
      expect(fetcher).not.toHaveBeenCalled(); expect(loadCity).not.toHaveBeenCalled();
    }
  });
  it('rejects private payload fields, arbitrary prompts, keys, too many seeds and unknown seed IDs before a paid call', async () => {
    const fetcher = vi.fn(async () => response()), subject = adapter(fetcher);
    for (const input of [{ ...request, cards: [{ body: 'private' }] }, { ...request, apiKey: 'do-not-accept' }, { ...request, prompt: 'private' }, { ...request, seedIds: Array(4).fill(source.id) }, { ...request, seedIds: ['invented'] }]) {
      expect(await subject.discover(input)).toMatchObject({ status: 'error', code: 'invalid_request' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rehydrates public FCC data and sends only the fixed bounded Responses request', async () => {
    const fetcher = vi.fn(async () => response()); const result = await adapter(fetcher).discover(request);
    expect(result).toMatchObject({ status: 'ok', cityId: 'copenhagen', candidates: [{ name: 'Lille Bakery' }] });
    const [endpoint, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe(META_RESPONSES_URL);
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ model: DISCOVERY_MODEL, store: false, tools: [{ type: 'web_search', search_context_size: 'low' }], max_tool_calls: 2, max_output_tokens: 2500 });
    expect(JSON.parse(sent.input)).toEqual({ city: 'Copenhagen', category: 'food', seeds: [{ id: source.id, name: 'La Banchina', url: source.url }], excludeNames: ['La Banchina', 'Coffee Collective'] });
    expect(JSON.stringify([result, sent])).not.toContain(env.META_API_KEY);
  });
  it('rejects the wrong city and an oversized catalogue before sending to Meta', async () => {
    const fetcher = vi.fn(async () => response());
    expect(await adapter(fetcher, async () => ({ ...city, city: { ...city.city, id: 'other' } })).discover(request)).toMatchObject({ status: 'error' });
    expect(await adapter(fetcher, async () => ({ ...city, places: [...city.places, ...Array.from({ length: 100 }, (_, i) => ({ ...city.places[0]!, id: `long-${i}`, name: 'x'.repeat(200) }))] })).discover(request)).toMatchObject({ status: 'error', code: 'invalid_request' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('returned search evidence', () => {
  it('excludes normalized FCC duplicates and repeated model candidates', () => {
    const raw = envelope([proposal, proposal, { ...proposal, name: 'Coffée-Collective' }], [hit, { ...hit, url: 'https://other.example/', snippet: 'Coffee Collective and La Banchina' }]);
    expect(parseDiscoveryEnvelope(raw, city, request.seedIds, date).candidates.map(c => c.name)).toEqual(['Lille Bakery']);
  });
  it('drops invented sources, unreadable snippets, missing seed links and irrelevant co-mentions', () => {
    for (const raw of [envelope([proposal], []), envelope([proposal], [{ ...hit, snippet: '' }]), envelope([{ ...proposal, relatedSeedId: 'unknown' }]), envelope([proposal], [{ ...hit, snippet: 'Lille Bakery is nice.' }]), envelope([proposal], [{ ...hit, url: 'http://localhost/', snippet: hit.snippet }])]) {
      expect(parseDiscoveryEnvelope(raw, city, request.seedIds, date).candidates).toHaveLength(0);
    }
  });
  it('labels Instagram only for readable co-mention evidence on an actual post/reel URL', () => {
    for (const [path, expected] of [['/lillebakery/', 0], ['/p/test/', 1], ['/reel/test/', 1]] as const) {
      const social = `https://www.instagram.com${path}`;
      const result = parseDiscoveryEnvelope(envelope([{ ...proposal, sourceUrls: [social] }], [{ ...hit, url: social }]), city, request.seedIds, date);
      expect(result.candidates).toHaveLength(expected);
      if (expected) expect(result.candidates[0]!.evidence[0]!.kind).toBe('instagram-mention');
    }
  });
  it('fails closed when the provider did not search, was incomplete or used another model', () => {
    const raw = envelope();
    for (const value of [{ ...raw, status: 'incomplete' }, { ...raw, model: 'other' }, { ...raw, output: raw.output.slice(1) }]) {
      expect(() => parseDiscoveryEnvelope(value, city, request.seedIds, date)).toThrow();
    }
  });
});

describe('preview spending and concurrency controls', () => {
  it('reserves every paid attempt including failures; never retries or refunds', async () => {
    const fetcher = vi.fn(async () => new Response('Secret upstream text', { status: 500 })), subject = adapter(fetcher);
    for (let i = 0; i < DISCOVERY_LIMITS.maxAttempts; i++) expect(await subject.discover(request)).toMatchObject({ status: 'error', code: 'provider_unavailable' });
    expect(await subject.discover(request)).toMatchObject({ status: 'error', code: 'rate_limited' });
    expect(fetcher).toHaveBeenCalledTimes(5); expect(subject.status().available).toBe(false);
  });
  it('allows one active request and stops on cancellation without applying anything', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })), subject = adapter(fetcher), abort = new AbortController();
    const first = subject.discover(request, { signal: abort.signal }); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(await subject.discover(request)).toMatchObject({ code: 'busy' });
    abort.abort(); expect(await first).toMatchObject({ code: 'cancelled' }); finish(response());
  });
  it('times out even if a transport ignores abort', async () => {
    vi.useFakeTimers(); const subject = adapter(async () => new Promise<Response>(() => {}));
    const pending = subject.discover(request); await vi.advanceTimersByTimeAsync(30001);
    expect(await pending).toMatchObject({ code: 'timeout' });
  });
  it('bounds chunked provider responses and never returns provider error text', async () => {
    const subject = adapter(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(DISCOVERY_LIMITS.responseBytes + 1)); controller.close(); } })));
    expect(await subject.discover(request)).toMatchObject({ status: 'error', code: 'invalid_response' });
    expect(JSON.stringify(await adapter(async () => new Response('private provider details', { status: 401 })).discover(request))).not.toContain('private provider details');
  });
});
