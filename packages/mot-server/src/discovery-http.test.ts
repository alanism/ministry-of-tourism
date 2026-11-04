import { afterEach, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createMuseHttpServer } from './server.ts';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function open(origin = 'http://127.0.0.1:5173') {
  const fetcher = vi.fn(async () => new Response('{}'));
  const server = createMuseHttpServer({ MOT_ORIGIN: origin, MOT_DISCOVERY_MODE: 'loopback-preview', MOT_DISCOVERY_CONTRIBUTOR_ACK: 'true', META_API_KEY: 'fictional-only' }, { log: () => {} }, { fetcher });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  return { base: `http://127.0.0.1:${address.port}`, fetcher };
}
const headers = { origin: 'http://127.0.0.1:5173', 'x-mot-request': '1', 'content-type': 'application/json' };
it('rejects cross-origin, missing intent headers and oversized/chunked discovery input before provider access', async () => {
  const { base, fetcher } = await open();
  for (const h of [{ ...headers, origin: 'https://unrelated.example' }, { origin: headers.origin, 'content-type': 'application/json' }, { ...headers, 'content-type': 'text/plain' }]) {
    expect((await fetch(`${base}/api/muse/discover`, { method: 'POST', headers: h, body: '{}' })).status).toBe(403);
  }
  expect((await fetch(`${base}/api/muse/discover`, { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(3000) }) })).status).toBe(413);
  expect((await fetch(`${base}/api/muse/discover`, { method: 'POST', headers, body: '{bad json' })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it('fails closed for a nonlocal deployment even when preview variables are present', async () => {
  const { base, fetcher } = await open('https://ministryoftourism.web.app');
  expect(await (await fetch(`${base}/api/muse/discovery-status`)).json()).toMatchObject({ available: false });
  expect((await fetch(`${base}/api/muse/discover`, { method: 'POST', headers: { ...headers, origin: 'https://ministryoftourism.web.app' }, body: '{}' })).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
it('shares the existing per-address rate limiter across discovery calls', async () => {
  const { base, fetcher } = await open();
  for (let i = 0; i < 6; i++) expect((await fetch(`${base}/api/muse/discover`, { method: 'POST', headers, body: '{}' })).status).toBe(400);
  expect((await fetch(`${base}/api/muse/discover`, { method: 'POST', headers, body: '{}' })).status).toBe(429);
  expect(fetcher).not.toHaveBeenCalled();
});
