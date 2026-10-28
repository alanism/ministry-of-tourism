// Only the hosted session cookie authenticates requests. OAuth credentials stay on the server.
export interface ChatGptSession {
  connected: boolean;
  planEnabled: boolean;
  account?: { name?: string; email?: string };
  csrfToken?: string;
}

export interface ChatGptModel {
  slug: string;
  display_name: string;
}

export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';
const ROOT = '/api/chatgpt';
export function chatGptSignInUrl(current?: ChatGptSession): string {
  return `${ROOT}/start${current?.connected && !current.planEnabled ? '?consent=1' : ''}`;
}

let session: ChatGptSession | undefined;
let pendingSession: Promise<ChatGptSession> | undefined;

async function accessFailure(response: Response): Promise<void> {
  if (response.status !== 401 && response.status !== 403) return;
  session = undefined;
  const detail = await response.clone().json().catch(() => null);
  const message = typeof detail?.error?.message === 'string' ? detail.error.message : typeof detail?.error === 'string' ? detail.error : '';
  if (response.status === 401) throw new Error('Your ChatGPT session expired. Connect ChatGPT again in AI settings.');
  throw new Error(`ChatGPT access denied${message ? `: ${message}` : '.'} Review the connection and ChatGPT plan permission in AI settings.`);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  await accessFailure(response);
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new Error('The hosted ChatGPT connection is not configured. Ask the app administrator to finish setup.');
  }
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body?.error?.message === 'string' ? body.error.message : typeof body?.error === 'string' ? body.error : `Request failed (${response.status}).`;
    throw new Error(`ChatGPT connection: ${message}`);
  }
  if (!body || typeof body !== 'object') throw new Error('The ChatGPT connection returned an invalid response. Refresh AI settings.');
  return body as Record<string, unknown>;
}

export function chatGptSession(): Promise<ChatGptSession> {
  if (!pendingSession) {
    pendingSession = fetch(`${ROOT}/session`, { credentials: 'same-origin', cache: 'no-store' })
      .then(readJson)
      .then((body) => {
        if (typeof body.connected !== 'boolean' || typeof body.planEnabled !== 'boolean') throw new Error('The ChatGPT connection returned an invalid session. Refresh AI settings.');
        session = body as unknown as ChatGptSession;
        return session;
      })
      .catch((error: unknown) => { session = undefined; throw error; })
      .finally(() => { pendingSession = undefined; });
  }
  return pendingSession;
}

export async function chatGptModels(): Promise<ChatGptModel[]> {
  const body = await readJson(await fetch(`${ROOT}/models`, { credentials: 'same-origin', cache: 'no-store' }));
  if (!Array.isArray(body.models) || !body.models.every((model: unknown) => model && typeof model === 'object' && 'slug' in model && typeof model.slug === 'string' && model.slug.trim() && 'display_name' in model && typeof model.display_name === 'string')) {
    throw new Error('The ChatGPT connection returned an invalid model list. Refresh models in AI settings.');
  }
  return body.models as ChatGptModel[];
}

async function requireSession(planRequired: boolean): Promise<ChatGptSession & { csrfToken: string }> {
  const current = session ?? await chatGptSession();
  if (!current.connected) throw new Error('Connect ChatGPT in AI settings before using your ChatGPT plan.');
  if (planRequired && !current.planEnabled) throw new Error('Sign in again and grant permission to use your ChatGPT plan in AI settings.');
  if (!current.csrfToken) throw new Error('Your ChatGPT session could not be verified. Refresh AI settings and connect again.');
  return current as ChatGptSession & { csrfToken: string };
}

export async function sendChatGptResponse(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  const current = await requireSession(true);
  signal?.throwIfAborted();
  const response = await fetch(`${ROOT}/responses`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-csrf-token': current.csrfToken }, body: JSON.stringify(body), signal,
  });
  await accessFailure(response);
  return response;
}

export async function disconnectChatGpt(): Promise<{ warning?: string }> {
  const current = await requireSession(false);
  const result = await readJson(await fetch(`${ROOT}/disconnect`, { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': current.csrfToken } }));
  session = undefined;
  return typeof result.warning === 'string' ? { warning: result.warning } : {};
}
