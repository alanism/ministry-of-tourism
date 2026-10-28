import { afterEach, describe, expect, it, vi } from 'vitest';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const connected = { connected: true, planEnabled: true, account: { name: 'Writer' }, csrfToken: 'session-csrf' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('hosted ChatGPT connection', () => {
  it('requests consent explicitly when signed in without ChatGPT plan permission', async () => {
    const { chatGptSignInUrl } = await import('./chatgpt-connection');
    expect(chatGptSignInUrl({ connected: true, planEnabled: false })).toBe('/api/chatgpt/start?consent=1');
    expect(chatGptSignInUrl({ connected: false, planEnabled: false })).toBe('/api/chatgpt/start');
    expect(chatGptSignInUrl()).toBe('/api/chatgpt/start');
  });

  it('deduplicates simultaneous session reads and uses same-origin cookies without storing credentials', async () => {
    const storage = { setItem: vi.fn(), getItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const fetch = vi.fn(async () => json(connected));
    vi.stubGlobal('fetch', fetch);
    const { chatGptSession } = await import('./chatgpt-connection');
    expect(await Promise.all([chatGptSession(), chatGptSession()])).toEqual([connected, connected]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/chatgpt/session', { credentials: 'same-origin', cache: 'no-store' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('gets the signed-in account model catalog without a hard-coded fallback', async () => {
    const models = [{ slug: 'account-model', display_name: 'Account model' }];
    const fetch = vi.fn(async () => json({ models }));
    vi.stubGlobal('fetch', fetch);
    const { chatGptModels } = await import('./chatgpt-connection');
    expect(await chatGptModels()).toEqual(models);
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/chatgpt/models', { credentials: 'same-origin', cache: 'no-store' });
  });

  it('sends responses with an in-memory CSRF token, cookies, and cancellation', async () => {
    const response = new Response('data: streaming\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    const fetch = vi.fn().mockResolvedValueOnce(json(connected)).mockResolvedValueOnce(response);
    vi.stubGlobal('fetch', fetch);
    const { sendChatGptResponse } = await import('./chatgpt-connection');
    const body = { model: 'account-model', input: 'Help with this essay.', store: false, stream: true };
    const signal = new AbortController().signal;
    expect(await sendChatGptResponse(body, signal)).toBe(response);
    expect(fetch).toHaveBeenLastCalledWith('/api/chatgpt/responses', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-csrf-token': connected.csrfToken }, body: JSON.stringify(body), signal,
    });
  });

  it.each([
    [{ connected: false, planEnabled: false }, /connect ChatGPT.*settings/i],
    [{ connected: true, planEnabled: false, csrfToken: 'csrf' }, /permission.*ChatGPT plan/i],
    [{ connected: true, planEnabled: true }, /session.*refresh/i],
  ])('never sends writing without an eligible session: %s', async (session, message) => {
    const fetch = vi.fn(async () => json(session));
    vi.stubGlobal('fetch', fetch);
    const { sendChatGptResponse } = await import('./chatgpt-connection');
    await expect(sendChatGptResponse({ input: 'Private essay' })).rejects.toThrow(message);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clears stale CSRF after an expired session without retrying the writing request', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(connected)).mockResolvedValueOnce(json({ error: { message: 'Expired' } }, 401)).mockResolvedValueOnce(json({ ...connected, csrfToken: 'new-csrf' })).mockResolvedValueOnce(new Response('stream'));
    vi.stubGlobal('fetch', fetch);
    const { sendChatGptResponse } = await import('./chatgpt-connection');
    await expect(sendChatGptResponse({ input: 'Essay' })).rejects.toThrow(/expired.*connect.*settings/i);
    await sendChatGptResponse({ input: 'Try after reconnecting' });
    expect(fetch.mock.calls.map((call) => call[0])).toEqual(['/api/chatgpt/session', '/api/chatgpt/responses', '/api/chatgpt/session', '/api/chatgpt/responses']);
    expect(fetch.mock.calls[3]?.[1].headers['x-csrf-token']).toBe('new-csrf');
  });

  it('returns usage and provider failures untouched for the Responses error handler', async () => {
    const failure = json({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }, 429);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(connected)).mockResolvedValueOnce(failure));
    const { sendChatGptResponse } = await import('./chatgpt-connection');
    expect(await sendChatGptResponse({ input: 'Essay' })).toBe(failure);
  });

  it('disconnects with CSRF and forgets the in-memory token', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(connected)).mockResolvedValueOnce(json({ warning: 'Remove the app in ChatGPT settings to revoke all access.' })).mockResolvedValueOnce(json({ connected: false, planEnabled: false }));
    vi.stubGlobal('fetch', fetch);
    const { chatGptSession, disconnectChatGpt, sendChatGptResponse } = await import('./chatgpt-connection');
    await chatGptSession();
    expect(await disconnectChatGpt()).toEqual({ warning: 'Remove the app in ChatGPT settings to revoke all access.' });
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/chatgpt/disconnect', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': connected.csrfToken } });
    await expect(sendChatGptResponse({ input: 'Essay' })).rejects.toThrow(/connect ChatGPT/i);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('shows access failures without silently choosing an API-key provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(connected)).mockResolvedValueOnce(json({ error: { message: 'Plan permission was removed.' } }, 403)));
    const { sendChatGptResponse } = await import('./chatgpt-connection');
    await expect(sendChatGptResponse({ input: 'Essay' })).rejects.toThrow(/plan permission was removed.*settings/i);
  });

  it('reports an unavailable hosted deployment with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } })));
    const { chatGptSession } = await import('./chatgpt-connection');
    await expect(chatGptSession()).rejects.toThrow(/ChatGPT connection.*not configured/i);
  });
});

describe('text-only ChatGPT setting', () => {
  it('offers ChatGPT for writing jobs without adding a key, speech engine, or changing voice/art defaults', async () => {
    const { PROVIDERS, KEY_LABELS, SPEECH_ENGINES, aiSettings } = await import('./settings');
    expect(PROVIDERS).toHaveProperty('chatgpt.label', 'ChatGPT plan');
    expect(KEY_LABELS).not.toHaveProperty('chatgpt');
    expect(SPEECH_ENGINES).not.toHaveProperty('chatgpt');
    expect(aiSettings().voice).toMatchObject({ listen: 'browser', speak: 'browser', liveModel: 'gpt-live-1' });
    expect(aiSettings().storyboard.model).toBe('google/gemini-2.5-flash-image');
    expect(Object.values(aiSettings().jobs).every((job) => job.provider === 'anthropic')).toBe(true);
  });
});
