import { expect, it, vi } from 'vitest';
import { createTrip, encodeTrip, TripSession, readAllCards, DISCOVERY_MODEL, type FccCityContent, type DiscoveryResponse } from '@mot/core';
import { discoveryCard, requestDiscovery } from './discovery-client';
const actor = { kind: 'human' as const, id: 'owner', name: 'Owner' };
const source = { id: 'fcc:copenhagen:la', url: 'https://foreignclubberscorespondence.web.app/copenhagen.html', canonicalUrl: 'https://foreignclubberscorespondence.web.app/copenhagen.html', provider: 'fcc' as const, sourceId: 'la', cityId: 'copenhagen', kind: 'venue' as const, retrievedAt: '2026-11-04', version: '1', origin: 'catalogue' as const };
const content: FccCityContent = { city: { id: 'copenhagen', name: 'Copenhagen', countryCode: 'DK', timeZone: null }, articles: [], almanac: [], places: [{ id: source.id, name: 'La Banchina', city: 'copenhagen', provenance: 'fcc', fixture: false, retrievedAt: source.retrievedAt, source }] };
const request = { cityId: 'copenhagen', seedIds: [source.id], category: 'food' as const };
const result: DiscoveryResponse = { status: 'ok', modelId: DISCOVERY_MODEL, cityId: 'copenhagen', retrievedAt: '2026-11-04T16:00:00.000Z', candidates: [{ name: 'Lille Bakery', relatedSeedId: source.id, reason: 'Mentioned together', evidence: [{ url: 'https://guide.example/copenhagen', title: 'Fixture guide', snippet: 'Test fixture: Lille Bakery and La Banchina are mentioned together.', kind: 'public-web' }] }] };
it('sends only catalogue identifiers, leaves a private board unchanged and requires an explicit create command to add a sourced place', async () => {
  const session = new TripSession(createTrip({ title: 'Private title', city: 'Copenhagen', timeZone: null }));
  session.execute(actor, 'trip_card_create', { kind: 'note', title: 'Private note', body: 'Secret booking code', scope: 'private' });
  const before = encodeTrip(session.doc), fetcher = vi.fn(async () => new Response(JSON.stringify(result)));
  const reviewed = await requestDiscovery(request, content, new AbortController().signal, fetcher);
  expect(encodeTrip(session.doc)).toEqual(before);
  const [, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(options.body))).toEqual(request); expect(String(options.body)).not.toContain('Secret');
  session.execute(actor, 'trip_card_create', discoveryCard(reviewed.candidates[0]!, reviewed, 'La Banchina'));
  const added = readAllCards(session.parts).find(card => card.title === 'Lille Bakery')!;
  expect(added).toMatchObject({ kind: 'place', stage: 'explore', provenance: 'agent', source: { url: 'https://guide.example/copenhagen' } });
  expect(added.body).toContain('not checked'); expect(added.body).toContain('La Banchina'); expect(added.body).toContain('Search excerpt'); expect(added.source?.provider).toBeUndefined();
});
it('rejects a wrong-city response, existing FCC venue, duplicate suggestions or unknown seed', async () => {
  for (const value of [{ ...result, cityId: 'paris' }, { ...result, candidates: [{ ...result.candidates[0]!, name: 'La Banchina' }] }, { ...result, candidates: [result.candidates[0], result.candidates[0]] }, { ...result, candidates: [{ ...result.candidates[0]!, relatedSeedId: 'other' }] }]) {
    await expect(requestDiscovery(request, content, new AbortController().signal, async () => new Response(JSON.stringify(value)))).rejects.toThrow();
  }
});
it('drops a late cancelled result and makes no request for an invalid seed or extra private data', async () => {
  const abort = new AbortController(), fetcher = vi.fn(async () => { abort.abort(); return new Response(JSON.stringify(result)); });
  await expect(requestDiscovery(request, content, abort.signal, fetcher)).rejects.toThrow(/stopped/);
  const unused = vi.fn(async () => new Response());
  await expect(requestDiscovery({ ...request, seedIds: ['unknown'] }, content, new AbortController().signal, unused)).rejects.toThrow();
  await expect(requestDiscovery({ ...request, boardId: 'private' } as typeof request, content, new AbortController().signal, unused)).rejects.toThrow();
  expect(unused).not.toHaveBeenCalled();
});
