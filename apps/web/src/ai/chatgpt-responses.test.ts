import { describe, expect, it, vi } from 'vitest';
import { ChatGptError, chatGptResponse } from './chatgpt-responses';

const request = { model: 'available-model', instructions: 'Help the writer.', input: [{ role: 'user', content: 'Read this.' }] };
const message = (text: string) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
const event = (type: string, response: unknown) => `event: ${type}\r\ndata: ${JSON.stringify({ type, response })}\r\n\r\n`;
const completed = (output: unknown[]) => event('response.completed', { status: 'completed', output });

function stream(source: string, byteLength = 7): Response {
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += byteLength) controller.enqueue(bytes.slice(offset, offset + byteLength));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'request-123' } });
}

describe('ChatGPT Responses transport', () => {
  it('sends the supported stateless streaming contract and JSON format', async () => {
    const send = vi.fn(async () => stream(completed([message('{"summary":"Works"}')])));
    const signal = new AbortController().signal;
    const format = { name: 'analysis', schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false } };
    const result = await chatGptResponse(send, { ...request, format, effort: 'high' }, signal);
    expect(send).toHaveBeenCalledExactlyOnceWith({
      ...request, store: false, stream: true, reasoning: { effort: 'high' },
      text: { format: { type: 'json_schema', ...format, strict: true } },
    }, signal);
    expect(result.text).toBe('{"summary":"Works"}');
  });

  it('handles split UTF-8, CRLF, comments, and multiline SSE data and trusts completed output', async () => {
    const output = [{ type: 'reasoning', id: 'reason-1', encrypted_content: 'preserved' }, message('Café 🖋️')];
    const data = JSON.stringify({ type: 'response.completed', response: { status: 'completed', output } });
    const source = ': keepalive\r\n\r\ndata: {"type":"response.output_text.delta","delta":"partial"}\r\n\r\n'
      + `event: response.completed\r\ndata: ${data.slice(0, data.indexOf('"response"'))}\r\ndata: ${data.slice(data.indexOf('"response"'))}\r\n\r\n`;
    expect(await chatGptResponse(async () => stream(source, 1), request)).toEqual({ text: 'Café 🖋️', output, calls: [] });
  });

  it('groups function tools in a namespace and returns only valid requested calls', async () => {
    const tool = { name: 'suggest_card', description: 'Suggest a card.', parameters: { type: 'object', properties: { title: { type: 'string' } } } };
    const output = [{ type: 'function_call', call_id: 'call-1', namespace: 'writers_board', name: tool.name, arguments: '{"title":"Opening"}', status: 'completed' }];
    const send = vi.fn(async (_body: Record<string, unknown>) => stream(completed(output)));
    const result = await chatGptResponse(send, { ...request, tools: [tool] });
    expect(send.mock.calls[0]?.[0]).toMatchObject({ tools: [{ type: 'namespace', name: 'writers_board', tools: [{ type: 'function', ...tool }] }] });
    expect(result).toEqual({ text: '', output, calls: [{ id: 'call-1', name: tool.name, input: { title: 'Opening' } }] });
  });

  it.each([
    ['namespace', { namespace: 'another_app', name: 'suggest_card', arguments: '{}' }],
    ['unknown function', { namespace: 'writers_board', name: 'delete_everything', arguments: '{}' }],
    ['invalid arguments', { namespace: 'writers_board', name: 'suggest_card', arguments: '{' }],
  ])('rejects a tool call with %s before returning actions', async (_, call) => {
    const tools = [{ name: 'suggest_card', description: '', parameters: {} }];
    await expect(chatGptResponse(async () => stream(completed([{ type: 'function_call', call_id: 'call-1', ...call }])), { ...request, tools })).rejects.toBeInstanceOf(ChatGptError);
  });

  it.each([
    ['an interrupted stream', 'data: {"type":"response.output_text.delta","delta":"Almost"}\n\n', /ended before.*completed/i],
    ['an incomplete response', event('response.incomplete', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }), /cut off.*shorter/i],
    ['a wrong completed status', event('response.completed', { status: 'in_progress', output: [message('Partial')] }), /not complete/i],
    ['a refusal', completed([{ type: 'message', content: [{ type: 'refusal', refusal: 'Declined' }] }]), /declined/i],
    ['malformed stream data', 'data: broken\n\n', /invalid.*stream/i],
  ])('rejects %s', async (_, source, pattern) => {
    await expect(chatGptResponse(async () => stream(source), request)).rejects.toThrow(pattern);
  });

  it('does not accept partial text when usage fails after streaming begins', async () => {
    const error = { code: 'subscription_sharing_usage_limit_exceeded', message: 'App usage limit reached.', param: 'model' };
    const source = 'data: {"type":"response.output_text.delta","delta":"Incomplete"}\n\n' + event('response.failed', { status: 'failed', error });
    const failure = await chatGptResponse(async () => stream(source), request).catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(ChatGptError);
    expect(failure).toMatchObject({ code: error.code, param: 'model', requestId: 'request-123' });
    expect((failure as Error).message).toContain('https://chatgpt.com/settings/usage');
    expect((failure as Error).message).toContain('App usage limit reached.');
  });

  it('preserves direct-admission diagnostics and response request IDs', async () => {
    const failure = await chatGptResponse(async () => new Response('{"detail":"Serving region is restricted"}', {
      status: 403, headers: { 'x-request-id': 'request-policy' },
    }), request).catch((caught: unknown) => caught);
    expect(failure).toMatchObject({ status: 403, requestId: 'request-policy', body: { detail: 'Serving region is restricted' } });
    expect((failure as Error).message).toMatch(/403.*Serving region is restricted/);
  });

  it('describes unavailable usage as retryable without erasing credentials or returning partial text', async () => {
    const error = { code: 'subscription_sharing_usage_unavailable', message: 'Could not check usage.' };
    await expect(chatGptResponse(async () => stream(event('response.failed', { error })), request)).rejects.toThrow(/try again later/i);
  });

  it('preserves structured top-level stream errors', async () => {
    const source = `data: ${JSON.stringify({ type: 'error', code: 'subscription_sharing_unsupported_capability', param: 'tools', message: 'Unsupported tool.' })}\n\n`;
    await expect(chatGptResponse(async () => stream(source), request)).rejects.toMatchObject({
      code: 'subscription_sharing_unsupported_capability', param: 'tools', requestId: 'request-123',
    });
  });

  it('rejects system-role history before sending an unsupported request', async () => {
    const send = vi.fn(async () => stream(completed([])));
    await expect(chatGptResponse(send, { ...request, input: [{ role: 'system', content: 'Guidance' }] })).rejects.toThrow(/instructions/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('cancels a pending stream when the writer aborts', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const pending = chatGptResponse(async () => new Response(new ReadableStream({ cancel })), request, controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('passes cancellation through to the sender', async () => {
    const controller = new AbortController();
    const send = vi.fn(async (_body: Record<string, unknown>, signal?: AbortSignal) => {
      signal?.throwIfAborted();
      return stream(completed([message('Done')]));
    });
    controller.abort();
    await expect(chatGptResponse(send, request, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
