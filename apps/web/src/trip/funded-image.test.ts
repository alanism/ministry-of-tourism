import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createFundedImageClient, FUNDED_IMAGE_LIMITS } from './funded-image';

const source = new Blob([readFileSync(new URL('../../public/assets/landing-carousel/slide-09-background.jpg', import.meta.url))], { type: 'image/jpeg' });
const config = { enabled: true, projectId: 'nonhumanintelligence', appId: '1:944001311456:web:fixture', appCheckSiteKey: 'FICTIONAL-SITE-KEY-FOR-TEST' };
const ready = { available: true, transport: 'firebase-attested-image', readiness: 'configured-only', limits: { guestLifetime: 2, globalDaily: 20, globalLifetime: 100, concurrency: 1 } };
const png = readFileSync(new URL('../../public/assets/photo-illustration/fashion-reference.png', import.meta.url));
const output = { status: 'ok', data: [{ b64_json: png.toString('base64') }], output_format: 'png', model: 'muse-image-1.0', createdAt: '2026-11-05T00:00:00.000Z', elapsedMs: 1000, width: 431, height: 433 };
const signal = () => new AbortController().signal;
function fixture(options: { disabled?: boolean; available?: boolean; response?: unknown; responseStatus?: number } = {}) {
  const posts: RequestInit[] = []; let tokens = 0;
  const identity = vi.fn(async () => ({ idToken: async () => 'FICTIONAL-ID', appCheckToken: async () => 'FICTIONAL-ATTESTATION-' + ++tokens }));
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url === '/api/muse/images/status') return new Response(JSON.stringify({ ...ready, available: options.available !== false }));
    if (url === '/discovery-public.json') return new Response(JSON.stringify(options.disabled ? {enabled:false} : config));
    expect(url).toBe('https://us-central1-nonhumanintelligence.cloudfunctions.net/motFundedImages/api/muse/images/edit'); posts.push(init!);
    return new Response(JSON.stringify(options.response ?? output), { status: options.responseStatus ?? 200 });
  });
  const decode = vi.fn(async () => ({ width: output.width, height: output.height }));
  return { client: createFundedImageClient({ fetcher, identity, decode }), fetcher, identity, posts, decode };
}
it('checks separate configured readiness without creating an identity or sending a photo', async () => {
  const { client, identity, posts } = fixture();
  expect(await client.status(signal())).toMatchObject({ available: true, limits: FUNDED_IMAGE_LIMITS });
  expect(identity).not.toHaveBeenCalled(); expect(posts).toHaveLength(0);
});
it('sends exactly a consented source/style/UUID, reuses identity and gets fresh attestation for each click', async () => {
  const { client, identity, posts } = fixture();
  for (const style of ['fashion', 'city'] as const) {
    const result = await client.generate({ style, source, photoConsent: true, signal: signal() });
    expect(result).toMatchObject({ mime: 'image/png', model: 'muse-image-1.0', width: output.width, height: output.height });
    expect(Buffer.from(await result.blob.arrayBuffer())).toEqual(png);
  }
  expect(identity).toHaveBeenCalledOnce(); expect(posts).toHaveLength(2);
  const bodies = posts.map(post => JSON.parse(String(post.body)));
  for (const body of bodies) {
    expect(Object.keys(body).sort()).toEqual(['consent', 'photoBase64', 'requestId', 'style']);
    expect(body.photoBase64).toBe(Buffer.from(await source.arrayBuffer()).toString('base64'));
    expect(body.consent).toBe(true); expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
  }
  expect(bodies[0].requestId).not.toBe(bodies[1].requestId);
  expect(posts.map(post => (post.headers as Record<string, string>)['x-firebase-appcheck'])).toEqual(['FICTIONAL-ATTESTATION-1', 'FICTIONAL-ATTESTATION-2']);
  expect(posts[0]).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { authorization: 'Bearer FICTIONAL-ID', 'x-mot-request': '1' } });
});
it('fails closed before authentication for unavailable/disabled preview, absent consent and invalid photos', async () => {
  for (const options of [{ disabled: true }, { available: false }]) {
    const { client, identity, posts } = fixture(options);
    await expect(client.generate({ style: 'fashion', source, photoConsent: true, signal: signal() })).rejects.toThrow();
    expect(identity).not.toHaveBeenCalled(); expect(posts).toHaveLength(0);
  }
  const { client, fetcher, identity } = fixture();
  for (const request of [
    { source, photoConsent: false },
    { source: new Blob([png], { type: 'image/png' }), photoConsent: true },
    { source: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), photoConsent: true },
  ]) await expect(client.generate({ style: 'fashion', signal: signal(), ...request })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled(); expect(identity).not.toHaveBeenCalled();
});
it('makes no POST after Stop even when identity initialization finishes late', async () => {
  const value = fixture(); let finish!: (identity: { idToken: () => Promise<string>; appCheckToken: () => Promise<string> }) => void;
  const identity = vi.fn(() => new Promise<{ idToken: () => Promise<string>; appCheckToken: () => Promise<string> }>(resolve => { finish = resolve; }));
  const client = createFundedImageClient({ fetcher: value.fetcher, identity }); const abort = new AbortController();
  const pending = client.generate({ style: 'fashion', source, photoConsent: true, signal: abort.signal });
  await vi.waitFor(() => expect(identity).toHaveBeenCalledOnce()); abort.abort(); await expect(pending).rejects.toThrow();
  finish({ idToken: async () => 'FICTIONAL', appCheckToken: async () => 'FICTIONAL' }); await Promise.resolve(); expect(value.posts).toHaveLength(0);
});
it('never retries or falls back to BYOK on an exhausted allowance or uncertain provider response', async () => {
  const { client, posts } = fixture({ responseStatus: 429, response: { status: 'error', code: 'rate_limited', reason: 'Free allowance used.' } });
  await expect(client.generate({ style: 'fashion', source, photoConsent: true, signal: signal() })).rejects.toThrow(/allowance/i);
  expect(posts).toHaveLength(1);
});
it('rejects malformed, extra-image and mismatched PNG results before review', async () => {
  for (const response of [{ ...output, width: 1 }, { ...output, data: [...output.data, ...output.data] }, { ...output, data: [{ b64_json: '<svg/>' }] }, { ...output, model: 'unexpected-model' }]) {
    const { client, posts } = fixture({ response });
    await expect(client.generate({ style: 'fashion', source, photoConsent: true, signal: signal() })).rejects.toThrow(); expect(posts).toHaveLength(1);
  }
});
