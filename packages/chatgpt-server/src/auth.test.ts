import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createChatGPTHandler, type ChatGPTConfig, type ConnectionStore, type StoredConnection } from './auth.ts';

const origin = 'https://writersboard.web.app';
const issuer = 'https://auth.openai.com';
const clientId = 'oaiapp_test';
const scope = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
let signingKey: CryptoKey;
let jwk: Record<string, unknown>;

class MemoryStore implements ConnectionStore {
  records = new Map<string, StoredConnection>();
  async read(key: string) { return structuredClone(this.records.get(key)); }
  async transact<T>(key: string, change: (record: StoredConnection | undefined) => { next?: StoredConnection; result: T }) {
    const { next, result } = change(structuredClone(this.records.get(key)));
    if (next) this.records.set(key, structuredClone(next));
    else this.records.delete(key);
    return result;
  }
}

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  signingKey = keys.privateKey;
  jwk = { ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' };
});

describe('hosted ChatGPT connection', () => {
  let store: MemoryStore;
  let handler: (request: Request) => Promise<Response>;
  let now: number;
  let tokenStatus: number;
  let tokenError: string;
  let tokenScope: string;
  let tokenClaims: Record<string, unknown>;
  let calls: { url: string; init?: RequestInit }[];
  let responsesBody: string;
  let responseStatus: number;
  let revokeStatus: number;
  let exchangeHook: (() => Promise<void>) | undefined;
  let authMethod: 'client_secret_post' | 'client_secret_basic' | 'none';
  let configuration: ChatGPTConfig;
  let tokenKey: CryptoKey;

  const request = (path: string, options: RequestInit = {}) => new Request(origin + '/api/chatgpt/' + path, options);
  const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]!;
  const headers = (cookie: string, csrfToken?: string) => ({
    cookie, origin, ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
  });
  const post = (cookie: string, csrf: string, body: unknown) => handler(request('responses', {
    method: 'POST', headers: { ...headers(cookie, csrf), 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));

  beforeEach(() => {
    now = Date.now();
    store = new MemoryStore();
    calls = [];
    tokenStatus = 200;
    tokenError = 'invalid_grant';
    tokenScope = scope;
    tokenClaims = {};
    responseStatus = 200;
    revokeStatus = 200;
    responsesBody = 'event: response.completed\ndata: {"type":"response.completed","response":{"output":[]}}\n\n';
    exchangeHook = undefined;
    authMethod = 'client_secret_basic';
    tokenKey = signingKey;
    configuration = {
      clientId, appOrigin: origin, redirectUri: origin + '/api/chatgpt/callback',
      tokenAuthMethod: authMethod, clientSecret: 'server-secret',
    };
    handler = createChatGPTHandler(configuration, {
      store, now: () => now,
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.endsWith('/.well-known/openid-configuration')) return Response.json({
          issuer, authorization_endpoint: issuer + '/api/accounts/authorize',
          token_endpoint: issuer + '/api/accounts/oauth/token', jwks_uri: issuer + '/.well-known/jwks.json',
          revocation_endpoint: issuer + '/api/accounts/oauth/revoke',
        });
        if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] });
        if (url.endsWith('/oauth/token')) {
          const body = new URLSearchParams(String(init?.body));
          if (exchangeHook) await exchangeHook();
          if (tokenStatus !== 200) return Response.json({ error: tokenError, detail: 'PRIVATE_UPSTREAM_ERROR' }, { status: tokenStatus });
          const transaction = [...store.records.values()].find(r => r.kind === 'transaction');
          const nonce = (transaction?.kind === 'transaction' ? transaction.nonce : undefined) ?? tokenClaims.nonce;
          const idToken = await new SignJWT({
            sub: 'writer-1', iss: issuer, aud: clientId, iat: Math.floor(now / 1000),
            exp: Math.floor(now / 1000) + 300, nonce, name: 'Writer', email: 'writer@example.com', ...tokenClaims,
          }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(tokenKey);
          return Response.json({
            access_token: body.get('grant_type') === 'refresh_token' ? 'renewed-access-secret' : 'access-secret',
            refresh_token: 'refresh-secret', id_token: idToken, token_type: 'Bearer', expires_in: 3600, scope: tokenScope,
          });
        }
        if (url.endsWith('/oauth/revoke')) return new Response('', { status: revokeStatus });
        if (url === 'https://api.openai.com/v1/models') return Response.json({ models: [
          { slug: 'account-first', display_name: 'Account First', visibility: 'list', secret: 'hidden' },
          { slug: 'hidden', display_name: 'Hidden', visibility: 'hide' },
          { slug: 'account-second', display_name: 'Account Second', visibility: 'list' },
        ] });
        if (url === 'https://api.openai.com/v1/responses') return new Response(responsesBody, {
          status: responseStatus, headers: { 'content-type': responseStatus === 200 ? 'text/event-stream' : 'application/json', 'x-request-id': 'request-test' },
        });
        throw new Error('Unexpected upstream URL');
      },
    });
  });

  async function begin() {
    const response = await handler(request('start'));
    const authorization = new URL(response.headers.get('location')!);
    const cookie = cookieOf(response);
    tokenClaims.nonce = authorization.searchParams.get('nonce');
    return { response, authorization, cookie };
  }

  async function complete() {
    const start = await begin();
    const callback = await handler(request('callback?' + new URLSearchParams({
      state: start.authorization.searchParams.get('state')!, code: 'one-time-code',
    }), { headers: { cookie: start.cookie } }));
    const cookie = cookieOf(callback);
    const sessionResponse = await handler(request('session', { headers: { cookie } }));
    return { cookie, callback, session: await sessionResponse.json() as { connected: boolean; planEnabled: boolean; csrfToken: string } };
  }

  it('returns a private disconnected session without contacting OpenAI', async () => {
    const response = await handler(request('session'));
    expect(await response.json()).toEqual({ connected: false, planEnabled: false });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(calls).toHaveLength(0);
  });

  it('starts approved-client OAuth with PKCE, nonce, API resource and a secure opaque cookie', async () => {
    const { response, authorization, cookie } = await begin();
    expect(response.status).toBe(302);
    expect(authorization.origin).toBe(issuer);
    expect(Object.fromEntries(authorization.searchParams)).toMatchObject({
      client_id: clientId, scope, response_type: 'code', code_challenge_method: 'S256',
      redirect_uri: origin + '/api/chatgpt/callback', resource: 'https://api.openai.com/v1',
    });
    expect(authorization.searchParams.get('state')).toBeTruthy();
    expect(authorization.searchParams.get('nonce')).toBeTruthy();
    expect(authorization.searchParams.has('code_verifier')).toBe(false);
    expect(authorization.searchParams.has('client_secret')).toBe(false);
    expect(cookie).toMatch(/^__session=[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    expect([...store.records.keys()]).not.toContain(cookie.split('=')[1]);
  });

  it('validates identity and rotates into a token-free browser session', async () => {
    const { cookie, callback, session } = await complete();
    expect(callback.headers.get('location')).toBe('/?chatgpt=connected');
    expect(session).toMatchObject({ connected: true, planEnabled: true, account: { name: 'Writer', email: 'writer@example.com' } });
    expect(session.csrfToken).toBeTruthy();
    expect(JSON.stringify(session)).not.toMatch(/access-secret|refresh-secret|server-secret|id_token/);
    const exchange = calls.find(c => c.url.endsWith('/oauth/token'))!;
    expect(new Headers(exchange.init?.headers).get('authorization')).toMatch(/^Basic /);
    expect(new URLSearchParams(String(exchange.init?.body)).has('client_secret')).toBe(false);
    expect(store.records.size).toBe(1);
    expect(cookie).toMatch(/^__session=/);
  });

  it.each(['state', 'expired', 'reused', 'missing-cookie', 'denied'])(
    'rejects %s OAuth transactions before exchanging any code', async failure => {
      const { authorization, cookie } = await begin();
      if (failure === 'expired') now += 11 * 60 * 1000;
      const path = 'callback?' + new URLSearchParams({
        state: failure === 'state' ? 'wrong' : authorization.searchParams.get('state')!, code: 'code',
        ...(failure === 'denied' ? { error: 'access_denied' } : {}),
      });
      if (failure === 'reused') {
        await handler(request(path, { headers: { cookie } }));
        calls.length = 0;
      }
      const response = await handler(request(path, { headers: failure === 'missing-cookie' ? {} : { cookie } }));
      expect(response.headers.get('location')).toBe('/?chatgpt=error');
      expect(calls.filter(c => c.url.endsWith('/oauth/token'))).toHaveLength(0);
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    },
  );

  it.each([{ nonce: 'wrong' }, { aud: 'another-client' }, { iss: 'https://attacker.example' }, { exp: 1 }])(
    'rejects invalid ID claims %j', async invalid => {
      const { authorization, cookie } = await begin();
      tokenClaims = { ...tokenClaims, ...invalid };
      const response = await handler(request('callback?' + new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'code' }), { headers: { cookie } }));
      expect(response.headers.get('location')).toBe('/?chatgpt=error');
      expect([...store.records.values()].filter(r => r.kind === 'session')).toHaveLength(0);
    },
  );

  it('retains identity-only sign-in while denying plan inference', async () => {
    tokenScope = 'openid email profile';
    const { cookie, session } = await complete();
    expect(session.connected).toBe(true);
    expect(session.planEnabled).toBe(false);
    const response = await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Hello' }] });
    expect(response.status).toBe(403);
    expect(await response.text()).toContain('ChatGPT plan');
    expect(calls.some(c => c.url.endsWith('/v1/responses'))).toBe(false);
  });

  it('does not expose token exchange errors', async () => {
    tokenStatus = 400;
    const { callback } = await complete();
    expect(callback.headers.get('location')).toBe('/?chatgpt=error');
    expect(await callback.text()).not.toContain('PRIVATE_UPSTREAM_ERROR');
  });

  it('rejects an ID token signed by an untrusted key', async () => {
    tokenKey = (await generateKeyPair('RS256')).privateKey;
    const { callback } = await complete();
    expect(callback.headers.get('location')).toBe('/?chatgpt=error');
    expect(store.records.size).toBe(0);
  });

  it.each(['client_secret_post', 'none'] as const)('uses the provisioned %s token authentication method', async method => {
    configuration.tokenAuthMethod = method;
    if (method === 'none') delete configuration.clientSecret;
    const { session } = await complete();
    expect(session.connected).toBe(true);
    const call = calls.find(call => call.url.endsWith('/oauth/token'))!;
    const form = new URLSearchParams(String(call.init?.body));
    expect(new Headers(call.init?.headers).has('authorization')).toBe(false);
    expect(form.get('client_secret')).toBe(method === 'client_secret_post' ? 'server-secret' : null);
  });

  it('fails closed when a confidential client secret is absent', async () => {
    delete configuration.clientSecret;
    const response = await handler(request('start'));
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it('lists visible account models in server order without private metadata', async () => {
    const { cookie } = await complete();
    const response = await handler(request('models', { headers: { cookie } }));
    expect(await response.json()).toEqual({ models: [
      { slug: 'account-first', display_name: 'Account First' },
      { slug: 'account-second', display_name: 'Account Second' },
    ] });
  });

  it.each(['missing-origin', 'wrong-origin', 'missing-csrf', 'wrong-csrf'])(
    'denies %s inference before contacting upstream', async failure => {
      const { cookie, session } = await complete();
      const requestHeaders = new Headers({ ...headers(cookie, session.csrfToken), 'content-type': 'application/json' });
      if (failure === 'missing-origin') requestHeaders.delete('origin');
      if (failure === 'wrong-origin') requestHeaders.set('origin', 'https://attacker.example');
      if (failure === 'missing-csrf') requestHeaders.delete('x-csrf-token');
      if (failure === 'wrong-csrf') requestHeaders.set('x-csrf-token', 'wrong');
      const response = await handler(request('responses', { method: 'POST', headers: requestHeaders, body: JSON.stringify({ model: 'account-first', input: [{ role: 'user', content: 'hi' }] }) }));
      expect(response.status).toBe(403);
      expect(calls.some(c => c.url.endsWith('/v1/responses'))).toBe(false);
    },
  );

  it('streams text responses with required storage/stream flags and no API-key fallback', async () => {
    const { cookie, session } = await complete();
    const response = await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Analyze this essay' }], store: true, stream: false });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(responsesBody);
    const inference = calls.find(c => c.url.endsWith('/v1/responses'))!;
    expect(JSON.parse(String(inference.init?.body))).toMatchObject({ store: false, stream: true });
    expect(new Headers(inference.init?.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it.each([
    { tools: [{ type: 'image_generation' }] }, { tools: [{ type: 'web_search' }] },
    { input: [{ role: 'user', content: [{ type: 'input_audio', data: 'secret' }] }] },
    { input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.com/image.png' }] }] },
    { input: [{ role: 'user', content: [{ type: 'input_file', file_id: 'file-123' }] }] },
    { input: [{ type: 'message', role: 'system', content: 'Hello' }] },
    { tools: [{ type: 'function', name: 'shell', parameters: {} }] },
    { tools: [{ type: 'namespace', name: 'foreign', tools: [] }] },
    { temperature: 0.4 }, { previous_response_id: 'resp_123' },
  ])('rejects unsupported content or capabilities %j', async unsupported => {
    const { cookie, session } = await complete();
    const response = await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Text' }], ...unsupported });
    expect(response.status).toBe(400);
    expect(calls.some(c => c.url.endsWith('/v1/responses'))).toBe(false);
  });

  it('accepts board namespaced functions and function-output text history', async () => {
    const { cookie, session } = await complete();
    const response = await post(cookie, session.csrfToken, {
      model: 'account-first', input: [{ role: 'user', content: 'Coach me' }, { type: 'function_call', name: 'read_board', namespace: 'writers_board', call_id: 'call_1', arguments: '{}' }, { type: 'function_call_output', call_id: 'call_1', output: '{"cards":[]}' }],
      tools: [{ type: 'namespace', name: 'writers_board', tools: [{ type: 'function', name: 'read_board', parameters: { type: 'object', properties: {} } }] }],
    });
    expect(response.status).toBe(200);
  });

  it('preserves supported output metadata in stateless continuation history', async () => {
    const { cookie, session } = await complete();
    const history = [
      { role: 'user', content: 'Coach me' },
      { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Reviewing the board.', annotations: [] }] },
      { type: 'reasoning', summary: [], content: [{ type: 'reasoning_text', text: 'Consider structure.' }], encrypted_content: 'encrypted-history' },
      { type: 'function_call', name: 'read_board', namespace: 'writers_board', call_id: 'call_1', arguments: '{}', caller: { type: 'direct' }, async: false, created_by: 'agent' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"cards":[]}' },
    ];
    expect((await post(cookie, session.csrfToken, { model: 'account-first', input: history })).status).toBe(200);
    expect(JSON.parse(String(calls.find(call => call.url.endsWith('/v1/responses'))!.init?.body)).input).toEqual(history);
  });

  it('renews expiring credentials before inference and rotates refresh credentials once', async () => {
    const { cookie, session } = await complete();
    now += 3590 * 1000;
    const response = await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Hi' }] });
    expect(response.status).toBe(200);
    const refresh = calls.filter(c => c.url.endsWith('/oauth/token') && new URLSearchParams(String(c.init?.body)).get('grant_type') === 'refresh_token');
    expect(refresh).toHaveLength(1);
    expect(new URLSearchParams(String(refresh[0]!.init?.body)).get('resource')).toBe('https://api.openai.com/v1');
    expect(new URLSearchParams(String(refresh[0]!.init?.body)).has('scope')).toBe(false);
    expect(new Headers(calls.find(c => c.url.endsWith('/v1/responses'))!.init?.headers).get('authorization')).toBe('Bearer renewed-access-secret');
  });

  it('serializes concurrent refreshes across shared store transactions', async () => {
    const { cookie, session } = await complete();
    now += 3590 * 1000;
    const responses = await Promise.all([1, 2].map(() => post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Hi' }] })));
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(calls.filter(call => call.url.endsWith('/oauth/token') && new URLSearchParams(String(call.init?.body)).get('grant_type') === 'refresh_token')).toHaveLength(1);
  });

  it.each(['invalid_client', 'invalid_request'])('preserves saved credentials when refresh fails with %s', async error => {
    const { cookie, session } = await complete();
    now += 3590 * 1000;
    tokenStatus = 401; tokenError = error;
    expect((await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Hi' }] })).status).toBe(503);
    const saved = [...store.records.values()][0];
    expect(saved?.kind === 'session' && saved.refreshToken).toBe('refresh-secret');
  });

  it('clears an explicitly invalidated refresh grant', async () => {
    const { cookie, session } = await complete();
    now += 3590 * 1000;
    tokenStatus = 400; tokenError = 'refresh_token_invalidated';
    expect((await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Hi' }] })).status).toBe(401);
    expect(store.records.size).toBe(0);
  });

  it('does not resurrect a disconnected session after an in-flight refresh', async () => {
    const { cookie, session } = await complete();
    now += 3590 * 1000;
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    exchangeHook = () => { entered(); return pending; };
    const inference = post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'Hi' }] });
    await started;
    await handler(request('disconnect', { method: 'POST', headers: headers(cookie, session.csrfToken) }));
    release();
    expect((await inference).status).toBe(401);
    expect(store.records.size).toBe(0);
    expect(calls.some(c => c.url.endsWith('/v1/responses'))).toBe(false);
  });

  it('clears local credentials and reports unconfirmed remote revocation', async () => {
    const { cookie, session } = await complete();
    revokeStatus = 503;
    const response = await handler(request('disconnect', { method: 'POST', headers: headers(cookie, session.csrfToken) }));
    expect(await response.json()).toMatchObject({ connected: false, revocationConfirmed: false });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(store.records.size).toBe(0);
  });

  it('rejects requests larger than the bounded text payload', async () => {
    const { cookie, session } = await complete();
    expect((await post(cookie, session.csrfToken, { model: 'account-first', input: [{ role: 'user', content: 'x'.repeat(2 * 1024 * 1024) }] })).status).toBe(413);
  });

  it('aborts an upstream request before the Firebase Hosting deadline with an actionable error', async () => {
    const { cookie, session } = await complete();
    const slow = createChatGPTHandler({ clientId, appOrigin: origin, redirectUri: origin + '/api/chatgpt/callback', tokenAuthMethod: 'none' }, {
      store, now: () => now, responseTimeoutMs: 10,
      fetch: async (_url, options) => new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
      }),
    });
    const response = await slow(request('responses', { method: 'POST', headers: { ...headers(cookie, session.csrfToken), 'content-type': 'application/json' }, body: JSON.stringify({ model: 'account-first', input: [{ role: 'user', content: 'Hi' }] }) }));
    expect(response.status).toBe(504);
    expect(await response.text()).toContain('shorter piece');
  });

  it('ends an unfinished stream at the deadline and cancels the upstream generation', async () => {
    const { cookie, session } = await complete();
    let cancelled = false;
    const slow = createChatGPTHandler({ clientId, appOrigin: origin, redirectUri: origin + '/api/chatgpt/callback', tokenAuthMethod: 'none' }, {
      store, now: () => now, responseTimeoutMs: 10,
      fetch: async () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"partial"}\n\n')); },
        cancel() { cancelled = true; },
      }), { headers: { 'content-type': 'text/event-stream' } }),
    });
    const response = await slow(request('responses', { method: 'POST', headers: { ...headers(cookie, session.csrfToken), 'content-type': 'application/json' }, body: JSON.stringify({ model: 'account-first', input: [{ role: 'user', content: 'Hi' }] }) }));
    const body = await response.text();
    expect(body).toContain('chatgpt_timeout');
    expect(body).not.toContain('response.completed');
    expect(cancelled).toBe(true);
  });
});
