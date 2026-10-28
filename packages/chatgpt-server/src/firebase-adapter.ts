import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';

const MAX_BODY = 2 * 1024 * 1024;
type FirebaseRequest = IncomingMessage & { rawBody?: Buffer; originalUrl?: string };

/** Keep the Firebase/Express boundary small; the OAuth handler uses standard web requests. */
export async function serveChatGPT(
  incoming: FirebaseRequest,
  outgoing: ServerResponse,
  handler: (request: Request) => Promise<Response>,
  appOrigin: string,
): Promise<void> {
  const abort = new AbortController();
  const close = () => { if (!outgoing.writableFinished) abort.abort(); };
  incoming.once('aborted', close);
  outgoing.once('close', close);
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    let body: Buffer | undefined;
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      if (Number(incoming.headers['content-length'] ?? 0) > MAX_BODY || (incoming.rawBody?.byteLength ?? 0) > MAX_BODY) {
        outgoing.writeHead(413, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
        outgoing.end(JSON.stringify({ error: { message: 'This writing request is too large. Select a shorter passage.' } }));
        incoming.resume();
        return;
      }
      if (incoming.rawBody !== undefined) body = incoming.rawBody;
      else {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of incoming) {
          const value: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += value.byteLength;
          if (length > MAX_BODY) {
            outgoing.writeHead(413, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
            outgoing.end(JSON.stringify({ error: { message: 'This writing request is too large. Select a shorter passage.' } }));
            return;
          }
          chunks.push(value);
        }
        body = Buffer.concat(chunks);
      }
    }
    const path = incoming.originalUrl ?? incoming.url ?? '/';
    const request = new Request(appOrigin + (path.startsWith('/') ? path : '/'), {
      method: incoming.method, headers, signal: abort.signal,
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
    const response = await handler(request);
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    outgoing.statusCode = response.status;
    outgoing.flushHeaders();
    if (response.body) {
      const reader = response.body.getReader();
      const cancel = () => { if (!outgoing.writableFinished) void reader.cancel().catch(() => {}); };
      outgoing.once('close', cancel);
      try {
        while (!abort.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!outgoing.write(chunk.value)) await Promise.race([once(outgoing, 'drain'), once(outgoing, 'close')]);
        }
      } finally {
        outgoing.off('close', cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    outgoing.end();
  } catch {
    if (!outgoing.headersSent) {
      outgoing.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'private, no-store' });
      outgoing.end(JSON.stringify({ error: { message: 'The ChatGPT connection is temporarily unavailable. Try again.' } }));
    } else outgoing.destroy();
  } finally {
    incoming.off('aborted', close);
    outgoing.off('close', close);
  }
}
