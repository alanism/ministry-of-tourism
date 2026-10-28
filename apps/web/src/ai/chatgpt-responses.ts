// ChatGPT plan usage is stateless: only completed Responses output can be used
// as an answer or carried into the next turn. The caller owns OAuth transport.
export interface ChatGptRequest {
  model: string;
  instructions: string;
  input: unknown[];
  format?: { name: string; schema: Record<string, unknown> };
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
  effort?: 'low' | 'medium' | 'high';
}

interface ErrorDetails {
  status?: number;
  code?: string;
  param?: string;
  requestId?: string;
  body?: unknown;
}

export class ChatGptError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly param?: string;
  readonly requestId?: string;
  readonly body?: unknown;

  constructor(message: string, details: ErrorDetails = {}) {
    super(message);
    this.name = 'ChatGptError';
    Object.assign(this, details);
  }
}

const NAMESPACE = 'writers_board';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

function responseError(body: unknown, details: ErrorDetails): ChatGptError {
  const value = record(body);
  const error = record(value.error);
  const code = typeof error.code === 'string' ? error.code : typeof value.code === 'string' ? value.code : undefined;
  const param = typeof error.param === 'string' ? error.param : typeof value.param === 'string' ? value.param : undefined;
  const diagnostic = typeof error.message === 'string' ? error.message
    : typeof value.detail === 'string' ? value.detail
      : typeof value.message === 'string' ? value.message : '';
  let recovery = '';
  if (code === 'subscription_sharing_usage_limit_exceeded') recovery = ' ChatGPT plan usage has reached a limit. Review usage at https://chatgpt.com/settings/usage before making another request.';
  else if (code === 'subscription_sharing_usage_unavailable' || code === 'subscription_sharing_user_unavailable') recovery = ' ChatGPT plan usage is temporarily unavailable; try again later.';
  else if (code === 'subscription_sharing_user_not_eligible') recovery = ' ChatGPT plan usage is unavailable for this account or workspace. Check the selected account in AI settings.';
  else if (details.status === 401) recovery = ' Check the selected ChatGPT account and granted permissions in AI settings.';
  return new ChatGptError(`ChatGPT${details.status ? ` error ${details.status}` : ' request failed'}${diagnostic ? `: ${diagnostic}` : code ? `: ${code}` : '.'}${recovery}`, { ...details, code, param, body });
}

export async function chatGptResponse(
  send: (body: Record<string, unknown>, signal?: AbortSignal) => Promise<Response>,
  request: ChatGptRequest,
  signal?: AbortSignal,
): Promise<{ text: string; output: unknown[]; calls: { id: string; name: string; input: unknown }[] }> {
  signal?.throwIfAborted();
  if (request.input.some((item) => record(item).role === 'system')) throw new ChatGptError('Use instructions for ChatGPT system guidance.');
  const response = await send({
    model: request.model,
    instructions: request.instructions,
    input: request.input,
    store: false,
    stream: true,
    ...(request.format ? { text: { format: { type: 'json_schema', ...request.format, strict: true } } } : {}),
    ...(request.tools?.length ? { tools: [{
      type: 'namespace', name: NAMESPACE, description: "Tools for the writer's board.",
      tools: request.tools.map((tool) => ({ type: 'function', ...tool, strict: false })),
    }] } : {}),
    ...(request.effort ? { reasoning: { effort: request.effort } } : {}),
  }, signal);
  const details = { status: response.status, requestId: response.headers.get('x-request-id') ?? undefined };
  if (!response.ok) {
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { detail: text }; }
    throw responseError(body, details);
  }
  if (!response.body) throw new ChatGptError('ChatGPT returned no response stream.', details);

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let data: string[] = [];
  const handleEvent = () => {
    if (!data.length) return;
    const source = data.join('\n');
    data = [];
    if (source === '[DONE]') return;
    let event: Record<string, unknown>;
    try { event = record(JSON.parse(source)); } catch { throw new ChatGptError('ChatGPT returned invalid response stream data.', details); }
    if (event.type === 'error') throw responseError(event, details);
    if (event.type === 'response.failed') throw responseError(event.response, details);
    if (event.type === 'response.incomplete') throw new ChatGptError('The ChatGPT answer was cut off; try a shorter piece.', details);
    if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') throw new ChatGptError('ChatGPT declined this request.', details);
    if (event.type !== 'response.completed') return;
    const completed = record(event.response);
    if (completed.status !== 'completed') throw new ChatGptError('The ChatGPT response is not complete.', details);
    if (!Array.isArray(completed.output)) throw new ChatGptError('ChatGPT returned no completed output.', details);
    const output: unknown[] = completed.output;
    let text = '';
    const calls: { id: string; name: string; input: unknown }[] = [];
    for (const item of output) {
      const value = record(item);
      if (value.status === 'incomplete' || value.status === 'in_progress') throw new ChatGptError('The ChatGPT response is not complete.', details);
      if (value.type === 'message' && Array.isArray(value.content)) {
        for (const part of value.content) {
          const content = record(part);
          if (content.type === 'refusal') throw new ChatGptError('ChatGPT declined this request.', details);
          if (content.type === 'output_text' && typeof content.text === 'string') text += content.text;
        }
      }
      if (value.type === 'function_call') {
        if (value.namespace !== NAMESPACE || typeof value.name !== 'string' || !request.tools?.some((tool) => tool.name === value.name)
          || typeof value.call_id !== 'string' || !value.call_id || typeof value.arguments !== 'string') {
          throw new ChatGptError('ChatGPT returned an invalid board tool call.', details);
        }
        let input: unknown;
        try { input = JSON.parse(value.arguments); } catch { throw new ChatGptError('ChatGPT returned invalid board tool arguments.', details); }
        calls.push({ id: value.call_id, name: value.name, input });
      }
    }
    return { text, output, calls };
  };
  const handleLine = (line: string) => {
    if (!line) return handleEvent();
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  };
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let newline: RegExpExecArray | null;
      while ((newline = /\r\n|\r|\n/.exec(buffer))) {
        // A CR at a chunk boundary may be the first half of CRLF.
        if (!done && newline[0] === '\r' && newline.index === buffer.length - 1) break;
        const line = buffer.slice(0, newline.index);
        buffer = buffer.slice(newline.index + newline[0].length);
        const result = handleLine(line);
        if (result) return result;
      }
      if (done) {
        if (buffer) handleLine(buffer);
        const result = handleEvent();
        if (result) return result;
        throw new ChatGptError('The ChatGPT stream ended before response.completed. Try again.', details);
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
