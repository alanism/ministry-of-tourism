import { expect, it, vi } from 'vitest';
import { createAttestedDiscoveryClient } from './attested-discovery';
import { requestDiscovery } from './discovery-client';
import type { FccCityContent } from '@mot/core';

const input = { cityId: 'copenhagen', seedIds: ['fcc:copenhagen:seed'], category: 'coffee' as const };
const content = { city: { id: 'copenhagen' }, places: [{ id: input.seedIds[0], name: 'FCC Seed' }] } as FccCityContent;
const result = { status: 'ok', modelId: 'muse-spark-1.3-contributor', cityId: 'copenhagen', retrievedAt: '2026-11-05T00:00:00.000Z', candidates: [] };
const config = { enabled: true, projectId: 'nonhumanintelligence', appId: '1:944001311456:web:fixture', appCheckSiteKey: 'FICTIONAL-APP-CHECK-SITE-KEY' };

it('dispatches the public mode only after explicit consent, preserving result validation', async () => {
  const post = vi.fn(async () => new Response(JSON.stringify(result))), unused = vi.fn();
  const signal = new AbortController().signal;
  await expect(requestDiscovery(input, content, signal, unused, { transport: 'firebase-attested', contributorConsent: false, post })).rejects.toThrow(/agree|consent/);
  expect(post).not.toHaveBeenCalled();
  const reviewed = await requestDiscovery(input, content, signal, unused, { transport: 'firebase-attested', contributorConsent: true, post });
  expect(reviewed).toEqual(result);expect(unused).not.toHaveBeenCalled();
  expect(post).toHaveBeenCalledWith(input, { contributorConsent: true, signal });
  await expect(requestDiscovery({ ...input, boardId: 'PRIVATE' } as typeof input, content, signal, unused, { transport: 'firebase-attested', contributorConsent: true, post })).rejects.toThrow();
  expect(post).toHaveBeenCalledTimes(1);
  post.mockImplementationOnce(async () => new Response(JSON.stringify({ ...result, cityId: 'paris' })));
  await expect(requestDiscovery(input, content, signal, unused, { transport: 'firebase-attested', contributorConsent: true, post })).rejects.toThrow(/city changed/);
});

it('reuses the guest identity but obtains fresh attestation and request IDs for each explicit request', async () => {
  const sent: RequestInit[] = [];
  const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    if (url === '/discovery-public.json') return new Response(JSON.stringify(config));
    expect(url).toBe('/api/muse/discover');sent.push(options!);return new Response(JSON.stringify(result));
  });
  let token = 0;
  const identity = vi.fn(async () => ({ idToken: async () => 'FICTIONAL-ID-TOKEN', appCheckToken: async () => 'FICTIONAL-ATTESTATION-' + ++token }));
  const client = createAttestedDiscoveryClient({ fetcher, identity }), signal = new AbortController().signal;
  await client.post(input, { contributorConsent: true, signal });await client.post(input, { contributorConsent: true, signal });
  expect(identity).toHaveBeenCalledTimes(1);expect(token).toBe(2);
  const bodies = sent.map(request => JSON.parse(String(request.body)));
  for (const body of bodies) { expect(body).toMatchObject({ ...input, contributorConsent: true });expect(body.requestId).toMatch(/^[a-f\d-]{36}$/);expect(Object.keys(body).sort()).toEqual(['category','cityId','contributorConsent','requestId','seedIds']); }
  expect(bodies[0].requestId).not.toBe(bodies[1].requestId);
  expect(sent.map(request => (request.headers as Record<string,string>)['x-firebase-appcheck'])).toEqual(['FICTIONAL-ATTESTATION-1','FICTIONAL-ATTESTATION-2']);
  expect(sent[0]).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { authorization: 'Bearer FICTIONAL-ID-TOKEN' } });
});

it('fails closed before identity or POST when disabled, malformed, unconsented or cancelled', async () => {
  const identity = vi.fn(), fetcher = vi.fn(async () => new Response(JSON.stringify({ enabled: false })));
  const client = createAttestedDiscoveryClient({ fetcher, identity });
  await expect(client.post(input, { contributorConsent: false, signal: new AbortController().signal })).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  await expect(client.post(input, { contributorConsent: true, signal: new AbortController().signal })).rejects.toThrow();expect(identity).not.toHaveBeenCalled();
  const abort = new AbortController();abort.abort();fetcher.mockClear();
  await expect(client.post(input, { contributorConsent: true, signal: abort.signal })).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});

it('never sends the discovery POST when identity initialization finishes after Stop', async () => {
  let finish!: (value: { idToken: () => Promise<string>; appCheckToken: () => Promise<string> }) => void;
  const identity = vi.fn(() => new Promise<{ idToken: () => Promise<string>; appCheckToken: () => Promise<string> }>(resolve => { finish = resolve; }));
  const fetcher = vi.fn(async () => new Response(JSON.stringify(config)));
  const client = createAttestedDiscoveryClient({ fetcher, identity }), abort = new AbortController();
  const pending = client.post(input, { contributorConsent: true, signal: abort.signal });
  await vi.waitFor(() => expect(identity).toHaveBeenCalledOnce());abort.abort();
  await expect(pending).rejects.toThrow(/stopped/);
  finish({ idToken: async () => 'FICTIONAL', appCheckToken: async () => 'FICTIONAL' });
  await Promise.resolve();expect(fetcher).toHaveBeenCalledTimes(1);
});
