import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveChatGPT } from './firebase-adapter.ts';

describe('Firebase HTTP transport', () => {
  let server: Server;
  let baseUrl: string;
  let handler: (request: Request) => Promise<Response>;
  beforeAll(async () => {
    server = createServer((request, response) => { void serveChatGPT(request, response, request => handler(request), 'https://writersboard.web.app'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = 'http://127.0.0.1:' + (typeof address === 'object' && address ? address.port : 0);
  });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('forwards first-party cookies and CSRF with the configured origin and JSON payload', async () => {
    handler = async request => {
      expect(request.url).toBe('https://writersboard.web.app/api/chatgpt/responses');
      expect(request.headers.get('cookie')).toBe('__session=opaque');
      expect(request.headers.get('x-csrf-token')).toBe('csrf');
      expect(await request.json()).toEqual({ input: 'essay' });
      return Response.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
    };
    const response = await fetch(baseUrl + '/api/chatgpt/responses', {
      method: 'POST', headers: { cookie: '__session=opaque', 'x-csrf-token': 'csrf', 'content-type': 'application/json' }, body: JSON.stringify({ input: 'essay' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('passes OAuth redirect and secure session cookie without following it', async () => {
    handler = async () => new Response(null, { status: 302, headers: { location: 'https://auth.openai.com/authorize', 'set-cookie': '__session=opaque; HttpOnly; Secure; SameSite=Lax' } });
    const response = await fetch(baseUrl + '/api/chatgpt/start', { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://auth.openai.com/authorize');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure');
  });

  it('streams a Responses result through the actual HTTP connection', async () => {
    handler = async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"response.completed"}\n\n')); controller.close(); },
    }), { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'request-id' } });
    const response = await fetch(baseUrl + '/api/chatgpt/responses', { method: 'POST', body: '{}' });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('x-request-id')).toBe('request-id');
    expect(await response.text()).toContain('response.completed');
  });

  it('rejects oversized HTTP bodies before calling the authenticated handler', async () => {
    let calls = 0;
    handler = async () => { calls++; return Response.json({}); };
    const response = await fetch(baseUrl + '/api/chatgpt/responses', { method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1) });
    expect(response.status).toBe(413);
    expect(calls).toBe(0);
  });
});
