import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const TRANSACTION_AGE = 10 * 60 * 1000;
const MAX_BODY = 2 * 1024 * 1024;

export interface ChatGPTConfig {
  clientId: string;
  appOrigin: string;
  redirectUri: string;
  tokenAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  clientSecret?: string;
}

interface Transaction {
  kind: 'transaction';
  expiresAt: number;
  stateHash: string;
  nonce: string;
  verifier: string;
  previousSessionKey?: string;
  expectedSubject?: string;
}

interface Session {
  kind: 'session';
  expiresAt: number;
  subject: string;
  issuer: string;
  clientId: string;
  account: { name?: string; email?: string };
  csrfToken: string;
  scope: string;
  accessToken?: string;
  refreshToken?: string;
  accessExpiresAt?: number;
  refreshLease?: { id: string; until: number };
}

export type StoredConnection = Transaction | Session;
export interface ConnectionStore {
  read(key: string): Promise<StoredConnection | undefined>;
  transact<T>(key: string, change: (record: StoredConnection | undefined) => { next?: StoredConnection; result: T }): Promise<T>;
}

interface Dependencies {
  store: ConnectionStore;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  responseTimeoutMs?: number;
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
}

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

const random = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const cookie = (id: string, age: number) => `__session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const disconnected = { connected: false, planEnabled: false };
const timeoutMessage = 'ChatGPT took too long. Try a shorter piece or lower reasoning effort.';
const hasPlan = (session: Session) => session.scope.split(/\s+/).includes('chatgpt.tokens.use.direct') && !!session.accessToken;

function browserKey(request: Request): string | undefined {
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('__session='))?.slice(10);
  return value && /^[\w-]{43}$/.test(value) ? hash(value) : undefined;
}

function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...extra } });
}

function redirect(location: string, sessionCookie: string): Response {
  return new Response(null, { status: 302, headers: {
    location, 'set-cookie': sessionCookie, 'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
  } });
}

function writingStream(body: ReadableStream<Uint8Array>, deadline: AbortSignal, abort: AbortSignal) {
  const reader = body.getReader();
  let ended = false;
  let cleanUp = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const timeout = () => {
        if (ended) return;
        ended = true; cleanUp();
        controller.enqueue(new TextEncoder().encode('event: error\ndata: ' + JSON.stringify({ type: 'error', code: 'chatgpt_timeout', message: timeoutMessage }) + '\n\n'));
        controller.close();
        void reader.cancel().catch(() => {});
      };
      const cancelled = () => {
        if (ended) return;
        ended = true; cleanUp(); controller.error(abort.reason);
        void reader.cancel().catch(() => {});
      };
      cleanUp = () => { deadline.removeEventListener('abort', timeout); abort.removeEventListener('abort', cancelled); };
      deadline.addEventListener('abort', timeout, { once: true });
      abort.addEventListener('abort', cancelled, { once: true });
      if (deadline.aborted) timeout();
      else if (abort.aborted) cancelled();
    },
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (ended) return;
        if (chunk.done) { ended = true; cleanUp(); controller.close(); }
        else controller.enqueue(chunk.value);
      } catch (error) { if (!ended) { ended = true; cleanUp(); controller.error(error); } }
    },
    cancel(reason) { ended = true; cleanUp(); return reader.cancel(reason); },
  });
}

function requireKeys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, 'This ChatGPT connection supports text writing requests and board functions only.');
}

/** Strictly constrain this endpoint to the three text features; voice/images retain their providers. */
function writingPayload(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new HttpError(400, 'Expected a text writing request.');
  requireKeys(value, ['model', 'input', 'instructions', 'tools', 'text', 'reasoning', 'include', 'store', 'stream']);
  if (typeof value.model !== 'string' || !/^[\w.:-]{1,150}$/.test(value.model)) throw new HttpError(400, 'Choose an available ChatGPT model.');
  if (!Array.isArray(value.input) || !value.input.length) throw new HttpError(400, 'Writing input must contain text messages.');
  for (const item of value.input) {
    if (!record(item)) throw new HttpError(400, 'Writing input must contain text messages.');
    if (item.type === 'function_call') {
      requireKeys(item, ['type', 'id', 'call_id', 'name', 'namespace', 'arguments', 'status', 'caller', 'async', 'created_by']);
      if (item.namespace !== 'writers_board' || typeof item.name !== 'string' || typeof item.call_id !== 'string' || typeof item.arguments !== 'string') throw new HttpError(400, 'Only Writer’s Board function calls are supported.');
      if (item.async !== undefined && item.async !== false) throw new HttpError(400, 'Asynchronous board functions are not supported.');
      if (item.caller !== undefined && item.caller !== null) {
        if (!record(item.caller) || item.caller.type !== 'direct') throw new HttpError(400, 'Only direct board functions are supported.');
        requireKeys(item.caller, ['type']);
      }
      if (item.created_by !== undefined && typeof item.created_by !== 'string') throw new HttpError(400, 'Unsupported board function metadata.');
    } else if (item.type === 'function_call_output') {
      requireKeys(item, ['type', 'id', 'call_id', 'output', 'status']);
      if (typeof item.call_id !== 'string' || typeof item.output !== 'string') throw new HttpError(400, 'Board function output must be text.');
    } else if (item.type === 'reasoning') {
      requireKeys(item, ['type', 'id', 'summary', 'encrypted_content', 'status', 'content']);
      if (!Array.isArray(item.summary) || item.summary.some(part => !record(part) || part.type !== 'summary_text' || typeof part.text !== 'string') || typeof item.encrypted_content !== 'string') throw new HttpError(400, 'Unsupported reasoning history.');
      if (item.content !== undefined && (!Array.isArray(item.content) || item.content.some(part => !record(part) || part.type !== 'reasoning_text' || typeof part.text !== 'string' || Object.keys(part).some(key => !['type', 'text'].includes(key))))) throw new HttpError(400, 'Unsupported reasoning content.');
    } else {
      requireKeys(item, ['type', 'id', 'role', 'content', 'status', 'phase']);
      if (item.phase !== undefined && item.phase !== null && !['commentary', 'final_answer'].includes(String(item.phase))) throw new HttpError(400, 'Unsupported writing message phase.');
      if (item.type !== undefined && item.type !== 'message') throw new HttpError(400, 'Only text writing input is supported.');
      if (!['user', 'developer', 'assistant'].includes(String(item.role))) throw new HttpError(400, 'Use instructions or developer messages for writing guidance.');
      if (typeof item.content !== 'string') {
        if (!Array.isArray(item.content) || item.content.some(part => !record(part) || !['input_text', 'output_text'].includes(String(part.type)) || typeof part.text !== 'string')) throw new HttpError(400, 'Voice, image and file input use the existing connections.');
        for (const part of item.content) requireKeys(part as Record<string, unknown>, ['type', 'text', 'annotations', 'logprobs']);
      }
    }
  }
  if (value.instructions !== undefined && typeof value.instructions !== 'string') throw new HttpError(400, 'Writing instructions must be text.');
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools)) throw new HttpError(400, 'Unsupported writing tools.');
    for (const namespace of value.tools) {
      if (!record(namespace)) throw new HttpError(400, 'Unsupported writing tools.');
      requireKeys(namespace, ['type', 'name', 'description', 'tools']);
      if (namespace.type !== 'namespace' || namespace.name !== 'writers_board' || !Array.isArray(namespace.tools)) throw new HttpError(400, 'Only Writer’s Board function tools are supported.');
      for (const tool of namespace.tools) {
        if (!record(tool)) throw new HttpError(400, 'Unsupported board function.');
        requireKeys(tool, ['type', 'name', 'description', 'parameters', 'strict']);
        if (tool.type !== 'function' || typeof tool.name !== 'string' || !/^[\w-]{1,64}$/.test(tool.name) || !record(tool.parameters)) throw new HttpError(400, 'Unsupported board function.');
      }
    }
  }
  if (value.reasoning !== undefined) {
    if (!record(value.reasoning)) throw new HttpError(400, 'Unsupported reasoning options.');
    requireKeys(value.reasoning, ['effort', 'summary']);
  }
  if (value.text !== undefined) {
    if (!record(value.text)) throw new HttpError(400, 'Unsupported writing output options.');
    requireKeys(value.text, ['format', 'verbosity']);
    if (value.text.format !== undefined) {
      if (!record(value.text.format)) throw new HttpError(400, 'Unsupported writing output format.');
      requireKeys(value.text.format, ['type', 'name', 'description', 'schema', 'strict']);
      if (!['text', 'json_schema', 'json_object'].includes(String(value.text.format.type))) throw new HttpError(400, 'Unsupported writing output format.');
    }
  }
  if (value.include !== undefined && (!Array.isArray(value.include) || value.include.some(item => item !== 'reasoning.encrypted_content'))) throw new HttpError(400, 'Unsupported response metadata.');
  return { ...value, store: false, stream: true };
}

export function createChatGPTHandler(config: ChatGPTConfig, dependencies: Dependencies): (request: Request) => Promise<Response> {
  const { store } = dependencies;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const now = dependencies.now ?? Date.now;
  let discoveryCache: { value: Discovery; expiresAt: number } | undefined;
  let jwksCache: ReturnType<typeof createRemoteJWKSet> | undefined;

  function validateConfig() {
    if (!config.clientId || !['client_secret_basic', 'client_secret_post', 'none'].includes(config.tokenAuthMethod) || (config.tokenAuthMethod !== 'none' && !config.clientSecret)) throw new HttpError(503, 'The hosted ChatGPT connection needs its approved OpenAI client configuration.');
    const app = new URL(config.appOrigin);
    const callback = new URL(config.redirectUri);
    if (app.protocol !== 'https:' || app.origin !== config.appOrigin || callback.origin !== app.origin || callback.pathname !== '/api/chatgpt/callback' || callback.search || callback.hash) throw new HttpError(503, 'The hosted ChatGPT callback must match the configured HTTPS app origin.');
  }

  async function upstream(url: string, init?: RequestInit) {
    return fetcher(url, { ...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(12_000) });
  }

  async function discovery(): Promise<Discovery> {
    if (discoveryCache && discoveryCache.expiresAt > now()) return discoveryCache.value;
    const response = await upstream(ISSUER + '/.well-known/openid-configuration');
    if (!response.ok) throw new HttpError(503, 'ChatGPT sign-in is temporarily unavailable. Try again.');
    const value: unknown = await response.json();
    if (!record(value) || value.issuer !== ISSUER) throw new HttpError(503, 'ChatGPT identity configuration could not be verified.');
    for (const field of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint']) {
      if (field === 'revocation_endpoint' && value[field] === undefined) continue;
      if (typeof value[field] !== 'string' || new URL(value[field]).origin !== ISSUER) throw new HttpError(503, 'ChatGPT identity endpoints could not be verified.');
    }
    discoveryCache = { value: value as unknown as Discovery, expiresAt: now() + 60 * 60 * 1000 };
    return discoveryCache.value;
  }

  function clientAuthentication(body: URLSearchParams): Headers {
    const headers = new Headers({ accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' });
    body.set('client_id', config.clientId);
    if (config.tokenAuthMethod === 'client_secret_post') body.set('client_secret', config.clientSecret!);
    if (config.tokenAuthMethod === 'client_secret_basic') {
      const encode = (s: string) => new URLSearchParams({ value: s }).toString().slice(6);
      headers.set('authorization', 'Basic ' + Buffer.from(encode(config.clientId) + ':' + encode(config.clientSecret!)).toString('base64'));
    }
    return headers;
  }

  async function tokens(body: URLSearchParams): Promise<Record<string, unknown>> {
    const metadata = await discovery();
    const headers = clientAuthentication(body);
    const response = await upstream(metadata.token_endpoint, { method: 'POST', headers, body });
    if (!response.ok) {
      const value: unknown = await response.json().catch(() => undefined);
      const code = record(value) ? typeof value.error === 'string' ? value.error : record(value.error) ? value.error.code : undefined : undefined;
      const terminal = body.get('grant_type') === 'refresh_token' && ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'].includes(String(code));
      throw new HttpError(terminal ? 401 : 503, terminal ? 'Reconnect ChatGPT to renew this connection.' : code === 'invalid_client' ? 'The hosted ChatGPT client configuration needs attention. Your saved connection has been preserved.' : 'ChatGPT is temporarily unavailable. Try again.');
    }
    const value: unknown = await response.json();
    if (!record(value)) throw new HttpError(502, 'ChatGPT returned an invalid authorization response.');
    return value;
  }

  async function verifyIdentity(idToken: string, expectedNonce?: string, expectedSubject?: string) {
    const metadata = await discovery();
    jwksCache ??= createRemoteJWKSet(new URL(metadata.jwks_uri), { [customFetch]: (url, options) => upstream(String(url), options), timeoutDuration: 10_000 });
    const { payload } = await jwtVerify(idToken, jwksCache, {
      issuer: metadata.issuer, audience: config.clientId, requiredClaims: ['sub', 'exp', 'iat'],
      algorithms: ['RS256', 'ES256'], clockTolerance: 5, currentDate: new Date(now()),
    });
    if (typeof payload.sub !== 'string' || !payload.sub || (expectedNonce && payload.nonce !== expectedNonce) || (expectedSubject && payload.sub !== expectedSubject)) throw new HttpError(401, 'ChatGPT identity could not be verified. Reconnect ChatGPT.');
    return payload;
  }

  function tokenFields(value: Record<string, unknown>, previousScope = '') {
    const grantedScope = typeof value.scope === 'string' ? value.scope : previousScope;
    const fields: Pick<Session, 'scope' | 'accessToken' | 'refreshToken' | 'accessExpiresAt'> = { scope: grantedScope };
    if (typeof value.access_token === 'string' && value.access_token && String(value.token_type).toLowerCase() === 'bearer') {
      const lifetime = Number(value.expires_in);
      if (!Number.isFinite(lifetime) || lifetime <= 0) throw new HttpError(502, 'ChatGPT access expiry could not be verified.');
      fields.accessToken = value.access_token;
      fields.accessExpiresAt = now() + lifetime * 1000;
    }
    if (typeof value.refresh_token === 'string' && value.refresh_token) fields.refreshToken = value.refresh_token;
    return fields;
  }

  async function sessionFor(request: Request): Promise<{ key: string; session: Session }> {
    const key = browserKey(request);
    const session = key ? await store.read(key) : undefined;
    if (!key || session?.kind !== 'session' || session.expiresAt <= now() || session.issuer !== ISSUER || session.clientId !== config.clientId) throw new HttpError(401, 'Connect ChatGPT in AI settings to continue.');
    return { key, session };
  }

  function requireWriteAccess(request: Request, session: Session) {
    const csrf = request.headers.get('x-csrf-token');
    if (request.headers.get('origin') !== config.appOrigin || !csrf || !equal(csrf, session.csrfToken)) throw new HttpError(403, 'This writing request could not be verified. Reload the app and try again.');
  }

  async function revoke(refreshToken: string): Promise<boolean> {
    try {
      const metadata = await discovery();
      if (!metadata.revocation_endpoint) return false;
      const body = new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' });
      const headers = clientAuthentication(body);
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await upstream(metadata.revocation_endpoint, { method: 'POST', headers, body });
        if (response.status === 200) return true;
        if (response.status < 500) return false;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch { /* Local disconnection still finishes when OpenAI is unavailable. */ }
    return false;
  }

  async function accessFor(key: string): Promise<Session> {
    // The distributed lease protects rotating refresh tokens across function instances.
    for (let attempt = 0; attempt < 50; attempt++) {
      const leaseId = random();
      const acquired = await store.transact<{ ready?: Session; refresh?: Session }>(key, current => {
        if (current?.kind !== 'session' || current.expiresAt <= now()) throw new HttpError(401, 'Reconnect ChatGPT in AI settings.');
        if (!hasPlan(current)) throw new HttpError(403, 'ChatGPT plan usage is not enabled. Enable it when connecting ChatGPT, or choose an existing API connection.');
        if ((current.accessExpiresAt ?? 0) > now() + 60_000) return { next: current, result: { ready: current } };
        if (!current.refreshToken) throw new HttpError(401, 'Reconnect ChatGPT to renew this connection.');
        if (current.refreshLease && current.refreshLease.until > now()) return { next: current, result: {} };
        return { next: { ...current, refreshLease: { id: leaseId, until: now() + 60_000 } }, result: { refresh: current } };
      });
      if (acquired.ready) return acquired.ready;
      if (!acquired.refresh) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
      try {
        const response = await tokens(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: acquired.refresh.refreshToken!, resource: RESOURCE }));
        const fields = tokenFields(response, acquired.refresh.scope);
        if (!fields.accessToken) throw new HttpError(401, 'Reconnect ChatGPT to renew this connection.');
        if (typeof response.id_token === 'string') await verifyIdentity(response.id_token, undefined, acquired.refresh.subject);
        const updated = await store.transact(key, current => {
          if (current?.kind !== 'session' || current.expiresAt <= now() || current.refreshLease?.id !== leaseId) return { next: current, result: undefined };
          const { refreshLease: _lease, ...rest } = current;
          const next = { ...rest, ...fields };
          return { next, result: next };
        });
        if (!updated) {
          if (fields.refreshToken) await revoke(fields.refreshToken);
          throw new HttpError(401, 'The ChatGPT connection was disconnected. Reconnect in AI settings.');
        }
        if (!hasPlan(updated)) throw new HttpError(403, 'ChatGPT plan permission is no longer available. Reconnect ChatGPT to enable it.');
        return updated;
      } catch (error) {
        await store.transact(key, current => {
          if (current?.kind !== 'session' || current.refreshLease?.id !== leaseId) return { next: current, result: undefined };
          if (error instanceof HttpError && error.status === 401) return { result: undefined };
          const { refreshLease: _lease, ...next } = current;
          return { next, result: undefined };
        });
        throw error;
      }
    }
    throw new HttpError(409, 'ChatGPT is renewing this connection. Try again in a moment.');
  }

  return async request => {
    const url = new URL(request.url);
    const path = url.pathname;
    const deadline = path === '/api/chatgpt/responses' ? AbortSignal.timeout(dependencies.responseTimeoutMs ?? 55_000) : undefined;
    try {
      validateConfig();
      if (request.method === 'GET' && path === '/api/chatgpt/session') {
        try {
          const { session } = await sessionFor(request);
          return json({ connected: true, planEnabled: hasPlan(session), account: session.account, csrfToken: session.csrfToken });
        } catch (error) { if (error instanceof HttpError && error.status === 401) return json(disconnected); throw error; }
      }

      if (request.method === 'GET' && path === '/api/chatgpt/start') {
        if ((request.headers.has('origin') && request.headers.get('origin') !== config.appOrigin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Start the ChatGPT connection from Writer’s Board settings.');
        const metadata = await discovery();
        const state = random();
        const verifier = randomBytes(64).toString('base64url');
        const browserId = random();
        const previousKey = browserKey(request);
        const previous = previousKey ? await store.read(previousKey) : undefined;
        const transaction: Transaction = {
          kind: 'transaction', expiresAt: now() + TRANSACTION_AGE, stateHash: hash(state), nonce: random(), verifier,
          ...(previous?.kind === 'session' && previous.expiresAt > now() ? { previousSessionKey: previousKey, expectedSubject: previous.subject } : {}),
        };
        await store.transact(hash(browserId), () => ({ next: transaction, result: undefined }));
        const authorization = new URL(metadata.authorization_endpoint);
        authorization.search = new URLSearchParams({
          client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code', scope: SCOPE,
          state, nonce: transaction.nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: RESOURCE,
          ...(url.searchParams.get('consent') === '1' ? { prompt: 'consent' } : {}),
        }).toString();
        return redirect(authorization.toString(), cookie(browserId, TRANSACTION_AGE / 1000));
      }

      if (request.method === 'GET' && path === '/api/chatgpt/callback') {
        try {
          const key = browserKey(request);
          const transaction = key ? await store.transact(key, current => ({ next: current?.kind === 'session' ? current : undefined, result: current?.kind === 'transaction' ? current : undefined })) : undefined;
          if (!transaction || transaction.expiresAt <= now() || !equal(transaction.stateHash, hash(url.searchParams.get('state') ?? '')) || url.searchParams.has('error') || !url.searchParams.get('code')) throw new HttpError(401, 'ChatGPT sign-in could not be verified.');
          const value = await tokens(new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!, redirect_uri: config.redirectUri, code_verifier: transaction.verifier, resource: RESOURCE }));
          if (typeof value.id_token !== 'string') throw new HttpError(401, 'ChatGPT sign-in did not return an identity.');
          const identity = await verifyIdentity(value.id_token, transaction.nonce, transaction.expectedSubject);
          const account = {
            ...(typeof identity.name === 'string' ? { name: identity.name } : {}),
            ...(typeof identity.email === 'string' ? { email: identity.email } : {}),
          };
          const newSession: Session = { kind: 'session', expiresAt: now() + SESSION_AGE, subject: identity.sub!, issuer: ISSUER, clientId: config.clientId, account, csrfToken: random(), ...tokenFields(value) };
          const newId = random();
          await store.transact(hash(newId), () => ({ next: newSession, result: undefined }));
          if (transaction.previousSessionKey) await store.transact(transaction.previousSessionKey, () => ({ result: undefined }));
          return redirect('/?chatgpt=connected', cookie(newId, SESSION_AGE / 1000));
        } catch { return redirect('/?chatgpt=error', cookie('', 0)); }
      }

      if (request.method === 'GET' && path === '/api/chatgpt/models') {
        const { key } = await sessionFor(request);
        const session = await accessFor(key);
        const response = await upstream(RESOURCE + '/models', { headers: { authorization: 'Bearer ' + session.accessToken } });
        if (!response.ok) return json({ error: { message: response.status === 401 ? 'Reconnect ChatGPT to list available models.' : 'ChatGPT could not list models for this account. Try again.' } }, response.status);
        const value: unknown = await response.json();
        if (!record(value) || !Array.isArray(value.models)) throw new HttpError(502, 'ChatGPT returned an invalid model catalog.');
        return json({ models: value.models.filter(model => record(model) && model.visibility === 'list' && typeof model.slug === 'string' && typeof model.display_name === 'string').map(model => ({ slug: model.slug, display_name: model.display_name })) });
      }

      if (request.method === 'POST' && path === '/api/chatgpt/disconnect') {
        const { key, session } = await sessionFor(request);
        requireWriteAccess(request, session);
        // Delete before network I/O so refresh finalization cannot recreate this session.
        await store.transact(key, () => ({ result: undefined }));
        const revocationConfirmed = session.refreshToken ? await revoke(session.refreshToken) : true;
        return json({ ...disconnected, revocationConfirmed, ...(!revocationConfirmed ? { warning: 'Disconnected here. Remote revocation was not confirmed; disconnect this app in ChatGPT Settings.' } : {}) }, 200, { 'set-cookie': cookie('', 0) });
      }

      if (request.method === 'POST' && path === '/api/chatgpt/responses') {
        const { key, session: initial } = await sessionFor(request);
        requireWriteAccess(request, initial);
        if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Writing requests must use JSON.');
        if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) throw new HttpError(413, 'This writing request is too large. Select a shorter passage.');
        const body = await request.text();
        if (Buffer.byteLength(body) > MAX_BODY) throw new HttpError(413, 'This writing request is too large. Select a shorter passage.');
        let value: unknown;
        try { value = JSON.parse(body); } catch { throw new HttpError(400, 'The writing request was not valid JSON.'); }
        const payload = writingPayload(value);
        const session = await accessFor(key);
        const response = await upstream(RESOURCE + '/responses', {
          method: 'POST', headers: { authorization: 'Bearer ' + session.accessToken, 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(payload), signal: AbortSignal.any([request.signal, deadline!]),
        });
        if (!response.ok) {
          // Never relay arbitrary upstream diagnostics, which may contain submitted writing or credentials.
          const raw: unknown = await response.json().catch(() => undefined);
          const code = record(raw) && record(raw.error) && typeof raw.error.code === 'string' && /^[\w-]{1,100}$/.test(raw.error.code) ? raw.error.code : undefined;
          const param = record(raw) && record(raw.error) && typeof raw.error.param === 'string' && /^[\w.[\]-]{1,150}$/.test(raw.error.param) ? raw.error.param : undefined;
          const requestId = response.headers.get('x-request-id') ?? response.headers.get('openai-request-id');
          return json({ error: {
            message: response.status === 401 ? 'Reconnect ChatGPT to continue writing.' : response.status === 429 ? 'Your ChatGPT usage limit was reached. Manage usage in ChatGPT Settings or explicitly choose another connection.' : response.status === 403 ? 'ChatGPT plan access is unavailable for this request. Check your account permissions and integration approval.' : 'ChatGPT could not complete this writing request. Try again.',
            ...(code ? { code } : {}), ...(param ? { param } : {}),
          } }, response.status, { ...(requestId ? { 'x-request-id': requestId } : {}) });
        }
        if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new HttpError(502, 'ChatGPT did not return a writing stream.');
        const stream = writingStream(response.body!, deadline!, request.signal);
        const requestId = response.headers.get('x-request-id') ?? response.headers.get('openai-request-id');
        return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'private, no-store', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff', ...(requestId ? { 'x-request-id': requestId } : {}) } });
      }
      return json({ error: { message: 'Unknown ChatGPT connection endpoint.' } }, 404);
    } catch (error) {
      if (deadline?.aborted) return json({ error: { code: 'chatgpt_timeout', message: timeoutMessage } }, 504);
      return json({ error: { message: error instanceof HttpError ? error.message : 'The ChatGPT connection is temporarily unavailable. Try again.' } }, error instanceof HttpError ? error.status : 503);
    }
  };
}
