import { discoveryRequestSchema, discoveryResponseSchema, discoveryName, type DiscoveryRequest, type DiscoveryCandidate, type DiscoveryResponse, type FccCityContent } from '@mot/core';
import { createAttestedDiscoveryClient } from './attested-discovery';

const publicClient = createAttestedDiscoveryClient();
export interface DiscoveryOptions { transport: 'loopback-preview' | 'firebase-attested'; contributorConsent: boolean; post?: typeof publicClient.post }

// No TripSession parameter: this boundary cannot serialize a board, notes or photos.
export async function requestDiscovery(request: DiscoveryRequest, content: FccCityContent, signal: AbortSignal, fetcher: typeof fetch = fetch, options?: DiscoveryOptions): Promise<DiscoveryResponse> {
  const input = discoveryRequestSchema.parse(request);
  if (signal.aborted) throw Error('Discovery stopped. Nothing was added.');
  if (input.cityId !== content.city.id || input.seedIds.some(id => !content.places.some(place => place.id === id))) throw Error('Choose venues from the loaded FCC city.');
  if (options?.transport === 'firebase-attested' && options.contributorConsent !== true) throw Error('Review and agree to the Contributor notice before discovery.');
  const response = options?.transport === 'firebase-attested'
    ? await (options.post ?? publicClient.post)(input, { contributorConsent: true, signal })
    : await fetcher('/api/muse/discover', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mot-request': '1' }, body: JSON.stringify(input), credentials: 'same-origin', signal });
  if (signal.aborted) throw Error('Discovery stopped. Nothing was added.');
  const raw = await response.json();
  if (!response.ok || raw.status !== 'ok') throw Error(typeof raw.reason === 'string' ? raw.reason : 'Discovery unavailable. Continue with FCC.');
  const result = discoveryResponseSchema.parse(raw);
  if (result.cityId !== input.cityId) throw Error('The discovery city changed. Try again.');
  const names = new Set(content.places.map(place => discoveryName(place.name)));
  for (const candidate of result.candidates) {
    if (!input.seedIds.includes(candidate.relatedSeedId) || names.has(discoveryName(candidate.name))) throw Error('Discovery returned a repeated or unrelated venue. Try again.');
    names.add(discoveryName(candidate.name));
  }
  return result;
}

export function discoveryCard(candidate: DiscoveryCandidate, result: DiscoveryResponse, seedName: string) {
  return { kind: 'place' as const, title: candidate.name, stage: 'explore' as const, provenance: 'agent' as const,
    body: `Muse Spark 1.3 discovery — not checked.\nSuggested connection to FCC's ${seedName}: ${candidate.reason}\n\n${candidate.evidence.map(e => `${e.title}\n${e.url}\nSearch excerpt: ${e.snippet}`).join('\n\n')}\n\nSearched ${result.retrievedAt}. Public sources can be incomplete or outdated. Check location and opening details before visiting.`,
    source: { id: `discovery:${encodeURIComponent(candidate.evidence[0]!.url)}:${encodeURIComponent(candidate.name)}`.slice(0, 200), url: candidate.evidence[0]!.url, retrievedAt: result.retrievedAt } };
}
